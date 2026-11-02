import { and, eq, lt, sql } from "drizzle-orm";
import type { UserSessionRecord } from "@/backend/auth";
import { db } from "@/backend/db";
import { brands, creators, pendingSignups, userSessions, users } from "@/backend/db/schema";
import { DEFAULT_RETURN_TO, safeReturnTo } from "@/shared/return-to";

export const PENDING_SIGNUP_TTL_MS = 30 * 60_000;
export const PENDING_SIGNUP_RESEND_COOLDOWN_MS = 60_000;
export const PENDING_SIGNUP_MAX_EMAIL_SENDS = 5;
export const PENDING_SIGNUP_MAX_VERIFICATION_ATTEMPTS = 5;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const enc = new TextEncoder();

export type PendingSignupClaim =
  | { kind: "send"; pendingId: string; token: string; tokenHash: string }
  | { kind: "none" };

export type PendingSignupCompletion =
  | { kind: "created"; user: { id: string; name: string; email: string; role: string } }
  | { kind: "invalid" }
  | { kind: "already_registered" };

type SignupDetails = {
  name: string;
  email: string;
  phone: string | null;
  role: "brand" | "creator";
  passwordHash: string;
};

function toB64url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createSignupVerificationToken() {
  return toB64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function isSignupVerificationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export async function hashSignupVerificationToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`yl_signup_verification:${token}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildSignupVerificationUrl(req: Request, token: string, returnTo?: unknown) {
  const requestOrigin = new URL(req.url).origin;
  let base = requestOrigin;
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      base = new URL(configured).origin;
    } catch {
      base = requestOrigin;
    }
  }

  const url = new URL("/verify-email", base);
  // The fragment is not sent to the web server, keeping the one-time token
  // out of ordinary request logs. The client page reads and clears it. A
  // separately validated same-site return path can travel beside the token
  // so completing signup resumes the journey that required an account.
  const fragment = new URLSearchParams({ token });
  const destination = safeReturnTo(returnTo, "");
  if (destination && destination !== DEFAULT_RETURN_TO) fragment.set("returnTo", destination);
  url.hash = fragment.toString();
  return url.toString();
}

function isUniqueViolation(error: unknown, constraints: Set<string>, detailFragments: string[]): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; constraint?: unknown; detail?: unknown; cause?: unknown };
    if (record.code === "23505") {
      const constraint = typeof record.constraint === "string" ? record.constraint : "";
      const detail = typeof record.detail === "string" ? record.detail : "";
      if (constraints.has(constraint) || detailFragments.some((fragment) => detail.includes(fragment))) return true;
    }
    current = record.cause;
  }
  return false;
}

export function isPendingSignupUniqueViolation(error: unknown): boolean {
  return isUniqueViolation(
    error,
    new Set(["pending_signups_email_key", "pending_signups_email_lower_key", "pending_signups_token_hash_key"]),
    ["(email)=", "(token_hash)="],
  );
}

export function isUserEmailUniqueViolation(error: unknown): boolean {
  return isUniqueViolation(error, new Set(["users_email_key", "users_email_lower_key"]), ["(email)="]);
}

/**
 * Atomically reserve the right to send one verification email for an address.
 * Existing accounts, cooldowns, and exhausted send allowances all return
 * "none" so the API can keep a single anti-enumeration response.
 */
export async function claimPendingSignup(details: SignupDetails): Promise<PendingSignupClaim> {
  const token = createSignupVerificationToken();
  const tokenHash = await hashSignupVerificationToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PENDING_SIGNUP_TTL_MS);

  // Opportunistic cleanup keeps abandoned hashes from living indefinitely.
  await db.delete(pendingSignups).where(lt(pendingSignups.expiresAt, now));

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"signup:" + details.email}, 0))`);

    const [existingUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, details.email)).limit(1);
    if (existingUser) return { kind: "none" } as const;

    const [pending] = await tx
      .select()
      .from(pendingSignups)
      .where(eq(pendingSignups.email, details.email))
      .limit(1)
      .for("update");

    if (pending) {
      if (pending.expiresAt.getTime() <= now.getTime()) {
        await tx.delete(pendingSignups).where(eq(pendingSignups.id, pending.id));
      } else {
        const inCooldown = now.getTime() - pending.lastEmailAttemptAt.getTime() < PENDING_SIGNUP_RESEND_COOLDOWN_MS;
        if (inCooldown || pending.emailSendCount >= PENDING_SIGNUP_MAX_EMAIL_SENDS) {
          return { kind: "none" } as const;
        }

        const [updated] = await tx
          .update(pendingSignups)
          .set({
            ...details,
            tokenHash,
            expiresAt,
            verificationAttempts: 0,
            emailSendCount: pending.emailSendCount + 1,
            lastEmailAttemptAt: now,
            lastEmailSentAt: null,
            updatedAt: now,
          })
          .where(eq(pendingSignups.id, pending.id))
          .returning({ id: pendingSignups.id });

        return { kind: "send", pendingId: updated.id, token, tokenHash } as const;
      }
    }

    const [inserted] = await tx
      .insert(pendingSignups)
      .values({
        ...details,
        tokenHash,
        expiresAt,
        verificationAttempts: 0,
        emailSendCount: 1,
        lastEmailAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: pendingSignups.id });

    return { kind: "send", pendingId: inserted.id, token, tokenHash } as const;
  });
}

export async function markPendingSignupEmailSent(pendingId: string, tokenHash: string) {
  const now = new Date();
  await db
    .update(pendingSignups)
    .set({ lastEmailSentAt: now, updatedAt: now })
    .where(and(eq(pendingSignups.id, pendingId), eq(pendingSignups.tokenHash, tokenHash)));
}

export async function findPendingSignupByTokenHash(tokenHash: string) {
  const [pending] = await db.select().from(pendingSignups).where(eq(pendingSignups.tokenHash, tokenHash)).limit(1);
  if (!pending) return null;
  if (
    pending.expiresAt.getTime() <= Date.now() ||
    pending.verificationAttempts >= PENDING_SIGNUP_MAX_VERIFICATION_ATTEMPTS
  ) {
    await db.delete(pendingSignups).where(eq(pendingSignups.id, pending.id));
    return null;
  }
  return pending;
}

export async function recordFailedPendingVerification(pendingId: string) {
  const [updated] = await db
    .update(pendingSignups)
    .set({
      verificationAttempts: sql`${pendingSignups.verificationAttempts} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(pendingSignups.id, pendingId), lt(pendingSignups.verificationAttempts, PENDING_SIGNUP_MAX_VERIFICATION_ATTEMPTS)))
    .returning({ verificationAttempts: pendingSignups.verificationAttempts });

  if (updated && updated.verificationAttempts >= PENDING_SIGNUP_MAX_VERIFICATION_ATTEMPTS) {
    await db.delete(pendingSignups).where(eq(pendingSignups.id, pendingId));
  }
}

export async function completePendingSignup({
  pendingId,
  email,
  tokenHash,
  passwordHash,
  userId,
  verifiedAt,
  session,
}: {
  pendingId: string;
  email: string;
  tokenHash: string;
  passwordHash: string;
  userId: string;
  verifiedAt: Date;
  session: UserSessionRecord;
}): Promise<PendingSignupCompletion> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"signup:" + email}, 0))`);

    const [pending] = await tx
      .select()
      .from(pendingSignups)
      .where(and(eq(pendingSignups.id, pendingId), eq(pendingSignups.tokenHash, tokenHash)))
      .limit(1)
      .for("update");

    const now = new Date();
    if (
      !pending ||
      pending.email !== email ||
      pending.passwordHash !== passwordHash ||
      pending.expiresAt.getTime() <= now.getTime() ||
      pending.verificationAttempts >= PENDING_SIGNUP_MAX_VERIFICATION_ATTEMPTS
    ) {
      if (pending && pending.expiresAt.getTime() <= now.getTime()) {
        await tx.delete(pendingSignups).where(eq(pendingSignups.id, pending.id));
      }
      return { kind: "invalid" } as const;
    }

    const [existingUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, pending.email)).limit(1);
    if (existingUser) {
      await tx.delete(pendingSignups).where(eq(pendingSignups.id, pending.id));
      return { kind: "already_registered" } as const;
    }

    const [user] = await tx
      .insert(users)
      .values({
        id: userId,
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        role: pending.role,
        passwordHash: pending.passwordHash,
        emailVerifiedAt: verifiedAt,
        tokenVersion: 0,
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    if (pending.role === "brand") {
      await tx.insert(brands).values({
        userId: user.id,
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        status: "active",
      });
    } else {
      await tx.insert(creators).values({
        userId: user.id,
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        status: "incomplete",
      });
    }

    await tx.insert(userSessions).values({ ...session, userId: user.id, tokenVersion: 0 });

    await tx.delete(pendingSignups).where(eq(pendingSignups.id, pending.id));
    return { kind: "created", user } as const;
  });
}
