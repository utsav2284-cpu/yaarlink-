import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import {
  AdminIdentityUnavailableError,
  adminIdentitySecretProblem,
  hasRecentAdminStepUp,
  recordAdminSecurityEvent,
  refreshAdminAccountSessionCookie,
  type AdminAccountSessionContext,
} from "@/backend/admin-identity";
import { verifyLoginPassword } from "@/backend/auth";
import { db } from "@/backend/db";
import {
  adminPasskeys,
  adminRecoveryCodes,
  adminSecurityEvents,
  adminSessions,
  adminTotpCredentials,
  adminUsers,
  adminWebauthnChallenges,
  type AdminPasskey,
  type AdminTotpCredential,
  type AdminWebauthnChallenge,
} from "@/backend/db/schema";
import { getClientIp } from "@/backend/rate-limit";
import { getSigningSecret, signingSecretProblem } from "@/backend/secret-config";
import {
  buildTotpUri,
  generateRecoveryCodes,
  generateTotpSecret,
  matchTotpCode,
  normalizeRecoveryCode,
} from "@/shared/admin-mfa";
import {
  ADMIN_WEBAUTHN_CHALLENGE_TTL_MS,
  ADMIN_WEBAUTHN_RP_NAME,
  ADMIN_WEBAUTHN_TIMEOUT_MS,
  adminPasskeyUserHandle,
  isPasskeyCounterAcceptable,
  resolveAdminWebAuthnConfig,
  sanitizePasskeyTransports,
  type AdminWebAuthnRpConfig,
} from "@/shared/admin-webauthn";

const ADMIN_SESSION_ABSOLUTE_MS = 12 * 60 * 60_000;
const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = "YaarLink Admin";
const ENCRYPTION_VERSION = "v1";
const enc = new TextEncoder();

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class AdminSessionGoneError extends Error {
  constructor() {
    super("Administrator session is no longer active");
    this.name = "AdminSessionGoneError";
  }
}

export type AdminPasskeyView = {
  id: string;
  deviceName: string | null;
  transports: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type AdminMfaStatus = {
  mfaRequired: true;
  mfaEnrolled: boolean;
  mfaSatisfied: boolean;
  stepUpFresh: boolean;
  sessionMfaVerifiedAt: Date | null;
  sessionExpiresAt: Date;
  totp: {
    state: "not_started" | "pending" | "enrolled";
    verifiedAt: Date | null;
    lastUsedAt: Date | null;
  };
  recoveryCodesRemaining: number;
  passkeys: {
    count: number;
    enrollmentAvailable: true;
    items: AdminPasskeyView[];
  };
};

function toB64url(bytes: ArrayBuffer | Uint8Array): string {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < value.length; index += 1) binary += String.fromCharCode(value[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

function mfaKeyMaterial(): string {
  const dedicated = process.env.ADMIN_MFA_ENCRYPTION_SECRET?.trim();
  if (dedicated) {
    if (
      signingSecretProblem(dedicated) ||
      dedicated === process.env.SESSION_SECRET ||
      dedicated === process.env.ADMIN_SESSION_SECRET
    ) {
      throw new AdminIdentityUnavailableError(new Error("ADMIN_MFA_ENCRYPTION_SECRET is not safely configured"));
    }
    return `yaarlink-admin-mfa:v1:${dedicated}`;
  }

  // Backward-compatible local/Phase 2A path: derive a domain-separated key
  // from the already-required dedicated administrator signing secret. A
  // separate ADMIN_MFA_ENCRYPTION_SECRET remains preferable in production.
  if (adminIdentitySecretProblem()) {
    throw new AdminIdentityUnavailableError(new Error("Administrator MFA encryption secret is unavailable"));
  }
  return `yaarlink-admin-mfa:v1:${getSigningSecret("ADMIN_SESSION_SECRET")}`;
}

async function mfaEncryptionKey(): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", enc.encode(mfaKeyMaterial()));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

type EncryptedTotpSecret = {
  secretCiphertext: string;
  secretIv: string;
};

function totpCredentialFingerprint(credential: Pick<AdminTotpCredential, "secretCiphertext" | "secretIv">): string {
  return `${credential.secretCiphertext}.${credential.secretIv}`;
}

async function encryptTotpSecret(adminUserId: string, secret: Uint8Array): Promise<EncryptedTotpSecret> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: enc.encode(`yaarlink-admin-totp:v1:${adminUserId}`) as BufferSource,
      },
      await mfaEncryptionKey(),
      secret as BufferSource,
    );
    return {
      secretCiphertext: `${ENCRYPTION_VERSION}.${toB64url(ciphertext)}`,
      secretIv: toB64url(iv),
    };
  } catch (error) {
    if (error instanceof AdminIdentityUnavailableError) throw error;
    throw new AdminIdentityUnavailableError(error);
  }
}

async function decryptTotpSecret(
  adminUserId: string,
  credential: Pick<AdminTotpCredential, "secretCiphertext" | "secretIv">,
): Promise<Uint8Array> {
  try {
    const [version, ciphertextValue, extra] = credential.secretCiphertext.split(".");
    if (version !== ENCRYPTION_VERSION || !ciphertextValue || extra !== undefined || !credential.secretIv) {
      throw new Error("Unsupported administrator MFA encryption format");
    }
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromB64url(credential.secretIv) as BufferSource,
        additionalData: enc.encode(`yaarlink-admin-totp:v1:${adminUserId}`) as BufferSource,
      },
      await mfaEncryptionKey(),
      fromB64url(ciphertextValue) as BufferSource,
    );
    const secret = new Uint8Array(plaintext);
    if (secret.length < 16 || secret.length > 64) throw new Error("Invalid administrator TOTP secret length");
    return secret;
  } catch (error) {
    if (error instanceof AdminIdentityUnavailableError) throw error;
    throw new AdminIdentityUnavailableError(error);
  }
}

async function hashRecoveryCode(value: string): Promise<string> {
  const normalized = normalizeRecoveryCode(value);
  if (!normalized) throw new Error("Invalid recovery code format");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(mfaKeyMaterial()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(`admin-recovery-code:v1:${normalized}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function countRows(
  executor: Pick<typeof db, "select"> | DbTransaction,
  table: typeof adminRecoveryCodes | typeof adminPasskeys,
  adminUserId: string,
  unusedOnly = false,
): Promise<number> {
  const conditions = [eq(table.adminUserId, adminUserId)];
  if (table === adminRecoveryCodes && unusedOnly) conditions.push(isNull(adminRecoveryCodes.usedAt));
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(and(...conditions));
  return row?.count ?? 0;
}

type AdminWebAuthnChallengePurpose = "passkey_registration" | "passkey_authentication";

function adminPasskeyView(row: AdminPasskey): AdminPasskeyView {
  return {
    id: row.id,
    deviceName: row.deviceName,
    transports: sanitizePasskeyTransports(row.transports),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

async function listAdminPasskeys(adminUserId: string): Promise<AdminPasskey[]> {
  return db
    .select()
    .from(adminPasskeys)
    .where(eq(adminPasskeys.adminUserId, adminUserId))
    .orderBy(desc(adminPasskeys.createdAt));
}

function webAuthnConfigForRequest(req?: Request): AdminWebAuthnRpConfig | null {
  if (!req) return null;
  const origin = req.headers.get("origin");
  if (origin) return resolveAdminWebAuthnConfig(origin);
  try {
    return resolveAdminWebAuthnConfig(new URL(req.url).origin);
  } catch {
    return null;
  }
}

async function hashWebAuthnChallenge(challenge: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`yaarlink-admin-webauthn-challenge:v1:${challenge}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function webAuthnChallengeMatches(challenge: string, storedHash: string): Promise<boolean> {
  return timingSafeEqualHex(await hashWebAuthnChallenge(challenge), storedHash);
}

async function storeWebAuthnChallenge(
  context: AdminAccountSessionContext,
  purpose: AdminWebAuthnChallengePurpose,
  challenge: string,
): Promise<void> {
  const challengeHash = await hashWebAuthnChallenge(challenge);
  const now = new Date();
  await db.transaction(async (tx) => {
    // Challenge rows are ephemeral ceremony state, not security history;
    // security outcomes are retained separately in admin_security_events.
    await tx.delete(adminWebauthnChallenges).where(lt(adminWebauthnChallenges.expiresAt, now));
    await tx
      .update(adminWebauthnChallenges)
      .set({ revokedAt: now })
      .where(
        and(
          eq(adminWebauthnChallenges.adminUserId, context.admin.id),
          eq(adminWebauthnChallenges.sessionId, context.sessionId),
          eq(adminWebauthnChallenges.purpose, purpose),
          isNull(adminWebauthnChallenges.usedAt),
          isNull(adminWebauthnChallenges.revokedAt),
        ),
      );
    await tx.insert(adminWebauthnChallenges).values({
      adminUserId: context.admin.id,
      sessionId: context.sessionId,
      purpose,
      challengeHash,
      expiresAt: new Date(now.getTime() + ADMIN_WEBAUTHN_CHALLENGE_TTL_MS),
      createdAt: now,
    });
  });
}

async function readActiveWebAuthnChallenge(
  context: AdminAccountSessionContext,
  purpose: AdminWebAuthnChallengePurpose,
): Promise<AdminWebauthnChallenge | null> {
  const [challenge] = await db
    .select()
    .from(adminWebauthnChallenges)
    .where(
      and(
        eq(adminWebauthnChallenges.adminUserId, context.admin.id),
        eq(adminWebauthnChallenges.sessionId, context.sessionId),
        eq(adminWebauthnChallenges.purpose, purpose),
        isNull(adminWebauthnChallenges.usedAt),
        isNull(adminWebauthnChallenges.revokedAt),
        gt(adminWebauthnChallenges.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(adminWebauthnChallenges.createdAt))
    .limit(1);
  return challenge ?? null;
}

async function claimWebAuthnChallenge(
  tx: DbTransaction,
  context: AdminAccountSessionContext,
  challengeId: string,
  purpose: AdminWebAuthnChallengePurpose,
): Promise<boolean> {
  const now = new Date();
  const [claimed] = await tx
    .update(adminWebauthnChallenges)
    .set({ usedAt: now })
    .where(
      and(
        eq(adminWebauthnChallenges.id, challengeId),
        eq(adminWebauthnChallenges.adminUserId, context.admin.id),
        eq(adminWebauthnChallenges.sessionId, context.sessionId),
        eq(adminWebauthnChallenges.purpose, purpose),
        isNull(adminWebauthnChallenges.usedAt),
        isNull(adminWebauthnChallenges.revokedAt),
        gt(adminWebauthnChallenges.expiresAt, now),
      ),
    )
    .returning({ id: adminWebauthnChallenges.id });
  return Boolean(claimed);
}

async function recordPasskeyFailure(
  context: AdminAccountSessionContext,
  eventType: string,
  reason: string,
  req?: Request,
): Promise<void> {
  await recordAdminSecurityEvent({
    adminUserId: context.admin.id,
    actorAdminId: context.admin.id,
    eventType,
    outcome: "failure",
    req,
    metadata: { method: "passkey", reason },
  });
}

export async function getAdminMfaStatus(context: AdminAccountSessionContext): Promise<AdminMfaStatus> {
  const [totpRows, recoveryCodesRemaining, passkeys] = await Promise.all([
    db
      .select()
      .from(adminTotpCredentials)
      .where(eq(adminTotpCredentials.adminUserId, context.admin.id))
      .limit(1),
    countRows(db, adminRecoveryCodes, context.admin.id, true),
    listAdminPasskeys(context.admin.id),
  ]);
  const totp = totpRows[0] ?? null;
  return {
    mfaRequired: true,
    mfaEnrolled: Boolean(totp?.verifiedAt || passkeys.length > 0),
    mfaSatisfied: context.mfaSatisfied,
    stepUpFresh: hasRecentAdminStepUp(context),
    sessionMfaVerifiedAt: context.mfaVerifiedAt,
    sessionExpiresAt: context.sessionExpiresAt,
    totp: {
      state: !totp ? "not_started" : totp.verifiedAt ? "enrolled" : "pending",
      verifiedAt: totp?.verifiedAt ?? null,
      // The credential row's update timestamp advances whenever a new TOTP
      // counter is claimed; -1 means no code has been accepted yet.
      lastUsedAt: totp && totp.lastCounter >= 0 ? totp.updatedAt : null,
    },
    recoveryCodesRemaining,
    passkeys: {
      count: passkeys.length,
      enrollmentAvailable: true,
      items: passkeys.map(adminPasskeyView),
    },
  };
}

async function verifyCurrentPassword({
  context,
  password,
  req,
  failureEvent,
}: {
  context: AdminAccountSessionContext;
  password: string;
  req?: Request;
  failureEvent: string;
}): Promise<boolean> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, context.admin.id)).limit(1);
  const verification = await verifyLoginPassword(password, admin?.passwordHash);
  if (!admin || admin.status !== "active" || !verification.ok) {
    await recordAdminSecurityEvent({
      adminUserId: context.admin.id,
      actorAdminId: context.admin.id,
      eventType: failureEvent,
      outcome: "failure",
      req,
      metadata: { reason: "wrong_password" },
    });
    return false;
  }
  return true;
}

async function insertMfaSecurityEvent(
  tx: DbTransaction,
  input: {
    context: AdminAccountSessionContext;
    eventType: string;
    req?: Request;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  const userAgent = input.req?.headers.get("user-agent")?.trim().slice(0, 500) || null;
  const ip = input.req ? getClientIp(input.req) : "unknown";
  await tx.insert(adminSecurityEvents).values({
    adminUserId: input.context.admin.id,
    actorAdminId: input.context.admin.id,
    eventType: input.eventType.slice(0, 100),
    outcome: "success",
    ipAddress: ip === "unknown" ? null : ip.slice(0, 120),
    userAgent,
    metadata: input.metadata ?? {},
  });
}

async function markCurrentSessionMfaVerified(
  tx: DbTransaction,
  context: AdminAccountSessionContext,
  method: "totp" | "recovery_code" | "passkey",
  req?: Request,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(context.sessionCreatedAt.getTime() + ADMIN_SESSION_ABSOLUTE_MS);
  const [updated] = await tx
    .update(adminSessions)
    .set({ mfaVerifiedAt: now, lastSeenAt: now, expiresAt })
    .where(
      and(
        eq(adminSessions.id, context.sessionId),
        eq(adminSessions.adminUserId, context.admin.id),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, now),
      ),
    )
    .returning({ id: adminSessions.id });
  if (!updated) throw new AdminSessionGoneError();
  await insertMfaSecurityEvent(tx, {
    context,
    eventType: "admin.mfa_verified",
    req,
    metadata: { method },
  });
}

async function revokeOtherSessions(tx: DbTransaction, context: AdminAccountSessionContext): Promise<void> {
  await tx
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(adminSessions.adminUserId, context.admin.id),
        ne(adminSessions.id, context.sessionId),
        isNull(adminSessions.revokedAt),
      ),
    );
}

export type BeginAdminTotpEnrollmentResult =
  | { kind: "started"; secret: string; otpauthUri: string; replacing: boolean }
  | { kind: "invalid_password" }
  | { kind: "step_up_required" };

export async function beginAdminTotpEnrollment({
  context,
  password,
  req,
}: {
  context: AdminAccountSessionContext;
  password: string;
  req?: Request;
}): Promise<BeginAdminTotpEnrollmentResult> {
  if (!(await verifyCurrentPassword({ context, password, req, failureEvent: "admin.mfa_enrollment_started" }))) {
    return { kind: "invalid_password" };
  }

  const secret = generateTotpSecret();
  const encrypted = await encryptTotpSecret(context.admin.id, secret.bytes);
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(adminTotpCredentials)
      .where(eq(adminTotpCredentials.adminUserId, context.admin.id))
      .limit(1)
      .for("update");
    const replacing = Boolean(existing?.verifiedAt);
    if (replacing && !hasRecentAdminStepUp(context)) return { kind: "step_up_required" } as const;

    const now = new Date();
    if (existing) {
      await tx
        .update(adminTotpCredentials)
        .set({
          ...encrypted,
          verifiedAt: null,
          lastCounter: -1,
          updatedAt: now,
        })
        .where(eq(adminTotpCredentials.adminUserId, context.admin.id));
    } else {
      await tx.insert(adminTotpCredentials).values({
        adminUserId: context.admin.id,
        ...encrypted,
        verifiedAt: null,
        lastCounter: -1,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (replacing) await revokeOtherSessions(tx, context);
    await insertMfaSecurityEvent(tx, {
      context,
      eventType: "admin.mfa_enrollment_started",
      req,
      metadata: { method: "totp", replacing },
    });
    return { kind: "started", replacing } as const;
  });

  if (result.kind === "step_up_required") return result;
  return {
    kind: "started",
    replacing: result.replacing,
    secret: secret.base32,
    otpauthUri: buildTotpUri({ issuer: TOTP_ISSUER, account: context.admin.email, secret: secret.base32 }),
  };
}

async function createRecoveryCodeValues(codes: string[]): Promise<Array<{ codeHash: string }>> {
  return Promise.all(codes.map(async (code) => ({ codeHash: await hashRecoveryCode(code) })));
}

export type ConfirmAdminTotpEnrollmentResult =
  | { kind: "enrolled"; recoveryCodes: string[] }
  | { kind: "not_started" }
  | { kind: "already_enrolled" }
  | { kind: "invalid_code" }
  | { kind: "session_expired" };

export async function confirmAdminTotpEnrollment({
  context,
  code,
  req,
}: {
  context: AdminAccountSessionContext;
  code: string;
  req?: Request;
}): Promise<ConfirmAdminTotpEnrollmentResult> {
  const [credential] = await db
    .select()
    .from(adminTotpCredentials)
    .where(eq(adminTotpCredentials.adminUserId, context.admin.id))
    .limit(1);
  if (!credential) return { kind: "not_started" };
  if (credential.verifiedAt) return { kind: "already_enrolled" };

  const secret = await decryptTotpSecret(context.admin.id, credential);
  const counter = await matchTotpCode({ secret, code });
  if (counter === null) {
    await recordAdminSecurityEvent({
      adminUserId: context.admin.id,
      actorAdminId: context.admin.id,
      eventType: "admin.mfa_enrollment_failed",
      outcome: "failure",
      req,
      metadata: { method: "totp", reason: "invalid_code" },
    });
    return { kind: "invalid_code" };
  }

  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const recoveryValues = await createRecoveryCodeValues(recoveryCodes);

  try {
    const transactionResult = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(adminTotpCredentials)
        .where(eq(adminTotpCredentials.adminUserId, context.admin.id))
        .limit(1)
        .for("update");
      if (!locked) return { kind: "not_started" } as const;
      if (locked.verifiedAt) return { kind: "already_enrolled" } as const;
      if (totpCredentialFingerprint(locked) !== totpCredentialFingerprint(credential)) {
        return { kind: "invalid_code" } as const;
      }

      const now = new Date();
      const [claimed] = await tx
        .update(adminTotpCredentials)
        .set({ verifiedAt: now, lastCounter: counter, updatedAt: now })
        .where(
          and(
            eq(adminTotpCredentials.adminUserId, context.admin.id),
            isNull(adminTotpCredentials.verifiedAt),
            sql`${adminTotpCredentials.lastCounter} < ${counter}`,
          ),
        )
        .returning({ adminUserId: adminTotpCredentials.adminUserId });
      if (!claimed) return { kind: "invalid_code" } as const;

      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminUserId, context.admin.id));
      await tx.insert(adminRecoveryCodes).values(
        recoveryValues.map((value) => ({ adminUserId: context.admin.id, codeHash: value.codeHash })),
      );
      await revokeOtherSessions(tx, context);
      await markCurrentSessionMfaVerified(tx, context, "totp", req);
      await insertMfaSecurityEvent(tx, {
        context,
        eventType: "admin.mfa_enrolled",
        req,
        metadata: { method: "totp", recoveryCodesIssued: recoveryCodes.length },
      });
      return { kind: "enrolled" } as const;
    });
    if (transactionResult.kind !== "enrolled") return transactionResult;
  } catch (error) {
    if (error instanceof AdminSessionGoneError) return { kind: "session_expired" };
    throw error;
  }

  await refreshAdminAccountSessionCookie(context);
  return { kind: "enrolled", recoveryCodes };
}

async function claimTotpCounter(
  tx: DbTransaction,
  context: AdminAccountSessionContext,
  expectedCredential: Pick<AdminTotpCredential, "secretCiphertext" | "secretIv">,
  counter: number,
): Promise<boolean> {
  const [locked] = await tx
    .select()
    .from(adminTotpCredentials)
    .where(eq(adminTotpCredentials.adminUserId, context.admin.id))
    .limit(1)
    .for("update");
  if (!locked?.verifiedAt || totpCredentialFingerprint(locked) !== totpCredentialFingerprint(expectedCredential)) {
    return false;
  }
  const now = new Date();
  const [claimed] = await tx
    .update(adminTotpCredentials)
    .set({ lastCounter: counter, updatedAt: now })
    .where(
      and(
        eq(adminTotpCredentials.adminUserId, context.admin.id),
        sql`${adminTotpCredentials.verifiedAt} is not null`,
        sql`${adminTotpCredentials.lastCounter} < ${counter}`,
      ),
    )
    .returning({ adminUserId: adminTotpCredentials.adminUserId });
  return Boolean(claimed);
}

async function readVerifiedTotp(context: AdminAccountSessionContext): Promise<AdminTotpCredential | null> {
  const [credential] = await db
    .select()
    .from(adminTotpCredentials)
    .where(
      and(
        eq(adminTotpCredentials.adminUserId, context.admin.id),
        sql`${adminTotpCredentials.verifiedAt} is not null`,
      ),
    )
    .limit(1);
  return credential ?? null;
}

async function matchVerifiedTotp(
  context: AdminAccountSessionContext,
  credential: AdminTotpCredential,
  code: string,
): Promise<number | null> {
  const secret = await decryptTotpSecret(context.admin.id, credential);
  return matchTotpCode({ secret, code });
}

export type VerifyAdminTotpResult =
  | { kind: "verified" }
  | { kind: "not_enrolled" }
  | { kind: "invalid_code" }
  | { kind: "session_expired" };

export async function verifyAdminTotpForSession({
  context,
  code,
  req,
}: {
  context: AdminAccountSessionContext;
  code: string;
  req?: Request;
}): Promise<VerifyAdminTotpResult> {
  const credential = await readVerifiedTotp(context);
  if (!credential) return { kind: "not_enrolled" };
  const counter = await matchVerifiedTotp(context, credential, code);
  if (counter === null) {
    await recordAdminSecurityEvent({
      adminUserId: context.admin.id,
      actorAdminId: context.admin.id,
      eventType: "admin.mfa_verified",
      outcome: "failure",
      req,
      metadata: { method: "totp", reason: "invalid_code" },
    });
    return { kind: "invalid_code" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (!(await claimTotpCounter(tx, context, credential, counter))) {
        return { kind: "invalid_code" } as const;
      }
      await markCurrentSessionMfaVerified(tx, context, "totp", req);
      return { kind: "verified" } as const;
    });
    if (result.kind !== "verified") return result;
  } catch (error) {
    if (error instanceof AdminSessionGoneError) return { kind: "session_expired" };
    throw error;
  }

  await refreshAdminAccountSessionCookie(context);
  return { kind: "verified" };
}

export type VerifyAdminRecoveryCodeResult =
  | { kind: "verified"; recoveryCodesRemaining: number }
  | { kind: "invalid_code" }
  | { kind: "session_expired" };

export async function verifyAdminRecoveryCodeForSession({
  context,
  code,
  req,
}: {
  context: AdminAccountSessionContext;
  code: string;
  req?: Request;
}): Promise<VerifyAdminRecoveryCodeResult> {
  if (!normalizeRecoveryCode(code)) {
    await recordAdminSecurityEvent({
      adminUserId: context.admin.id,
      actorAdminId: context.admin.id,
      eventType: "admin.mfa_verified",
      outcome: "failure",
      req,
      metadata: { method: "recovery_code", reason: "invalid_format" },
    });
    return { kind: "invalid_code" };
  }
  const codeHash = await hashRecoveryCode(code);
  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(adminRecoveryCodes)
        .where(
          and(
            eq(adminRecoveryCodes.adminUserId, context.admin.id),
            eq(adminRecoveryCodes.codeHash, codeHash),
            isNull(adminRecoveryCodes.usedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) return { kind: "invalid_code" } as const;
      const [used] = await tx
        .update(adminRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(adminRecoveryCodes.id, row.id),
            eq(adminRecoveryCodes.adminUserId, context.admin.id),
            isNull(adminRecoveryCodes.usedAt),
          ),
        )
        .returning({ id: adminRecoveryCodes.id });
      if (!used) return { kind: "invalid_code" } as const;
      await markCurrentSessionMfaVerified(tx, context, "recovery_code", req);
      const recoveryCodesRemaining = await countRows(tx, adminRecoveryCodes, context.admin.id, true);
      return { kind: "verified", recoveryCodesRemaining } as const;
    });
    if (result.kind === "invalid_code") {
      await recordAdminSecurityEvent({
        adminUserId: context.admin.id,
        actorAdminId: context.admin.id,
        eventType: "admin.mfa_verified",
        outcome: "failure",
        req,
        metadata: { method: "recovery_code", reason: "invalid_or_used_code" },
      });
      return result;
    }
    await refreshAdminAccountSessionCookie(context);
    return result;
  } catch (error) {
    if (error instanceof AdminSessionGoneError) return { kind: "session_expired" };
    throw error;
  }
}

export type RegenerateAdminRecoveryCodesResult =
  | { kind: "regenerated"; recoveryCodes: string[] }
  | { kind: "invalid_password" }
  | { kind: "invalid_code" }
  | { kind: "not_enrolled" }
  | { kind: "step_up_required" }
  | { kind: "session_expired" };

export async function regenerateAdminRecoveryCodes({
  context,
  password,
  code,
  req,
}: {
  context: AdminAccountSessionContext;
  password: string;
  code: string;
  req?: Request;
}): Promise<RegenerateAdminRecoveryCodesResult> {
  if (!hasRecentAdminStepUp(context)) return { kind: "step_up_required" };
  if (!(await verifyCurrentPassword({ context, password, req, failureEvent: "admin.recovery_codes_regenerated" }))) {
    return { kind: "invalid_password" };
  }
  const credential = await readVerifiedTotp(context);
  if (!credential) return { kind: "not_enrolled" };
  const counter = await matchVerifiedTotp(context, credential, code);
  if (counter === null) return { kind: "invalid_code" };

  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const recoveryValues = await createRecoveryCodeValues(recoveryCodes);
  try {
    const result = await db.transaction(async (tx) => {
      if (!(await claimTotpCounter(tx, context, credential, counter))) {
        return { kind: "invalid_code" } as const;
      }
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminUserId, context.admin.id));
      await tx.insert(adminRecoveryCodes).values(
        recoveryValues.map((value) => ({ adminUserId: context.admin.id, codeHash: value.codeHash })),
      );
      await revokeOtherSessions(tx, context);
      await markCurrentSessionMfaVerified(tx, context, "totp", req);
      await insertMfaSecurityEvent(tx, {
        context,
        eventType: "admin.recovery_codes_regenerated",
        req,
        metadata: { recoveryCodesIssued: recoveryCodes.length },
      });
      return { kind: "regenerated" } as const;
    });
    if (result.kind !== "regenerated") return result;
  } catch (error) {
    if (error instanceof AdminSessionGoneError) return { kind: "session_expired" };
    throw error;
  }
  await refreshAdminAccountSessionCookie(context);
  return { kind: "regenerated", recoveryCodes };
}

export type DisableAdminTotpResult =
  | { kind: "disabled" }
  | { kind: "invalid_password" }
  | { kind: "invalid_code" }
  | { kind: "not_enrolled" }
  | { kind: "step_up_required" }
  | { kind: "last_method" };

export async function disableAdminTotp({
  context,
  password,
  code,
  req,
}: {
  context: AdminAccountSessionContext;
  password: string;
  code: string;
  req?: Request;
}): Promise<DisableAdminTotpResult> {
  if (!hasRecentAdminStepUp(context)) return { kind: "step_up_required" };
  if (!(await verifyCurrentPassword({ context, password, req, failureEvent: "admin.mfa_disabled" }))) {
    return { kind: "invalid_password" };
  }
  const credential = await readVerifiedTotp(context);
  if (!credential) return { kind: "not_enrolled" };
  if ((await countRows(db, adminPasskeys, context.admin.id)) === 0) return { kind: "last_method" };
  const counter = await matchVerifiedTotp(context, credential, code);
  if (counter === null) return { kind: "invalid_code" };

  const result = await db.transaction(async (tx) => {
    if (!(await claimTotpCounter(tx, context, credential, counter))) {
      return { kind: "invalid_code" } as const;
    }
    // claimTotpCounter locks the TOTP row first. Locking Passkeys second uses
    // the same order as Passkey revocation and prevents concurrent removal of
    // both the final TOTP credential and the final Passkey.
    const passkeys = await tx
      .select({ id: adminPasskeys.id })
      .from(adminPasskeys)
      .where(eq(adminPasskeys.adminUserId, context.admin.id))
      .for("update");
    if (passkeys.length === 0) return { kind: "last_method" } as const;
    await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminUserId, context.admin.id));
    await tx.delete(adminTotpCredentials).where(eq(adminTotpCredentials.adminUserId, context.admin.id));
    await revokeOtherSessions(tx, context);
    await insertMfaSecurityEvent(tx, {
      context,
      eventType: "admin.mfa_disabled",
      req,
      metadata: { method: "totp", remainingMethod: "passkey" },
    });
    return { kind: "disabled" } as const;
  });
  return result;
}

export type BeginAdminPasskeyRegistrationResult =
  | { kind: "started"; options: PublicKeyCredentialCreationOptionsJSON }
  | { kind: "invalid_password" }
  | { kind: "step_up_required" }
  | { kind: "origin_not_allowed" };

export async function beginAdminPasskeyRegistration({
  context,
  password,
  req,
}: {
  context: AdminAccountSessionContext;
  password: string;
  req?: Request;
}): Promise<BeginAdminPasskeyRegistrationResult> {
  // A Passkey is an additional MFA credential. Requiring an already verified,
  // fresh MFA session plus the current password prevents a stolen password or
  // pending session from silently adding an attacker's authenticator.
  if (!context.mfaSatisfied || !hasRecentAdminStepUp(context)) return { kind: "step_up_required" };

  const config = webAuthnConfigForRequest(req);
  if (!config) return { kind: "origin_not_allowed" };

  if (
    !(await verifyCurrentPassword({
      context,
      password,
      req,
      failureEvent: "admin.passkey_registration_started",
    }))
  ) {
    return { kind: "invalid_password" };
  }

  const userHandle = adminPasskeyUserHandle(context.admin.id);
  if (!userHandle) throw new AdminIdentityUnavailableError(new Error("Administrator Passkey user handle is invalid"));

  const existingPasskeys = await listAdminPasskeys(context.admin.id);
  const options = await generateRegistrationOptions({
    rpName: ADMIN_WEBAUTHN_RP_NAME,
    rpID: config.rpID,
    userName: context.admin.email,
    userDisplayName: context.admin.name ?? context.admin.email,
    userID: userHandle.slice(),
    timeout: ADMIN_WEBAUTHN_TIMEOUT_MS,
    attestationType: "none",
    excludeCredentials: existingPasskeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: sanitizePasskeyTransports(passkey.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification: "required",
    },
  });

  await storeWebAuthnChallenge(context, "passkey_registration", options.challenge);
  await recordAdminSecurityEvent({
    adminUserId: context.admin.id,
    actorAdminId: context.admin.id,
    eventType: "admin.passkey_registration_started",
    outcome: "success",
    req,
    metadata: { method: "passkey", existingPasskeys: existingPasskeys.length },
  });
  return { kind: "started", options };
}

export type FinishAdminPasskeyRegistrationResult =
  | { kind: "registered"; passkey: AdminPasskeyView }
  | { kind: "already_registered" }
  | { kind: "challenge_expired" }
  | { kind: "invalid_response" }
  | { kind: "origin_not_allowed" }
  | { kind: "session_expired" }
  | { kind: "step_up_required" };

export async function finishAdminPasskeyRegistration({
  context,
  response,
  deviceName,
  req,
}: {
  context: AdminAccountSessionContext;
  response: RegistrationResponseJSON;
  deviceName: string;
  req?: Request;
}): Promise<FinishAdminPasskeyRegistrationResult> {
  if (!context.mfaSatisfied) return { kind: "step_up_required" };

  const config = webAuthnConfigForRequest(req);
  if (!config) return { kind: "origin_not_allowed" };

  const challenge = await readActiveWebAuthnChallenge(context, "passkey_registration");
  if (!challenge) return { kind: "challenge_expired" };

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: async (candidate) => webAuthnChallengeMatches(candidate, challenge.challengeHash),
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      expectedType: "webauthn.create",
      requireUserPresence: true,
      requireUserVerification: true,
    });
  } catch {
    await recordPasskeyFailure(context, "admin.passkey_registered", "invalid_response", req);
    return { kind: "invalid_response" };
  }

  if (!verification.verified || !verification.registrationInfo.userVerified) {
    await recordPasskeyFailure(context, "admin.passkey_registered", "invalid_response", req);
    return { kind: "invalid_response" };
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const publicKey = toB64url(credential.publicKey);
  const transports = sanitizePasskeyTransports(credential.transports ?? response.response.transports);
  if (
    credential.id !== response.id ||
    !/^[A-Za-z0-9_-]{1,512}$/u.test(credential.id) ||
    !publicKey ||
    publicKey.length > 8192 ||
    !isPasskeyCounterAcceptable(0, credential.counter)
  ) {
    await recordPasskeyFailure(context, "admin.passkey_registered", "invalid_credential", req);
    return { kind: "invalid_response" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (!(await claimWebAuthnChallenge(tx, context, challenge.id, "passkey_registration"))) {
        return { kind: "challenge_expired" } as const;
      }

      const [existing] = await tx
        .select({ id: adminPasskeys.id })
        .from(adminPasskeys)
        .where(eq(adminPasskeys.credentialId, credential.id))
        .limit(1);
      if (existing) return { kind: "already_registered" } as const;

      const [inserted] = await tx
        .insert(adminPasskeys)
        .values({
          adminUserId: context.admin.id,
          credentialId: credential.id,
          publicKey,
          counter: credential.counter,
          transports,
          deviceName,
        })
        .returning();
      if (!inserted) throw new Error("Administrator Passkey could not be stored");

      await revokeOtherSessions(tx, context);
      await markCurrentSessionMfaVerified(tx, context, "passkey", req);
      await insertMfaSecurityEvent(tx, {
        context,
        eventType: "admin.passkey_registered",
        req,
        metadata: {
          credentialDeviceType,
          credentialBackedUp,
          transports: transports.join(","),
        },
      });
      return { kind: "registered", passkey: adminPasskeyView(inserted) } as const;
    });
    if (result.kind !== "registered") return result;
    await refreshAdminAccountSessionCookie(context);
    return result;
  } catch (error) {
    if (error instanceof AdminSessionGoneError) return { kind: "session_expired" };
    throw error;
  }
}

export type BeginAdminPasskeyAuthenticationResult =
  | { kind: "started"; options: PublicKeyCredentialRequestOptionsJSON }
  | { kind: "not_enrolled" }
  | { kind: "origin_not_allowed" };

export async function beginAdminPasskeyAuthentication({
  context,
  req,
}: {
  context: AdminAccountSessionContext;
  req?: Request;
}): Promise<BeginAdminPasskeyAuthenticationResult> {
  const config = webAuthnConfigForRequest(req);
  if (!config) return { kind: "origin_not_allowed" };

  const passkeys = await listAdminPasskeys(context.admin.id);
  if (passkeys.length === 0) return { kind: "not_enrolled" };

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    timeout: ADMIN_WEBAUTHN_TIMEOUT_MS,
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: sanitizePasskeyTransports(passkey.transports),
    })),
    userVerification: "required",
  });

  await storeWebAuthnChallenge(context, "passkey_authentication", options.challenge);
  return { kind: "started", options };
}

export type FinishAdminPasskeyAuthenticationResult =
  | { kind: "verified"; passkey: AdminPasskeyView }
  | { kind: "challenge_expired" }
  | { kind: "counter_regression" }
  | { kind: "invalid_response" }
  | { kind: "origin_not_allowed" }
  | { kind: "session_expired" };

export async function finishAdminPasskeyAuthentication({
  context,
  response,
  req,
}: {
  context: AdminAccountSessionContext;
  response: AuthenticationResponseJSON;
  req?: Request;
}): Promise<FinishAdminPasskeyAuthenticationResult> {
  const config = webAuthnConfigForRequest(req);
  if (!config) return { kind: "origin_not_allowed" };

  const challenge = await readActiveWebAuthnChallenge(context, "passkey_authentication");
  if (!challenge) return { kind: "challenge_expired" };

  if (!/^[A-Za-z0-9_-]{1,512}$/u.test(response.id)) {
    await recordPasskeyFailure(context, "admin.mfa_verified", "invalid_credential", req);
    return { kind: "invalid_response" };
  }

  const [passkey] = await db
    .select()
    .from(adminPasskeys)
    .where(and(eq(adminPasskeys.adminUserId, context.admin.id), eq(adminPasskeys.credentialId, response.id)))
    .limit(1);
  if (!passkey) {
    await recordPasskeyFailure(context, "admin.mfa_verified", "unknown_credential", req);
    return { kind: "invalid_response" };
  }

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: async (candidate) => webAuthnChallengeMatches(candidate, challenge.challengeHash),
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      expectedType: "webauthn.get",
      credential: {
        id: passkey.credentialId,
        publicKey: fromB64url(passkey.publicKey).slice(),
        counter: Number(passkey.counter),
        transports: sanitizePasskeyTransports(passkey.transports),
      },
      requireUserVerification: true,
    });
  } catch {
    await recordPasskeyFailure(context, "admin.mfa_verified", "invalid_response", req);
    return { kind: "invalid_response" };
  }

  const { authenticationInfo } = verification;
  if (
    !verification.verified ||
    !authenticationInfo.userVerified ||
    authenticationInfo.credentialID !== passkey.credentialId
  ) {
    await recordPasskeyFailure(context, "admin.mfa_verified", "invalid_response", req);
    return { kind: "invalid_response" };
  }

  if (!isPasskeyCounterAcceptable(Number(passkey.counter), authenticationInfo.newCounter)) {
    await recordPasskeyFailure(context, "admin.mfa_verified", "counter_regression", req);
    return { kind: "counter_regression" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (!(await claimWebAuthnChallenge(tx, context, challenge.id, "passkey_authentication"))) {
        return { kind: "challenge_expired" } as const;
      }

      const now = new Date();
      const [updated] = await tx
        .update(adminPasskeys)
        .set({ counter: authenticationInfo.newCounter, lastUsedAt: now })
        .where(
          and(
            eq(adminPasskeys.id, passkey.id),
            eq(adminPasskeys.adminUserId, context.admin.id),
            eq(adminPasskeys.credentialId, passkey.credentialId),
            eq(adminPasskeys.publicKey, passkey.publicKey),
            sql`(
              (${adminPasskeys.counter} = 0 and ${authenticationInfo.newCounter} = 0)
              or ${adminPasskeys.counter} < ${authenticationInfo.newCounter}
            )`,
          ),
        )
        .returning();
      if (!updated) return { kind: "counter_regression" } as const;

      await markCurrentSessionMfaVerified(tx, context, "passkey", req);
      return { kind: "verified", passkey: adminPasskeyView(updated) } as const;
    });
    if (result.kind !== "verified") return result;
    await refreshAdminAccountSessionCookie(context);
    return result;
  } catch (error) {
    if (error instanceof AdminSessionGoneError) return { kind: "session_expired" };
    throw error;
  }
}

export type RevokeAdminPasskeyResult =
  | { kind: "revoked"; remainingPasskeys: number }
  | { kind: "invalid_password" }
  | { kind: "last_method" }
  | { kind: "not_found" }
  | { kind: "step_up_required" };

export async function revokeAdminPasskey({
  context,
  passkeyId,
  password,
  req,
}: {
  context: AdminAccountSessionContext;
  passkeyId: string;
  password: string;
  req?: Request;
}): Promise<RevokeAdminPasskeyResult> {
  if (!context.mfaSatisfied || !hasRecentAdminStepUp(context)) return { kind: "step_up_required" };
  if (!(await verifyCurrentPassword({ context, password, req, failureEvent: "admin.passkey_revoked" }))) {
    return { kind: "invalid_password" };
  }

  return db.transaction(async (tx) => {
    const [totp] = await tx
      .select({ verifiedAt: adminTotpCredentials.verifiedAt })
      .from(adminTotpCredentials)
      .where(eq(adminTotpCredentials.adminUserId, context.admin.id))
      .limit(1)
      .for("update");
    const passkeys = await tx
      .select()
      .from(adminPasskeys)
      .where(eq(adminPasskeys.adminUserId, context.admin.id))
      .for("update");
    const target = passkeys.find((passkey) => passkey.id === passkeyId);
    if (!target) return { kind: "not_found" } as const;

    const remainingPasskeys = passkeys.length - 1;
    if (!totp?.verifiedAt && remainingPasskeys === 0) return { kind: "last_method" } as const;

    await tx
      .delete(adminPasskeys)
      .where(and(eq(adminPasskeys.id, target.id), eq(adminPasskeys.adminUserId, context.admin.id)));
    await revokeOtherSessions(tx, context);
    await insertMfaSecurityEvent(tx, {
      context,
      eventType: "admin.passkey_revoked",
      req,
      metadata: { remainingPasskeys, totpRemaining: Boolean(totp?.verifiedAt) },
    });
    return { kind: "revoked", remainingPasskeys } as const;
  });
}
