import { and, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import {
  accountTokens,
  brands,
  campaigns,
  creators,
  pendingSignups,
  userSessions,
  users,
} from "@/backend/db/schema";

export type AccountTokenPurpose = "password_reset" | "email_verification" | "email_change";

export const ACCOUNT_TOKEN_TTLS: Record<AccountTokenPurpose, number> = {
  password_reset: 30 * 60_000,
  email_verification: 24 * 60 * 60_000,
  email_change: 30 * 60_000,
};
export const ACCOUNT_TOKEN_RESEND_COOLDOWN_MS = 60_000;
export const ACCOUNT_TOKEN_MAX_EMAIL_SENDS = 5;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const enc = new TextEncoder();

type AccountUser = { id: string; name: string; email: string; role: string };

export type AccountTokenClaim =
  | {
      kind: "send";
      tokenId: string;
      token: string;
      tokenHash: string;
      expiresAt: Date;
      recipientEmail: string;
      user: AccountUser;
    }
  | { kind: "none" }
  | { kind: "email_unavailable" };

function toB64url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createAccountToken() {
  return toB64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function isAccountToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export async function hashAccountToken(purpose: AccountTokenPurpose, token: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`yl_account_token:${purpose}:${token}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function appBase(req: Request) {
  const requestOrigin = new URL(req.url).origin;
  const configured = process.env.APP_URL?.trim();
  if (!configured) return requestOrigin;
  try {
    return new URL(configured).origin;
  } catch {
    return requestOrigin;
  }
}

export function buildAccountActionUrl(req: Request, purpose: AccountTokenPurpose, token: string) {
  const path = purpose === "password_reset" ? "/reset-password" : "/verify-account-email";
  const url = new URL(path, appBase(req));
  const params = new URLSearchParams({ token });
  if (purpose !== "password_reset") params.set("kind", purpose === "email_change" ? "change" : "verify");
  // A fragment is not sent to the web server, keeping the one-time token out
  // of ordinary request logs. The page reads it and clears the address bar.
  url.hash = params.toString();
  return url.toString();
}

export function buildAccountSettingsUrl(req: Request) {
  return new URL("/account", appBase(req)).toString();
}

export function buildLoginUrl(req: Request) {
  return new URL("/login", appBase(req)).toString();
}

/**
 * Reserve one email send for an account action. An active row is reused, so
 * requesting a replacement link automatically invalidates the previous one.
 */
export async function claimAccountToken({
  userId,
  purpose,
  targetEmail,
}: {
  userId: string;
  purpose: AccountTokenPurpose;
  targetEmail?: string | null;
}): Promise<AccountTokenClaim> {
  const token = createAccountToken();
  const tokenHash = await hashAccountToken(purpose, token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCOUNT_TOKEN_TTLS[purpose]);

  // Opportunistically remove abandoned hashes. The unique user/purpose row
  // for this caller is handled transactionally below.
  await db.delete(accountTokens).where(and(lt(accountTokens.expiresAt, now), isNull(accountTokens.usedAt)));

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    if (!user) return { kind: "none" } as const;

    const effectiveTargetEmail =
      purpose === "password_reset" ? null : purpose === "email_verification" ? user.email : targetEmail?.toLowerCase().trim() || null;
    if (purpose === "email_change" && !effectiveTargetEmail) return { kind: "none" } as const;

    if (purpose === "email_change" && effectiveTargetEmail) {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, effectiveTargetEmail), ne(users.id, user.id)))
        .limit(1);
      if (existing) return { kind: "email_unavailable" } as const;
    }

    const [existingToken] = await tx
      .select()
      .from(accountTokens)
      .where(and(eq(accountTokens.userId, user.id), eq(accountTokens.purpose, purpose)))
      .limit(1)
      .for("update");

    const active = Boolean(existingToken && !existingToken.usedAt && existingToken.expiresAt.getTime() > now.getTime());
    if (existingToken && active) {
      const inCooldown = now.getTime() - existingToken.lastEmailAttemptAt.getTime() < ACCOUNT_TOKEN_RESEND_COOLDOWN_MS;
      if (inCooldown || existingToken.emailSendCount >= ACCOUNT_TOKEN_MAX_EMAIL_SENDS) {
        return { kind: "none" } as const;
      }
    }

    const values = {
      userId: user.id,
      purpose,
      tokenHash,
      targetEmail: effectiveTargetEmail,
      expiresAt,
      usedAt: null,
      emailSendCount: active && existingToken ? existingToken.emailSendCount + 1 : 1,
      lastEmailAttemptAt: now,
      lastEmailSentAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const [saved] = existingToken
      ? await tx.update(accountTokens).set(values).where(eq(accountTokens.id, existingToken.id)).returning({ id: accountTokens.id })
      : await tx.insert(accountTokens).values(values).returning({ id: accountTokens.id });

    return {
      kind: "send",
      tokenId: saved.id,
      token,
      tokenHash,
      expiresAt,
      recipientEmail: effectiveTargetEmail ?? user.email,
      user,
    } as const;
  });
}

export async function claimPasswordResetByEmail(email: string): Promise<AccountTokenClaim> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { kind: "none" };
  return claimAccountToken({ userId: user.id, purpose: "password_reset" });
}

export async function markAccountTokenEmailSent(tokenId: string, tokenHash: string) {
  const now = new Date();
  await db
    .update(accountTokens)
    .set({ lastEmailSentAt: now, updatedAt: now })
    .where(and(eq(accountTokens.id, tokenId), eq(accountTokens.tokenHash, tokenHash)));
}

export async function invalidateAccountToken(userId: string, purpose: AccountTokenPurpose) {
  const now = new Date();
  const rows = await db
    .update(accountTokens)
    .set({ usedAt: now, updatedAt: now })
    .where(and(eq(accountTokens.userId, userId), eq(accountTokens.purpose, purpose), isNull(accountTokens.usedAt)))
    .returning({ id: accountTokens.id });
  return rows.length > 0;
}

export type PasswordResetCompletion =
  | { kind: "reset"; user: AccountUser }
  | { kind: "invalid" };

export async function consumePasswordResetToken(token: string, newPasswordHash: string): Promise<PasswordResetCompletion> {
  const tokenHash = await hashAccountToken("password_reset", token);

  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(accountTokens).where(eq(accountTokens.tokenHash, tokenHash)).limit(1).for("update");
    const now = new Date();
    if (!record || record.purpose !== "password_reset" || record.usedAt || record.expiresAt.getTime() <= now.getTime()) {
      return { kind: "invalid" } as const;
    }

    const [user] = await tx.select().from(users).where(eq(users.id, record.userId)).limit(1).for("update");
    if (!user) return { kind: "invalid" } as const;

    const [updated] = await tx
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        // Successfully using a link sent only to the account address proves
        // current control of that inbox, including for grandfathered users.
        emailVerifiedAt: user.emailVerifiedAt ?? now,
        tokenVersion: user.tokenVersion + 1,
      })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    await tx
      .update(accountTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(accountTokens.userId, user.id));
    await tx
      .update(userSessions)
      .set({ revokedAt: now })
      .where(and(eq(userSessions.userId, user.id), isNull(userSessions.revokedAt)));

    return { kind: "reset", user: updated } as const;
  });
}

export type EmailVerificationCompletion =
  | { kind: "verified"; user: AccountUser }
  | { kind: "invalid" };

export async function consumeEmailVerificationToken(token: string): Promise<EmailVerificationCompletion> {
  const tokenHash = await hashAccountToken("email_verification", token);

  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(accountTokens).where(eq(accountTokens.tokenHash, tokenHash)).limit(1).for("update");
    const now = new Date();
    if (!record || record.purpose !== "email_verification" || record.usedAt || record.expiresAt.getTime() <= now.getTime()) {
      return { kind: "invalid" } as const;
    }

    const [user] = await tx.select().from(users).where(eq(users.id, record.userId)).limit(1).for("update");
    if (!user || !record.targetEmail || record.targetEmail !== user.email) return { kind: "invalid" } as const;

    const [updated] = await tx
      .update(users)
      .set({ emailVerifiedAt: user.emailVerifiedAt ?? now })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
    await tx
      .update(accountTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(accountTokens.id, record.id));

    return { kind: "verified", user: updated } as const;
  });
}

export type EmailChangeCompletion =
  | { kind: "changed"; user: AccountUser; oldEmail: string; newEmail: string }
  | { kind: "email_unavailable" }
  | { kind: "invalid" };

export async function consumeEmailChangeToken(token: string): Promise<EmailChangeCompletion> {
  const tokenHash = await hashAccountToken("email_change", token);

  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(accountTokens).where(eq(accountTokens.tokenHash, tokenHash)).limit(1).for("update");
    const now = new Date();
    if (!record || record.purpose !== "email_change" || record.usedAt || record.expiresAt.getTime() <= now.getTime() || !record.targetEmail) {
      return { kind: "invalid" } as const;
    }

    // Use the same advisory-lock namespace as signup completion for this
    // address, preventing a race between an email change and a new signup.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"signup:" + record.targetEmail}, 0))`);

    const [user] = await tx.select().from(users).where(eq(users.id, record.userId)).limit(1).for("update");
    if (!user || user.email === record.targetEmail) {
      await tx.update(accountTokens).set({ usedAt: now, updatedAt: now }).where(eq(accountTokens.id, record.id));
      return { kind: "invalid" } as const;
    }

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, record.targetEmail), ne(users.id, user.id)))
      .limit(1);
    if (existing) {
      await tx.update(accountTokens).set({ usedAt: now, updatedAt: now }).where(eq(accountTokens.id, record.id));
      return { kind: "email_unavailable" } as const;
    }

    const oldEmail = user.email;
    const newEmail = record.targetEmail;
    const [updated] = await tx
      .update(users)
      .set({ email: newEmail, emailVerifiedAt: now, tokenVersion: user.tokenVersion + 1 })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    // Keep profile/listing contact addresses in sync only where they were
    // still using the old account address; a deliberately different public
    // contact address remains untouched.
    await tx.update(brands).set({ email: newEmail }).where(and(eq(brands.userId, user.id), eq(brands.email, oldEmail)));
    await tx.update(creators).set({ email: newEmail }).where(and(eq(creators.userId, user.id), eq(creators.email, oldEmail)));
    await tx.update(campaigns).set({ email: newEmail }).where(and(eq(campaigns.ownerId, user.id), eq(campaigns.email, oldEmail)));
    await tx.delete(pendingSignups).where(eq(pendingSignups.email, newEmail));

    await tx
      .update(accountTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(accountTokens.userId, user.id));
    await tx
      .update(userSessions)
      .set({ revokedAt: now })
      .where(and(eq(userSessions.userId, user.id), isNull(userSessions.revokedAt)));

    return { kind: "changed", user: updated, oldEmail, newEmail } as const;
  });
}
