import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/backend/db";
import { userSessions, users } from "@/backend/db/schema";
import { PASSWORD_MAX_LENGTH, passwordLength } from "@/backend/password-policy";
import { getSigningSecret, signingSecretProblemForName } from "@/backend/secret-config";

/*
 * Auth helpers built on Web Crypto for the Node.js runtime.
 * - Passwords: PBKDF2-SHA256 (100k iterations). Old bcrypt hashes still verify.
 * - Sessions: signed, httpOnly cookie (HMAC-SHA256) carrying a server-side
 *   session ID. Individual devices can be revoked in user_sessions, while
 *   users.token_version remains the "revoke everything" backstop.
 */

export const SESSION_COOKIE = "__Host-yl_session";
const SESSION_DAYS = 7;
const SESSION_SIGN_PREFIX = "yl_session:";
const PBKDF2_ITERATIONS = 100_000;
// A valid-format, non-account PBKDF2 hash used only to spend equivalent
// verification work for unknown accounts and malformed stored hashes. It is
// not the hash of a usable credential.
const DUMMY_PASSWORD_HASH =
  "pbkdf2$100000$eWFhcmxpbmstZHVtbXkxNg$PCmJkPkbXYEiubgq4VuyMxyuXSi6zZ8NO6JkAQhtkhw";
// Tokens claiming an `iat` further ahead than this are rejected (small allowance for clock skew).
const MAX_CLOCK_SKEW_MS = 60_000;
const SESSION_TOUCH_INTERVAL_MS = 15 * 60_000;
const SESSION_RETENTION_MS = 30 * 864e5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const enc = new TextEncoder();

function toB64url(bytes: ArrayBuffer | Uint8Array) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str: string) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function safeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64url(salt)}$${toB64url(hash)}`;
}

function decodePasswordPart(value: string | undefined, minBytes: number, maxBytes: number): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = fromB64url(value);
    return bytes.length >= minBytes && bytes.length <= maxBytes ? bytes : null;
  } catch {
    return null;
  }
}

async function burnPasswordVerification(password: string): Promise<void> {
  try {
    const [, iter, salt, hash] = DUMMY_PASSWORD_HASH.split("$");
    const saltBytes = decodePasswordPart(salt, 8, 64);
    const hashBytes = decodePasswordPart(hash, 16, 64);
    if (!saltBytes || !hashBytes) return;
    const calc = await pbkdf2(password, saltBytes, Number(iter));
    // The comparison result is intentionally discarded; performing it keeps
    // this path shaped like a real PBKDF2 verification.
    safeEqual(calc, hashBytes);
  } catch {
    // A crypto failure must still fail closed below.
  }
}

/** Returns { ok, needsRehash } — needsRehash is true for legacy bcrypt hashes. */
export async function verifyPassword(password: string, stored: string) {
  try {
    if (stored.startsWith("pbkdf2$")) {
      const parts = stored.split("$");
      const iterations = Number(parts[1]);
      const salt = decodePasswordPart(parts[2], 8, 64);
      const hash = decodePasswordPart(parts[3], 16, 64);
      if (
        parts.length === 4 &&
        Number.isSafeInteger(iterations) &&
        iterations >= 1 &&
        iterations <= 1_000_000 &&
        salt &&
        hash
      ) {
        const calc = await pbkdf2(password, salt, iterations);
        return { ok: safeEqual(calc, hash), needsRehash: false };
      }
    } else if (stored.startsWith("$2")) {
      return { ok: await bcrypt.compare(password, stored), needsRehash: true };
    }
  } catch {
    // Malformed stored data gets the same dummy work and a closed result.
  }

  await burnPasswordVerification(password);
  return { ok: false, needsRehash: false };
}

/**
 * Login-specific verification that never skips password work merely because
 * the submitted email has no account. Unknown accounts and over-long
 * candidates run against the dummy PBKDF2 hash before returning the same
 * closed result as a wrong password for a real account.
 */
export async function verifyLoginPassword(password: string, storedHash?: string | null) {
  if (passwordLength(password) > PASSWORD_MAX_LENGTH) {
    await burnPasswordVerification("yaarlink-overlong-login-password");
    return { ok: false, needsRehash: false };
  }
  if (!storedHash) {
    await burnPasswordVerification(password);
    return { ok: false, needsRehash: false };
  }
  return verifyPassword(password, storedHash);
}

/* ---------- session secret ---------- */

/**
 * SESSION_SECRET must be strong, machine-generated key material. There is no
 * database fallback: missing, placeholder, or weak configuration fails closed
 * rather than signing sessions with an unsuitable key.
 */
function getSecret() {
  return getSigningSecret("SESSION_SECRET");
}

export function sessionSecretProblem(): "missing" | "weak" | null {
  return signingSecretProblemForName("SESSION_SECRET");
}

/**
 * The session store could not be checked. This is deliberately distinct from
 * a missing, invalid, expired, or revoked session: an outage must never be
 * reported to a visitor or an authorization check as "logged out".
 */
export class SessionUnavailableError extends Error {
  readonly code = "service_unavailable" as const;

  constructor(cause?: unknown) {
    super("Session service is temporarily unavailable", cause === undefined ? undefined : { cause });
    this.name = "SessionUnavailableError";
  }
}

export function isSessionUnavailableError(error: unknown): error is SessionUnavailableError {
  return error instanceof SessionUnavailableError;
}

/**
 * Log only the root error name/code for a session-store failure. The full
 * Drizzle cause can contain the SQL text and bound user/session identifiers,
 * neither of which belongs in routine operational logs.
 */
export function logSessionUnavailable(error: SessionUnavailableError, operation = "lookup"): void {
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
  console.error(`[session] ${operation} failed`, {
    name: root?.name || "UnknownError",
    code: typeof code === "string" || typeof code === "number" ? String(code) : "unknown",
  });
}

/** Standard controlled-degraded response for a failed session lookup. */
export function sessionUnavailableResponse(headersInit?: HeadersInit): Response {
  const headers = new Headers(headersInit);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  headers.set("Retry-After", "30");
  return Response.json(
    { error: "Session service is temporarily unavailable", code: "service_unavailable" },
    { status: 503, headers },
  );
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/* ---------- sessions ---------- */

type Payload = { uid: string; sid: string; ver: number; iat: number; exp: number };

export type UserSessionRecord = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requestUserAgent(req?: Request) {
  const value = req?.headers.get("user-agent")?.trim();
  return value ? value.slice(0, 500) : null;
}

/** Build the DB row before signing so signup completion can insert the user and its first session atomically. */
export function createUserSessionRecord(req?: Request): UserSessionRecord {
  const createdAt = new Date();
  return {
    id: crypto.randomUUID(),
    userAgent: requestUserAgent(req),
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: new Date(createdAt.getTime() + SESSION_DAYS * 864e5),
  };
}

export async function createSessionToken(uid: string, tokenVersion: number, sessionId: string, issuedAt = Date.now()) {
  const payload: Payload = { uid, sid: sessionId, ver: tokenVersion, iat: issuedAt, exp: issuedAt + SESSION_DAYS * 864e5 };
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${toB64url(await hmac(SESSION_SIGN_PREFIX + body))}`;
}

async function readToken(token: string | undefined): Promise<Payload | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    if (!safeEqual(await hmac(SESSION_SIGN_PREFIX + body), fromB64url(sig))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    const now = Date.now();
    if (!isSessionId(payload.uid) || !isSessionId(payload.sid) || !Number.isSafeInteger(payload.ver) || payload.ver < 0) return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.iat !== "number" || payload.iat > now + MAX_CLOCK_SKEW_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createUserSession(uid: string, tokenVersion: number, req?: Request) {
  const record = createUserSessionRecord(req);
  // Sign first so a missing SESSION_SECRET fails before inserting an orphan
  // server-side session that no browser could ever use.
  const token = await createSessionToken(uid, tokenVersion, record.id, record.createdAt.getTime());
  const retentionCutoff = new Date(Date.now() - SESSION_RETENTION_MS);

  // Keep recently expired/revoked rows available for the owner's export, but
  // do not retain device history forever.
  await db
    .delete(userSessions)
    .where(
      and(
        eq(userSessions.userId, uid),
        or(lt(userSessions.expiresAt, retentionCutoff), lt(userSessions.revokedAt, retentionCutoff)),
      ),
    );
  await db.insert(userSessions).values({ ...record, userId: uid, tokenVersion });

  return { ...record, token };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DAYS * 86400,
} as const;

export async function setSessionCookie(uid: string, tokenVersion: number, req?: Request) {
  const session = await createUserSession(uid, tokenVersion, req);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, SESSION_COOKIE_OPTIONS);
  return session;
}

/** Reissue the cookie for an existing DB session after a token-version rotation (for example, a password change). */
export async function setExistingSessionCookie(uid: string, tokenVersion: number, sessionId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(uid, tokenVersion, sessionId), SESSION_COOKIE_OPTIONS);
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
};

export type SessionContext = {
  user: SessionUser;
  sessionId: string;
  tokenVersion: number;
  sessionCreatedAt: Date;
  sessionExpiresAt: Date;
};

/**
 * The logged-in user plus the individual device session. Cookies issued
 * before server-side sessions existed have no `sid`; they are intentionally
 * rejected so every active login can be listed and revoked by its owner.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const problem = sessionSecretProblem();
    if (problem) throw new SessionUnavailableError(new Error(`SESSION_SECRET is ${problem}`));
  }

  const payload = await readToken(token);
  if (!payload) return null;

  const now = new Date();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      tokenVersion: users.tokenVersion,
      sessionId: userSessions.id,
      sessionTokenVersion: userSessions.tokenVersion,
      sessionCreatedAt: userSessions.createdAt,
      sessionLastSeenAt: userSessions.lastSeenAt,
      sessionExpiresAt: userSessions.expiresAt,
      sessionRevokedAt: userSessions.revokedAt,
    })
    .from(users)
    .innerJoin(userSessions, and(eq(userSessions.userId, users.id), eq(userSessions.id, payload.sid)))
    .where(eq(users.id, payload.uid))
    .limit(1)
    .catch((error: unknown) => {
      // A database failure is unknown session state, not a logged-out user.
      throw new SessionUnavailableError(error);
    });

  const row = rows[0];
  if (
    !row ||
    row.tokenVersion !== payload.ver ||
    row.sessionTokenVersion !== payload.ver ||
    row.sessionRevokedAt ||
    row.sessionExpiresAt.getTime() <= now.getTime()
  ) {
    return null;
  }

  if (now.getTime() - row.sessionLastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    const touched = await db
      .update(userSessions)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(userSessions.id, row.sessionId),
          eq(userSessions.userId, row.id),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, now),
        ),
      )
      .returning({ id: userSessions.id })
      .catch((error: unknown) => {
        throw new SessionUnavailableError(error);
      });
    if (!touched.length) return null;
  }

  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      emailVerifiedAt: row.emailVerifiedAt,
      createdAt: row.createdAt,
    },
    sessionId: row.sessionId,
    tokenVersion: row.tokenVersion,
    sessionCreatedAt: row.sessionCreatedAt,
    sessionExpiresAt: row.sessionExpiresAt,
  };
}

/** The logged-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getSessionContext())?.user ?? null;
}

export async function revokeUserSession(uid: string, sessionId: string) {
  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.userId, uid), eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  return revoked.length > 0;
}

export async function revokeOtherUserSessions(uid: string, currentSessionId: string) {
  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.userId, uid), ne(userSessions.id, currentSessionId), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  return revoked.length;
}

export async function revokeAllUserSessions(uid: string) {
  const revoked = await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.userId, uid), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  return revoked.length;
}

/** Invalidate every session cookie issued for this user so far and mark the device rows revoked too. */
export async function bumpTokenVersion(uid: string) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, uid))
      .returning({ tokenVersion: users.tokenVersion });
    await tx
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(userSessions.userId, uid), isNull(userSessions.revokedAt)));
    return updated?.tokenVersion ?? null;
  });
}
