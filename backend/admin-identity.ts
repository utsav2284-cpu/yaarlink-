import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { setAdminAuditActor } from "@/backend/admin-audit";
import { hashPassword, verifyLoginPassword } from "@/backend/auth";
import { db } from "@/backend/db";
import {
  adminAuthTokens,
  adminPasskeys,
  adminSessions,
  adminSecurityEvents,
  adminTotpCredentials,
  adminUsers,
  type AdminUser,
} from "@/backend/db/schema";
import { logEvent, requestLogContext, type RequestLogSource } from "@/backend/observability";
import { getClientIp } from "@/backend/rate-limit";
import { getSigningSecret, signingSecretProblemForName } from "@/backend/secret-config";
import {
  canInviteAdminRole,
  hasAdminPermission,
  isAdminRole,
  permissionsForAdminRole,
  wouldRemoveLastActiveSuperAdmin,
  type AdminPermission,
  type AdminRole,
} from "@/shared/admin-rbac";
import {
  adminAccountCookieAttributes,
  resolveAdminAccountCookieMode,
  type AdminAccountCookieAttributes,
} from "@/shared/admin-cookie";

/*
 * Database-backed administrator identity.
 *
 * This intentionally reuses the application's established PBKDF2 password
 * verification, signed-cookie shape, database session revocation, Resend
 * email path, rate-limit tables, and admin signing secret. It does not reuse
 * public user accounts or their role field: marketplace signup must never be
 * able to become an administrator identity.
 */

export const ADMIN_ACCOUNT_COOKIE = "__Host-yl_admin_account";
const ADMIN_ACCOUNT_SESSION_MS = 12 * 60 * 60_000;
export const ADMIN_ACCOUNT_MFA_PENDING_SESSION_MS = 10 * 60_000;
export const ADMIN_ACCOUNT_STEP_UP_MAX_AGE_MS = 15 * 60_000;
const ADMIN_ACCOUNT_SIGN_PREFIX = "yl_admin_account:";
const ADMIN_SESSION_TOUCH_INTERVAL_MS = 15 * 60_000;
const ADMIN_SESSION_RETENTION_MS = 30 * 864e5;
const MAX_CLOCK_SKEW_MS = 60_000;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enc = new TextEncoder();
const FIRST_ADMIN_SETUP_LOCK_ID = 778_899;

/**
 * Stage 1 (Simple Admin Dashboard) deliberately runs with email + strong
 * password sign-in only: set ADMIN_MFA_REQUIRED=false and a password session
 * is complete on its own. The full Stage 2 policy stays the default — with
 * the variable unset or "true", a session is only MFA-pending until TOTP,
 * passkey, or recovery verification, exactly as before.
 */
export function isAdminMfaRequired(): boolean {
  const raw = (process.env.ADMIN_MFA_REQUIRED ?? "true").trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(raw);
}

function firstAdminSetupKey(): string {
  return process.env.ADMIN_FIRST_SETUP_KEY?.trim() ?? "";
}

export function isFirstAdminSetupKeyRequired(): boolean {
  return firstAdminSetupKey().length > 0;
}

async function firstAdminSetupKeyMatches(provided: string | null | undefined): Promise<boolean> {
  const configured = firstAdminSetupKey();
  if (!configured) return true;
  if (!provided) return false;
  const [providedDigest, configuredDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(configured)),
  ]);
  return safeEqual(new Uint8Array(providedDigest), new Uint8Array(configuredDigest));
}

export const ADMIN_AUTH_TOKEN_TTLS = {
  owner_setup: 20 * 60_000,
  admin_invitation: 24 * 60 * 60_000,
  password_reset: 20 * 60_000,
} as const;
export const ADMIN_AUTH_TOKEN_RESEND_COOLDOWN_MS = 60_000;
export const ADMIN_AUTH_TOKEN_MAX_EMAIL_SENDS = 5;

export type AdminAuthTokenPurpose = keyof typeof ADMIN_AUTH_TOKEN_TTLS;
export type AdminAccountStatus = "invited" | "active" | "suspended" | "revoked";

export type AdminAccountView = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  status: AdminAccountStatus;
  permissions: readonly AdminPermission[];
  emailVerifiedAt: Date | null;
  passwordChangedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  invitationExpiresAt?: Date | null;
  invitationUsedAt?: Date | null;
  invitationRevokedAt?: Date | null;
};

export type AdminAccountSessionContext = {
  admin: AdminAccountView;
  sessionId: string;
  tokenVersion: number;
  sessionCreatedAt: Date;
  sessionExpiresAt: Date;
  mfaVerifiedAt: Date | null;
  mfaEnrolled: boolean;
  mfaSatisfied: boolean;
};

export class AdminIdentityUnavailableError extends Error {
  readonly code = "service_unavailable" as const;

  constructor(cause?: unknown) {
    super("Administrator identity service is temporarily unavailable", cause === undefined ? undefined : { cause });
    this.name = "AdminIdentityUnavailableError";
  }
}

export function isAdminIdentityUnavailableError(error: unknown): error is AdminIdentityUnavailableError {
  return error instanceof AdminIdentityUnavailableError;
}

export function logAdminIdentityUnavailable(
  error: AdminIdentityUnavailableError,
  source?: RequestLogSource,
  explicitRoute?: string,
): void {
  let current: unknown = error.cause ?? error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const cause = (current as Error & { cause?: unknown }).cause;
    if (!(cause instanceof Error)) break;
    current = cause;
  }
  const root = current instanceof Error ? current : null;
  const code = (root as (Error & { code?: unknown }) | null)?.code;
  logEvent("error", "admin_identity.operation_failed", {
    ...requestLogContext(source, explicitRoute),
    component: "admin-identity",
    errorName: root?.name || "UnknownError",
    errorCode: typeof code === "string" || typeof code === "number" ? String(code) : "unknown",
  });
}

export function adminIdentityUnavailableResponse(headersInit?: HeadersInit): Response {
  const headers = new Headers(headersInit);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  headers.set("Retry-After", "30");
  return Response.json(
    { error: "Administrator sign-in is temporarily unavailable", code: "service_unavailable" },
    { status: 503, headers },
  );
}

export function adminIdentitySecretProblem(): "missing" | "weak" | "shared" | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return "missing";
  if (secret === process.env.SESSION_SECRET) return "shared";
  return signingSecretProblemForName("ADMIN_SESSION_SECRET");
}

function getAdminIdentitySecret(): string {
  const problem = adminIdentitySecretProblem();
  if (problem) throw new AdminIdentityUnavailableError(new Error(`ADMIN_SESSION_SECRET is ${problem}`));
  return getSigningSecret("ADMIN_SESSION_SECRET");
}

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

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requestUserAgent(req?: Request): string | null {
  const value = req?.headers.get("user-agent")?.trim();
  return value ? value.slice(0, 500) : null;
}

function requestIp(req?: Request): string | null {
  if (!req) return null;
  const ip = getClientIp(req);
  return ip === "unknown" ? null : ip.slice(0, 120);
}

function safeStatus(value: string): AdminAccountStatus {
  return value === "active" || value === "suspended" || value === "revoked" || value === "invited" ? value : "revoked";
}

export function toAdminAccountView(row: AdminUser): AdminAccountView {
  const role: AdminRole = isAdminRole(row.role) ? row.role : "analyst";
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role,
    status: safeStatus(row.status),
    permissions: permissionsForAdminRole(role),
    emailVerifiedAt: row.emailVerifiedAt,
    passwordChangedAt: row.passwordChangedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type SecurityMetadata = Record<string, string | number | boolean | null | undefined>;

function sanitizeSecurityMetadata(metadata: SecurityMetadata = {}): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    safe[key.slice(0, 60)] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  return safe;
}

type InsertExecutor = Pick<typeof db, "insert">;

async function insertAdminSecurityEvent(
  executor: InsertExecutor,
  input: {
    adminUserId?: string | null;
    actorAdminId?: string | null;
    eventType: string;
    outcome?: "success" | "failure";
    req?: Request;
    metadata?: SecurityMetadata;
  },
): Promise<void> {
  await executor.insert(adminSecurityEvents).values({
    adminUserId: input.adminUserId && isUuid(input.adminUserId) ? input.adminUserId : null,
    actorAdminId: input.actorAdminId && isUuid(input.actorAdminId) ? input.actorAdminId : null,
    eventType: input.eventType.slice(0, 100),
    outcome: input.outcome ?? "success",
    ipAddress: requestIp(input.req),
    userAgent: requestUserAgent(input.req),
    metadata: sanitizeSecurityMetadata(input.metadata),
  });
}

/** Best-effort event writer for paths where the security action is already complete. */
export async function recordAdminSecurityEvent(input: Parameters<typeof insertAdminSecurityEvent>[1]): Promise<void> {
  try {
    await insertAdminSecurityEvent(db, input);
  } catch (error) {
    logEvent("error", "admin_identity.security_event_failed", {
      ...requestLogContext(input.req),
      component: "admin-identity",
      operation: "security_event_write",
      eventType: input.eventType.slice(0, 100),
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function adminHasVerifiedMfaMethod(adminUserId: string): Promise<boolean> {
  const [totpRows, passkeyRows] = await Promise.all([
    db
      .select({ adminUserId: adminTotpCredentials.adminUserId })
      .from(adminTotpCredentials)
      .where(and(eq(adminTotpCredentials.adminUserId, adminUserId), sql`${adminTotpCredentials.verifiedAt} is not null`))
      .limit(1),
    db
      .select({ id: adminPasskeys.id })
      .from(adminPasskeys)
      .where(eq(adminPasskeys.adminUserId, adminUserId))
      .limit(1),
  ]);
  return totpRows.length > 0 || passkeyRows.length > 0;
}

export function hasRecentAdminStepUp(context: AdminAccountSessionContext, at = Date.now()): boolean {
  return Boolean(
    context.mfaVerifiedAt &&
    at - context.mfaVerifiedAt.getTime() >= 0 &&
    at - context.mfaVerifiedAt.getTime() <= ADMIN_ACCOUNT_STEP_UP_MAX_AGE_MS,
  );
}

function appBase(req?: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the current request origin.
    }
  }
  return req ? new URL(req.url).origin : "https://www.theyaar.com";
}

export function buildAdminIdentityUrl(req: Request | undefined, purpose: AdminAuthTokenPurpose, token: string): string {
  const path = purpose === "password_reset" ? "/admin/reset-password" : "/admin/setup";
  const url = new URL(path, appBase(req));
  // Fragments are not sent to the web server, keeping raw one-time tokens out
  // of ordinary request logs. The page reads the fragment and clears it.
  url.hash = new URLSearchParams({ token, kind: purpose }).toString();
  return url.toString();
}

export function buildAdminSecurityUrl(req?: Request): string {
  return new URL("/admin/security", appBase(req)).toString();
}

export function buildAdminSignInUrl(req?: Request): string {
  return new URL("/admin/sign-in", appBase(req)).toString();
}

export type FirstAdminSetupState = {
  setupOpen: boolean;
  setupKeyRequired: boolean;
};

/**
 * Stage 1 first-time setup state. Setup is open only while no administrator
 * account exists at all; the moment the first account is created it closes
 * permanently and /admin/setup returns to the token-based invitation flow.
 */
export async function getFirstAdminSetupState(): Promise<FirstAdminSetupState> {
  const rows = await db.select({ value: sql<number>`count(*)::int` }).from(adminUsers);
  return {
    setupOpen: (rows[0]?.value ?? 0) === 0,
    setupKeyRequired: isFirstAdminSetupKeyRequired(),
  };
}

export type CreateFirstAdminResult =
  | { kind: "created"; adminRow: AdminUser; admin: AdminAccountView }
  | { kind: "setup_closed" }
  | { kind: "invalid_setup_key" };

/**
 * Create the very first administrator account (the owner, role super_admin).
 * A transaction-scoped advisory lock serializes concurrent attempts so two
 * simultaneous requests can never both pass the zero-account check. When
 * ADMIN_FIRST_SETUP_KEY is configured (production), the caller must also
 * present that one-time key; in a private preview it may be left unset.
 */
export async function createFirstAdminAccount({
  name,
  email,
  passwordHash,
  setupKey,
  req,
}: {
  name: string;
  email: string;
  passwordHash: string;
  setupKey?: string | null;
  req?: Request;
}): Promise<CreateFirstAdminResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${FIRST_ADMIN_SETUP_LOCK_ID})`);

    const countRows = await tx.select({ value: sql<number>`count(*)::int` }).from(adminUsers);
    if ((countRows[0]?.value ?? 0) > 0) return { kind: "setup_closed" } as const;

    if (!(await firstAdminSetupKeyMatches(setupKey))) {
      return { kind: "invalid_setup_key" } as const;
    }

    const now = new Date();
    const [adminRow] = await tx
      .insert(adminUsers)
      .values({
        email,
        name,
        passwordHash,
        role: "super_admin",
        status: "active",
        emailVerifiedAt: now,
        passwordChangedAt: now,
        tokenVersion: 0,
        createdByAdminId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await insertAdminSecurityEvent(tx, {
      adminUserId: adminRow.id,
      actorAdminId: adminRow.id,
      eventType: "admin.first_setup",
      req,
      metadata: { role: "super_admin", setupKeyRequired: isFirstAdminSetupKeyRequired() },
    });

    return { kind: "created", adminRow, admin: toAdminAccountView(adminRow) } as const;
  });
}

export function createAdminAuthToken(): string {
  return toB64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function isAdminAuthToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export async function hashAdminAuthToken(purpose: AdminAuthTokenPurpose, token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`yl_admin_token:${purpose}:${token}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type AdminAuthTokenClaim =
  | {
      kind: "send";
      purpose: AdminAuthTokenPurpose;
      tokenId: string;
      token: string;
      tokenHash: string;
      expiresAt: Date;
      admin: AdminAccountView;
    }
  | { kind: "none" };

/**
 * Reserve one replacement email link for an administrator. Older active links
 * for the same purpose are revoked in the same transaction.
 */
export async function claimAdminAuthToken({
  adminUserId,
  purpose,
  createdByAdminId,
}: {
  adminUserId: string;
  purpose: AdminAuthTokenPurpose;
  createdByAdminId?: string | null;
}): Promise<AdminAuthTokenClaim> {
  const token = createAdminAuthToken();
  const tokenHash = await hashAdminAuthToken(purpose, token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_AUTH_TOKEN_TTLS[purpose]);

  // Opportunistic cleanup of abandoned hashes; the target row is locked below.
  await db
    .delete(adminAuthTokens)
    .where(and(lt(adminAuthTokens.expiresAt, now), isNull(adminAuthTokens.usedAt), isNull(adminAuthTokens.revokedAt)));

  return db.transaction(async (tx) => {
    const [admin] = await tx.select().from(adminUsers).where(eq(adminUsers.id, adminUserId)).limit(1).for("update");
    if (!admin) return { kind: "none" } as const;

    const expectedStatus = purpose === "password_reset" ? "active" : "invited";
    if (admin.status !== expectedStatus) return { kind: "none" } as const;
    if (purpose === "owner_setup" && admin.role !== "super_admin") return { kind: "none" } as const;

    const existingTokens = await tx
      .select()
      .from(adminAuthTokens)
      .where(and(eq(adminAuthTokens.adminUserId, admin.id), eq(adminAuthTokens.purpose, purpose)))
      .orderBy(desc(adminAuthTokens.createdAt))
      .for("update");
    const latest = existingTokens[0];
    const latestIsActive = Boolean(
      latest && !latest.usedAt && !latest.revokedAt && latest.expiresAt.getTime() > now.getTime(),
    );

    if (latest && latestIsActive) {
      const inCooldown = now.getTime() - latest.lastEmailAttemptAt.getTime() < ADMIN_AUTH_TOKEN_RESEND_COOLDOWN_MS;
      if (inCooldown || latest.emailSendCount >= ADMIN_AUTH_TOKEN_MAX_EMAIL_SENDS) return { kind: "none" } as const;
    }

    await tx
      .update(adminAuthTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(adminAuthTokens.adminUserId, admin.id),
          eq(adminAuthTokens.purpose, purpose),
          isNull(adminAuthTokens.usedAt),
          isNull(adminAuthTokens.revokedAt),
        ),
      );

    const [saved] = await tx
      .insert(adminAuthTokens)
      .values({
        adminUserId: admin.id,
        purpose,
        tokenHash,
        expiresAt,
        usedAt: null,
        revokedAt: null,
        emailSendCount: latest && latestIsActive ? latest.emailSendCount + 1 : 1,
        lastEmailAttemptAt: now,
        lastEmailSentAt: null,
        createdByAdminId: createdByAdminId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: adminAuthTokens.id });

    return {
      kind: "send",
      purpose,
      tokenId: saved.id,
      token,
      tokenHash,
      expiresAt,
      admin: toAdminAccountView(admin),
    } as const;
  });
}

export async function markAdminAuthTokenEmailSent(tokenId: string, tokenHash: string): Promise<void> {
  const now = new Date();
  await db
    .update(adminAuthTokens)
    .set({ lastEmailSentAt: now, updatedAt: now })
    .where(and(eq(adminAuthTokens.id, tokenId), eq(adminAuthTokens.tokenHash, tokenHash)));
}

export type AdminAuthTokenInspection = {
  purpose: AdminAuthTokenPurpose;
  email: string;
  name: string | null;
  role: AdminRole;
  status: AdminAccountStatus;
  expiresAt: Date;
};

/** Read a token's safe display data without consuming it. */
export async function inspectAdminAuthToken(
  token: string,
  expectedPurpose?: AdminAuthTokenPurpose,
): Promise<AdminAuthTokenInspection | null> {
  const purposes: AdminAuthTokenPurpose[] = expectedPurpose
    ? [expectedPurpose]
    : ["owner_setup", "admin_invitation", "password_reset"];

  for (const purpose of purposes) {
    const tokenHash = await hashAdminAuthToken(purpose, token);
    const [row] = await db
      .select({ token: adminAuthTokens, admin: adminUsers })
      .from(adminAuthTokens)
      .innerJoin(adminUsers, eq(adminAuthTokens.adminUserId, adminUsers.id))
      .where(eq(adminAuthTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row) continue;

    const admin = toAdminAccountView(row.admin);
    const now = Date.now();
    if (
      row.token.purpose !== purpose ||
      row.token.usedAt ||
      row.token.revokedAt ||
      row.token.expiresAt.getTime() <= now ||
      (purpose === "password_reset" ? admin.status !== "active" : admin.status !== "invited") ||
      (purpose === "owner_setup" && admin.role !== "super_admin")
    ) {
      return null;
    }

    return {
      purpose,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      status: admin.status,
      expiresAt: row.token.expiresAt,
    };
  }

  return null;
}

export type AdminSetupCompletion =
  | { kind: "completed"; admin: AdminAccountView }
  | { kind: "invalid" };

/**
 * Atomically consume a first-owner or invitation token and activate the
 * account with the invitee's own password hash.
 */
export async function consumeAdminSetupToken({
  token,
  purpose,
  name,
  passwordHash,
  req,
}: {
  token: string;
  purpose: "owner_setup" | "admin_invitation";
  name: string;
  passwordHash: string;
  req?: Request;
}): Promise<AdminSetupCompletion> {
  const tokenHash = await hashAdminAuthToken(purpose, token);

  return db.transaction(async (tx) => {
    if (purpose === "owner_setup") {
      // Serialize first-owner completion globally; row locks alone would not
      // stop two different pending rows from racing after manual DB changes.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"admin-owner-setup"}, 0))`);
    }

    const [record] = await tx
      .select()
      .from(adminAuthTokens)
      .where(eq(adminAuthTokens.tokenHash, tokenHash))
      .limit(1)
      .for("update");
    const now = new Date();
    if (
      !record ||
      record.purpose !== purpose ||
      record.usedAt ||
      record.revokedAt ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      return { kind: "invalid" } as const;
    }

    const [admin] = await tx.select().from(adminUsers).where(eq(adminUsers.id, record.adminUserId)).limit(1).for("update");
    if (!admin || admin.status !== "invited") return { kind: "invalid" } as const;

    if (purpose === "owner_setup") {
      if (admin.role !== "super_admin") return { kind: "invalid" } as const;
      const [other] = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(and(ne(adminUsers.id, admin.id), ne(adminUsers.status, "revoked")))
        .limit(1);
      if (other) return { kind: "invalid" } as const;
    }

    const [updated] = await tx
      .update(adminUsers)
      .set({
        name,
        passwordHash,
        status: "active",
        emailVerifiedAt: now,
        passwordChangedAt: now,
        tokenVersion: admin.tokenVersion + 1,
        updatedAt: now,
      })
      .where(eq(adminUsers.id, admin.id))
      .returning();

    await tx
      .update(adminAuthTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(adminAuthTokens.id, record.id));
    await tx
      .update(adminAuthTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(adminAuthTokens.adminUserId, admin.id),
          ne(adminAuthTokens.id, record.id),
          isNull(adminAuthTokens.usedAt),
          isNull(adminAuthTokens.revokedAt),
        ),
      );
    await tx
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.adminUserId, admin.id), isNull(adminSessions.revokedAt)));

    await insertAdminSecurityEvent(tx, {
      adminUserId: admin.id,
      actorAdminId: admin.id,
      eventType: purpose === "owner_setup" ? "admin.owner_setup_completed" : "admin.invitation_accepted",
      req,
      metadata: { role: updated.role },
    });

    return { kind: "completed", admin: toAdminAccountView(updated) } as const;
  });
}

export async function claimAdminPasswordResetByEmail(email: string): Promise<AdminAuthTokenClaim> {
  const [admin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(and(eq(adminUsers.email, email), eq(adminUsers.status, "active")))
    .limit(1);
  if (!admin) return { kind: "none" };
  return claimAdminAuthToken({ adminUserId: admin.id, purpose: "password_reset" });
}

export type AdminPasswordResetCompletion =
  | { kind: "reset"; admin: AdminAccountView }
  | { kind: "invalid" };

export async function consumeAdminPasswordResetToken({
  token,
  passwordHash,
  req,
}: {
  token: string;
  passwordHash: string;
  req?: Request;
}): Promise<AdminPasswordResetCompletion> {
  const tokenHash = await hashAdminAuthToken("password_reset", token);

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(adminAuthTokens)
      .where(eq(adminAuthTokens.tokenHash, tokenHash))
      .limit(1)
      .for("update");
    const now = new Date();
    if (
      !record ||
      record.purpose !== "password_reset" ||
      record.usedAt ||
      record.revokedAt ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      return { kind: "invalid" } as const;
    }

    const [admin] = await tx.select().from(adminUsers).where(eq(adminUsers.id, record.adminUserId)).limit(1).for("update");
    if (!admin || admin.status !== "active") return { kind: "invalid" } as const;

    const [updated] = await tx
      .update(adminUsers)
      .set({
        passwordHash,
        passwordChangedAt: now,
        emailVerifiedAt: admin.emailVerifiedAt ?? now,
        tokenVersion: admin.tokenVersion + 1,
        updatedAt: now,
      })
      .where(eq(adminUsers.id, admin.id))
      .returning();

    await tx
      .update(adminAuthTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(adminAuthTokens.adminUserId, admin.id));
    await tx
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.adminUserId, admin.id), isNull(adminSessions.revokedAt)));

    await insertAdminSecurityEvent(tx, {
      adminUserId: admin.id,
      actorAdminId: admin.id,
      eventType: "admin.password_reset_completed",
      req,
    });

    return { kind: "reset", admin: toAdminAccountView(updated) } as const;
  });
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getAdminIdentitySecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

type AdminAccountTokenPayload = { aid: string; sid: string; ver: number; iat: number; exp: number };

async function createAdminAccountToken(
  adminId: string,
  tokenVersion: number,
  sessionId: string,
  issuedAt = Date.now(),
): Promise<string> {
  const payload: AdminAccountTokenPayload = {
    aid: adminId,
    sid: sessionId,
    ver: tokenVersion,
    iat: issuedAt,
    exp: issuedAt + ADMIN_ACCOUNT_SESSION_MS,
  };
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${toB64url(await hmac(ADMIN_ACCOUNT_SIGN_PREFIX + body))}`;
}

async function readAdminAccountToken(token: string | undefined): Promise<AdminAccountTokenPayload | null> {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  try {
    if (!safeEqual(await hmac(ADMIN_ACCOUNT_SIGN_PREFIX + body), fromB64url(signature))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as AdminAccountTokenPayload;
    const now = Date.now();
    if (!isUuid(payload.aid) || !isUuid(payload.sid) || !Number.isSafeInteger(payload.ver) || payload.ver < 0) return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.iat !== "number" || payload.iat > now + MAX_CLOCK_SKEW_MS) return null;
    if (payload.exp - payload.iat > ADMIN_ACCOUNT_SESSION_MS + MAX_CLOCK_SKEW_MS) return null;
    return payload;
  } catch (error) {
    if (error instanceof AdminIdentityUnavailableError) throw error;
    return null;
  }
}

// Strict everywhere by default. The embedded-preview mode
// (SameSite=None + Partitioned/CHIPS) is honoured only when explicitly
// requested AND APP_URL is loopback — see shared/admin-cookie.ts. Without
// it, a browser refuses to store/send this cookie inside a cross-site
// preview frame and a correct password login loops back to sign-in.
const ADMIN_ACCOUNT_COOKIE_MODE = resolveAdminAccountCookieMode({
  ADMIN_COOKIE_SAME_SITE: process.env.ADMIN_COOKIE_SAME_SITE,
  APP_URL: process.env.APP_URL,
});

export function adminAccountCookieOptions(maxAgeSeconds: number): AdminAccountCookieAttributes {
  return adminAccountCookieAttributes(ADMIN_ACCOUNT_COOKIE_MODE, maxAgeSeconds);
}

const ADMIN_ACCOUNT_COOKIE_OPTIONS = adminAccountCookieOptions(ADMIN_ACCOUNT_SESSION_MS / 1000);

export async function createAdminAccountSession(
  admin: AdminUser,
  req?: Request,
): Promise<{ mfaEnrolled: boolean; mfaRequired: boolean }> {
  const createdAt = new Date();
  const sessionId = crypto.randomUUID();
  const mfaEnrolled = await adminHasVerifiedMfaMethod(admin.id);
  const mfaRequired = isAdminMfaRequired();
  // With MFA required (Stage 2 default), password success creates only a
  // short-lived pending browser session; sensitive services unlock after MFA
  // enrolment or verification extends it. In Stage 1 simple mode the
  // password session is complete and gets the full session lifetime. The
  // mfa_verified_at column still records only genuine MFA verification.
  const expiresAt = new Date(
    createdAt.getTime() + (mfaRequired ? ADMIN_ACCOUNT_MFA_PENDING_SESSION_MS : ADMIN_ACCOUNT_SESSION_MS),
  );
  // Sign before inserting so bad secret configuration cannot leave an orphan
  // database session that no browser could use.
  const token = await createAdminAccountToken(admin.id, admin.tokenVersion, sessionId, createdAt.getTime());
  const retentionCutoff = new Date(Date.now() - ADMIN_SESSION_RETENTION_MS);

  await db.transaction(async (tx) => {
    await tx
      .delete(adminSessions)
      .where(
        and(
          eq(adminSessions.adminUserId, admin.id),
          or(lt(adminSessions.expiresAt, retentionCutoff), lt(adminSessions.revokedAt, retentionCutoff)),
        ),
      );
    await tx.insert(adminSessions).values({
      id: sessionId,
      adminUserId: admin.id,
      tokenVersion: admin.tokenVersion,
      userAgent: requestUserAgent(req),
      ipAddress: requestIp(req),
      createdAt,
      lastSeenAt: createdAt,
      mfaVerifiedAt: null,
      expiresAt,
    });
    await tx.update(adminUsers).set({ lastLoginAt: createdAt, updatedAt: createdAt }).where(eq(adminUsers.id, admin.id));
    await insertAdminSecurityEvent(tx, {
      adminUserId: admin.id,
      actorAdminId: admin.id,
      eventType: "admin.login",
      req,
      metadata: { sessionCreated: true, mfaRequired, mfaEnrolled },
    });
  });

  const jar = await cookies();
  jar.set(ADMIN_ACCOUNT_COOKIE, token, ADMIN_ACCOUNT_COOKIE_OPTIONS);
  return { mfaEnrolled, mfaRequired };
}

async function reissueAdminAccountSessionCookie(
  context: AdminAccountSessionContext,
  tokenVersion: number,
): Promise<void> {
  const jar = await cookies();
  jar.set(
    ADMIN_ACCOUNT_COOKIE,
    await createAdminAccountToken(context.admin.id, tokenVersion, context.sessionId),
    ADMIN_ACCOUNT_COOKIE_OPTIONS,
  );
}

/** Re-sign the same database session after MFA extends its server-side expiry. */
export async function refreshAdminAccountSessionCookie(context: AdminAccountSessionContext): Promise<void> {
  await reissueAdminAccountSessionCookie(context, context.tokenVersion);
}

export async function clearAdminAccountSessionCookie(): Promise<void> {
  const jar = await cookies();
  // The deletion cookie must carry the same attributes (including
  // Partitioned in embedded-preview mode) or the browser keeps the original.
  jar.set(ADMIN_ACCOUNT_COOKIE, "", adminAccountCookieOptions(0));
}

export async function getAdminAccountSession(): Promise<AdminAccountSessionContext | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_ACCOUNT_COOKIE)?.value;
  if (token && adminIdentitySecretProblem()) {
    throw new AdminIdentityUnavailableError(new Error("ADMIN_SESSION_SECRET is not safely configured"));
  }

  const payload = await readAdminAccountToken(token);
  if (!payload) return null;

  const now = new Date();
  const rows = await db
    .select({
      admin: adminUsers,
      sessionId: adminSessions.id,
      sessionTokenVersion: adminSessions.tokenVersion,
      sessionCreatedAt: adminSessions.createdAt,
      sessionLastSeenAt: adminSessions.lastSeenAt,
      sessionMfaVerifiedAt: adminSessions.mfaVerifiedAt,
      sessionExpiresAt: adminSessions.expiresAt,
      sessionRevokedAt: adminSessions.revokedAt,
    })
    .from(adminUsers)
    .innerJoin(adminSessions, and(eq(adminSessions.adminUserId, adminUsers.id), eq(adminSessions.id, payload.sid)))
    .where(eq(adminUsers.id, payload.aid))
    .limit(1)
    .catch((error: unknown) => {
      throw new AdminIdentityUnavailableError(error);
    });

  const row = rows[0];
  const admin = row ? toAdminAccountView(row.admin) : null;
  if (
    !row ||
    !admin ||
    admin.status !== "active" ||
    !isAdminRole(row.admin.role) ||
    row.admin.tokenVersion !== payload.ver ||
    row.sessionTokenVersion !== payload.ver ||
    row.sessionRevokedAt ||
    row.sessionExpiresAt.getTime() <= now.getTime()
  ) {
    return null;
  }

  let mfaEnrolled: boolean;
  try {
    mfaEnrolled = await adminHasVerifiedMfaMethod(row.admin.id);
  } catch (error) {
    throw new AdminIdentityUnavailableError(error);
  }

  if (now.getTime() - row.sessionLastSeenAt.getTime() >= ADMIN_SESSION_TOUCH_INTERVAL_MS) {
    const touched = await db
      .update(adminSessions)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(adminSessions.id, row.sessionId),
          eq(adminSessions.adminUserId, row.admin.id),
          isNull(adminSessions.revokedAt),
          gt(adminSessions.expiresAt, now),
        ),
      )
      .returning({ id: adminSessions.id })
      .catch((error: unknown) => {
        throw new AdminIdentityUnavailableError(error);
      });
    if (!touched.length) return null;
  }

  return {
    admin,
    sessionId: row.sessionId,
    tokenVersion: row.admin.tokenVersion,
    sessionCreatedAt: row.sessionCreatedAt,
    sessionExpiresAt: row.sessionExpiresAt,
    mfaVerifiedAt: row.sessionMfaVerifiedAt,
    mfaEnrolled,
    // Stage 1 simple mode: a password session satisfies access on its own.
    // Stage 2 (default): only genuine MFA verification satisfies it.
    mfaSatisfied: !isAdminMfaRequired() || Boolean(row.sessionMfaVerifiedAt),
  };
}

export async function requireAdminPermission(
  permission: AdminPermission,
  req?: Request,
): Promise<AdminAccountSessionContext | null> {
  const context = await getAdminAccountSession();
  if (!context || !context.mfaSatisfied || !hasAdminPermission(context.admin.role, permission)) return null;
  if (req) setAdminAuditActor(req, context.admin.id);
  return context;
}

export async function logoutAdminAccountSession(req?: Request): Promise<boolean> {
  const context = await getAdminAccountSession();
  if (context) {
    await db.transaction(async (tx) => {
      await tx
        .update(adminSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(adminSessions.id, context.sessionId),
            eq(adminSessions.adminUserId, context.admin.id),
            isNull(adminSessions.revokedAt),
          ),
        );
      await insertAdminSecurityEvent(tx, {
        adminUserId: context.admin.id,
        actorAdminId: context.admin.id,
        eventType: "admin.logout",
        req,
      });
    });
  }
  await clearAdminAccountSessionCookie();
  return Boolean(context);
}

export type AdminAuthenticationResult =
  | { kind: "authenticated"; admin: AdminUser }
  | { kind: "invalid" };

export async function authenticateAdminAccount({
  email,
  password,
  req,
}: {
  email: string;
  password: string;
  req?: Request;
}): Promise<AdminAuthenticationResult> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  const verification = await verifyLoginPassword(password, admin?.passwordHash);

  if (!admin || !verification.ok || admin.status !== "active" || !isAdminRole(admin.role)) {
    await recordAdminSecurityEvent({
      adminUserId: admin?.id ?? null,
      eventType: "admin.login",
      outcome: "failure",
      req,
      metadata: { reason: !admin || !verification.ok ? "wrong_credentials" : "account_inactive" },
    });
    return { kind: "invalid" };
  }

  if (verification.needsRehash) {
    await db.update(adminUsers).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(adminUsers.id, admin.id));
  }

  return { kind: "authenticated", admin };
}

export type AdminPasswordChangeResult =
  | { kind: "changed"; admin: AdminAccountView }
  | { kind: "wrong_password" };

export async function changeAdminAccountPassword({
  context,
  currentPassword,
  newPasswordHash,
  req,
}: {
  context: AdminAccountSessionContext;
  currentPassword: string;
  newPasswordHash: string;
  req?: Request;
}): Promise<AdminPasswordChangeResult> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, context.admin.id)).limit(1);
  const verification = await verifyLoginPassword(currentPassword, admin?.passwordHash);
  if (!admin || admin.status !== "active" || !verification.ok) {
    await recordAdminSecurityEvent({
      adminUserId: context.admin.id,
      actorAdminId: context.admin.id,
      eventType: "admin.password_changed",
      outcome: "failure",
      req,
      metadata: { reason: "wrong_current_password" },
    });
    return { kind: "wrong_password" };
  }

  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(adminUsers).where(eq(adminUsers.id, admin.id)).limit(1).for("update");
    if (!locked || locked.status !== "active") return null;
    const nextTokenVersion = locked.tokenVersion + 1;
    const [row] = await tx
      .update(adminUsers)
      .set({ passwordHash: newPasswordHash, passwordChangedAt: now, tokenVersion: nextTokenVersion, updatedAt: now })
      .where(eq(adminUsers.id, locked.id))
      .returning();

    await tx
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(adminSessions.adminUserId, locked.id),
          ne(adminSessions.id, context.sessionId),
          isNull(adminSessions.revokedAt),
        ),
      );
    await tx
      .update(adminSessions)
      .set({ tokenVersion: nextTokenVersion, lastSeenAt: now })
      .where(and(eq(adminSessions.id, context.sessionId), eq(adminSessions.adminUserId, locked.id), isNull(adminSessions.revokedAt)));
    await tx
      .update(adminAuthTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(adminAuthTokens.adminUserId, locked.id), isNull(adminAuthTokens.usedAt), isNull(adminAuthTokens.revokedAt)));
    await insertAdminSecurityEvent(tx, {
      adminUserId: locked.id,
      actorAdminId: locked.id,
      eventType: "admin.password_changed",
      req,
      metadata: { otherSessionsRevoked: true },
    });
    return row;
  });

  if (!updated) return { kind: "wrong_password" };
  await reissueAdminAccountSessionCookie(context, updated.tokenVersion);
  return { kind: "changed", admin: toAdminAccountView(updated) };
}

export type AdminInvitationResult =
  | { kind: "send"; admin: AdminAccountView; claim: Extract<AdminAuthTokenClaim, { kind: "send" }> }
  | { kind: "conflict" }
  | { kind: "cooldown"; admin: AdminAccountView }
  | { kind: "forbidden" };

export async function createAdminInvitation({
  actor,
  email,
  role,
  req,
}: {
  actor: AdminAccountSessionContext;
  email: string;
  role: AdminRole;
  req?: Request;
}): Promise<AdminInvitationResult> {
  if (!canInviteAdminRole(actor.admin.role, role)) return { kind: "forbidden" };

  const admin = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"admin-invitation:" + email}, 0))`);
    const [existing] = await tx.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1).for("update");
    if (existing) {
      if (existing.status !== "invited") return null;
      const [updated] = await tx
        .update(adminUsers)
        .set({ role, createdByAdminId: actor.admin.id, updatedAt: new Date() })
        .where(eq(adminUsers.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await tx
      .insert(adminUsers)
      .values({
        email,
        name: null,
        passwordHash: null,
        role,
        status: "invited",
        createdByAdminId: actor.admin.id,
      })
      .returning();
    return created;
  });

  if (!admin) return { kind: "conflict" };
  const claim = await claimAdminAuthToken({
    adminUserId: admin.id,
    purpose: "admin_invitation",
    createdByAdminId: actor.admin.id,
  });
  if (claim.kind !== "send") return { kind: "cooldown", admin: toAdminAccountView(admin) };

  await recordAdminSecurityEvent({
    adminUserId: admin.id,
    actorAdminId: actor.admin.id,
    eventType: "admin.invitation_created",
    req,
    metadata: { role },
  });
  return { kind: "send", admin: toAdminAccountView(admin), claim };
}

export async function resendAdminInvitation({
  actor,
  adminUserId,
  req,
}: {
  actor: AdminAccountSessionContext;
  adminUserId: string;
  req?: Request;
}): Promise<AdminInvitationResult> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminUserId)).limit(1);
  if (!admin || admin.status !== "invited" || !isAdminRole(admin.role)) return { kind: "conflict" };
  if (!canInviteAdminRole(actor.admin.role, admin.role)) return { kind: "forbidden" };

  // Preserve the original token purpose: a Super Admin invited after the
  // first owner exists is still an invitation, not a new owner setup.
  const [latestSetupToken] = await db
    .select({ purpose: adminAuthTokens.purpose })
    .from(adminAuthTokens)
    .where(
      and(
        eq(adminAuthTokens.adminUserId, admin.id),
        inArray(adminAuthTokens.purpose, ["owner_setup", "admin_invitation"]),
      ),
    )
    .orderBy(desc(adminAuthTokens.createdAt))
    .limit(1);
  const purpose = latestSetupToken?.purpose === "owner_setup" ? "owner_setup" : "admin_invitation";
  const claim = await claimAdminAuthToken({ adminUserId: admin.id, purpose, createdByAdminId: actor.admin.id });
  if (claim.kind !== "send") return { kind: "cooldown", admin: toAdminAccountView(admin) };
  await recordAdminSecurityEvent({
    adminUserId: admin.id,
    actorAdminId: actor.admin.id,
    eventType: "admin.invitation_resent",
    req,
    metadata: { role: admin.role, purpose },
  });
  return { kind: "send", admin: toAdminAccountView(admin), claim };
}

export async function revokeAdminInvitation({
  actor,
  adminUserId,
  req,
}: {
  actor: AdminAccountSessionContext;
  adminUserId: string;
  req?: Request;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [admin] = await tx.select().from(adminUsers).where(eq(adminUsers.id, adminUserId)).limit(1).for("update");
    if (!admin || admin.status !== "invited") return false;
    const now = new Date();
    await tx
      .update(adminAuthTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(adminAuthTokens.adminUserId, admin.id),
          inArray(adminAuthTokens.purpose, ["owner_setup", "admin_invitation"]),
          isNull(adminAuthTokens.usedAt),
          isNull(adminAuthTokens.revokedAt),
        ),
      );
    await insertAdminSecurityEvent(tx, {
      adminUserId: admin.id,
      actorAdminId: actor.admin.id,
      eventType: "admin.invitation_revoked",
      req,
      metadata: { role: admin.role },
    });
    return true;
  });
}

export async function listAdminAccounts(): Promise<AdminAccountView[]> {
  const rows = await db.select().from(adminUsers).orderBy(desc(adminUsers.createdAt)).limit(200);
  if (!rows.length) return [];

  const tokens = await db
    .select()
    .from(adminAuthTokens)
    .where(
      and(
        inArray(adminAuthTokens.adminUserId, rows.map((row) => row.id)),
        inArray(adminAuthTokens.purpose, ["owner_setup", "admin_invitation"]),
      ),
    )
    .orderBy(desc(adminAuthTokens.createdAt));
  const latestByAdmin = new Map<string, (typeof tokens)[number]>();
  for (const token of tokens) if (!latestByAdmin.has(token.adminUserId)) latestByAdmin.set(token.adminUserId, token);

  return rows.map((row) => {
    const latest = latestByAdmin.get(row.id);
    return {
      ...toAdminAccountView(row),
      invitationExpiresAt: latest?.expiresAt ?? null,
      invitationUsedAt: latest?.usedAt ?? null,
      invitationRevokedAt: latest?.revokedAt ?? null,
    };
  });
}

export type AdminAccountUpdateResult =
  | { kind: "updated"; admin: AdminAccountView }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "last_super_admin" }
  | { kind: "self_change_forbidden" }
  | { kind: "invalid_transition" };

export async function updateAdminAccount({
  actor,
  targetAdminId,
  role,
  status,
  req,
}: {
  actor: AdminAccountSessionContext;
  targetAdminId: string;
  role?: AdminRole;
  status?: Exclude<AdminAccountStatus, "invited">;
  req?: Request;
}): Promise<AdminAccountUpdateResult> {
  if (actor.admin.id === targetAdminId && (role !== undefined || status !== undefined)) {
    return { kind: "self_change_forbidden" };
  }

  return db.transaction(async (tx) => {
    // Serialize account administration so two simultaneous demotions cannot
    // both pass a stale active-Super-Admin count.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"admin-account-management"}, 0))`);

    const [actorRow] = await tx.select().from(adminUsers).where(eq(adminUsers.id, actor.admin.id)).limit(1).for("update");
    const [target] = await tx.select().from(adminUsers).where(eq(adminUsers.id, targetAdminId)).limit(1).for("update");
    if (!actorRow || actorRow.status !== "active" || !isAdminRole(actorRow.role)) return { kind: "forbidden" } as const;
    if (!target || !isAdminRole(target.role)) return { kind: "not_found" } as const;

    const actorRole = actorRow.role;
    const targetRole = target.role;
    if (targetRole === "super_admin" && actorRole !== "super_admin") return { kind: "forbidden" } as const;

    const nextRole = role ?? targetRole;
    const nextStatus = status ?? safeStatus(target.status);
    if (target.status === "invited" && status !== undefined) return { kind: "invalid_transition" } as const;
    if (target.status === "revoked" && nextStatus !== "revoked") return { kind: "invalid_transition" } as const;
    if (role !== undefined && !hasAdminPermission(actorRole, "admin_users.manage_roles")) return { kind: "forbidden" } as const;
    if (role !== undefined && role !== targetRole && !canInviteAdminRole(actorRole, role) && actorRole !== "super_admin") {
      return { kind: "forbidden" } as const;
    }
    if (status !== undefined && status !== target.status && !hasAdminPermission(actorRole, "admin_users.suspend")) {
      return { kind: "forbidden" } as const;
    }

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(and(eq(adminUsers.role, "super_admin"), eq(adminUsers.status, "active")));
    if (
      wouldRemoveLastActiveSuperAdmin({
        activeSuperAdminCount: countRow?.count ?? 0,
        targetRole,
        targetStatus: target.status,
        nextRole,
        nextStatus,
      })
    ) {
      return { kind: "last_super_admin" } as const;
    }

    const now = new Date();
    const roleChanged = nextRole !== targetRole;
    const statusChanged = nextStatus !== target.status;
    const nextTokenVersion = roleChanged || nextStatus !== "active" ? target.tokenVersion + 1 : target.tokenVersion;
    const [updated] = await tx
      .update(adminUsers)
      .set({ role: nextRole, status: nextStatus, tokenVersion: nextTokenVersion, updatedAt: now })
      .where(eq(adminUsers.id, target.id))
      .returning();

    if (roleChanged || nextStatus !== "active") {
      await tx
        .update(adminSessions)
        .set({ revokedAt: now })
        .where(and(eq(adminSessions.adminUserId, target.id), isNull(adminSessions.revokedAt)));
    }

    if (roleChanged) {
      await insertAdminSecurityEvent(tx, {
        adminUserId: target.id,
        actorAdminId: actor.admin.id,
        eventType: "admin.role_changed",
        req,
        metadata: { fromRole: targetRole, toRole: nextRole },
      });
    }
    if (statusChanged) {
      await insertAdminSecurityEvent(tx, {
        adminUserId: target.id,
        actorAdminId: actor.admin.id,
        eventType: "admin.status_changed",
        req,
        metadata: { fromStatus: target.status, toStatus: nextStatus },
      });
    }

    return { kind: "updated", admin: toAdminAccountView(updated) } as const;
  });
}

export async function revokeAdminSessionsForAccount({
  actor,
  targetAdminId,
  req,
}: {
  actor: AdminAccountSessionContext;
  targetAdminId: string;
  req?: Request;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(adminUsers).where(eq(adminUsers.id, targetAdminId)).limit(1).for("update");
    if (!target) return false;
    if (target.role === "super_admin" && actor.admin.role !== "super_admin") return false;
    const now = new Date();
    await tx
      .update(adminUsers)
      .set({ tokenVersion: target.tokenVersion + 1, updatedAt: now })
      .where(eq(adminUsers.id, target.id));
    await tx
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.adminUserId, target.id), isNull(adminSessions.revokedAt)));
    await insertAdminSecurityEvent(tx, {
      adminUserId: target.id,
      actorAdminId: actor.admin.id,
      eventType: "admin.sessions_revoked",
      req,
      metadata: { allSessions: true },
    });
    return true;
  });
}

export type AdminSessionView = {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  mfaVerifiedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export async function listAdminSessions(context: AdminAccountSessionContext): Promise<AdminSessionView[]> {
  const retentionCutoff = new Date(Date.now() - ADMIN_SESSION_RETENTION_MS);
  const rows = await db
    .select()
    .from(adminSessions)
    .where(and(eq(adminSessions.adminUserId, context.admin.id), gt(adminSessions.createdAt, retentionCutoff)))
    .orderBy(desc(adminSessions.lastSeenAt))
    .limit(50);

  return rows.map((row) => ({
    id: row.id,
    current: row.id === context.sessionId,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    mfaVerifiedAt: row.mfaVerifiedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  }));
}

export async function revokeOwnAdminSession({
  context,
  sessionId,
  req,
}: {
  context: AdminAccountSessionContext;
  sessionId: string;
  req?: Request;
}): Promise<"revoked" | "current_session" | "not_found"> {
  if (sessionId === context.sessionId) return "current_session";
  const revoked = await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(adminSessions.id, sessionId), eq(adminSessions.adminUserId, context.admin.id), isNull(adminSessions.revokedAt)),
    )
    .returning({ id: adminSessions.id });
  if (!revoked.length) return "not_found";
  await recordAdminSecurityEvent({
    adminUserId: context.admin.id,
    actorAdminId: context.admin.id,
    eventType: "admin.session_revoked",
    req,
    metadata: { targetSessionId: sessionId },
  });
  return "revoked";
}

export async function revokeOtherOwnAdminSessions({
  context,
  req,
}: {
  context: AdminAccountSessionContext;
  req?: Request;
}): Promise<number> {
  const revoked = await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(adminSessions.adminUserId, context.admin.id),
        ne(adminSessions.id, context.sessionId),
        isNull(adminSessions.revokedAt),
      ),
    )
    .returning({ id: adminSessions.id });
  if (revoked.length) {
    await recordAdminSecurityEvent({
      adminUserId: context.admin.id,
      actorAdminId: context.admin.id,
      eventType: "admin.other_sessions_revoked",
      req,
      metadata: { revokedCount: revoked.length },
    });
  }
  return revoked.length;
}
