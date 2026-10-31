import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { settings } from "@/backend/db/schema";

export const ADMIN_COOKIE = "__Host-yl_admin";
const ADMIN_DAYS = 1;
const ADMIN_SCOPE = "admin";
const ADMIN_SIGN_PREFIX = "yl_admin:";
const ADMIN_SESSION_VERSION_KEY = "admin_session_version";
const ADMIN_TOTP_LAST_COUNTER_KEY = "admin_totp_last_counter";
const ADMIN_CLOCK_SKEW_MS = 60_000;
const TOTP_PERIOD_SECONDS = 30;

type AdminTokenPayload = {
  scope: string;
  ver: number;
  iat: number;
  exp: number;
};

function safeEqualStr(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function toB64url(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str: string) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Raised when the admin signing secret is missing or not distinct from SESSION_SECRET. */
export class AdminSecretError extends Error {
  constructor(readonly reason: "missing" | "shared") {
    super(reason === "missing" ? "ADMIN_SESSION_SECRET is required" : "ADMIN_SESSION_SECRET must differ from SESSION_SECRET");
    this.name = "AdminSecretError";
  }
}

/**
 * ADMIN_SESSION_SECRET must be set and different from SESSION_SECRET. There is no fallback:
 * an admin token must never be signable with the same key as a user session.
 */
function getAdminSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new AdminSecretError("missing");
  if (secret === process.env.SESSION_SECRET) throw new AdminSecretError("shared");
  return secret;
}

/** null when admin auth is safely configured; otherwise the reason it is not (→ 503). */
export function adminSecretProblem(): "missing" | "shared" | null {
  try {
    getAdminSecret();
    return null;
  } catch (e) {
    return e instanceof AdminSecretError ? e.reason : "missing";
  }
}

function parseSafeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function getSettingInteger(key: string, fallback: number): Promise<number> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return fallback;
  const parsed = parseSafeInteger(row.value);
  if (parsed === null) throw new Error(`Invalid integer setting: ${key}`);
  return parsed;
}

async function claimTotpCounter(counter: number): Promise<boolean> {
  // A conditional upsert makes the check-and-claim atomic, so concurrent
  // requests cannot both spend the same authenticator time step.
  const [row] = await db
    .insert(settings)
    .values({ key: ADMIN_TOTP_LAST_COUNTER_KEY, value: String(counter), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: String(counter), updatedAt: new Date() },
      setWhere: sql`(${settings.value})::bigint < ${counter}`,
    })
    .returning({ value: settings.value });
  return Boolean(row);
}

/**
 * Admin tokens carry this database-backed version. Logout increments it, so
 * copied or previously issued admin cookies stop working immediately.
 */
export async function getAdminSessionVersion(): Promise<number> {
  const version = await getSettingInteger(ADMIN_SESSION_VERSION_KEY, 0);
  if (version < 0) throw new Error("Invalid admin session version");
  return version;
}

export async function revokeAdminSessions(): Promise<number> {
  const [row] = await db
    .insert(settings)
    .values({ key: ADMIN_SESSION_VERSION_KEY, value: "1", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql<string>`((${settings.value})::bigint + 1)::text`, updatedAt: new Date() },
    })
    .returning({ value: settings.value });
  const version = parseSafeInteger(row?.value);
  if (version === null || version < 0) throw new Error("Could not revoke admin sessions");
  return version;
}

function decodeBase32(input: string): Uint8Array | null {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!normalized || normalized.length % 8 === 1) return null;
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(bytes);
}

function getAdminTotpSecretBytes(): Uint8Array | null {
  const secret = process.env.ADMIN_TOTP_SECRET?.trim();
  if (!secret) return null;
  const decoded = decodeBase32(secret);
  return decoded && decoded.byteLength >= 10 ? decoded : null;
}

export function isAdminTotpEnabled(): boolean {
  return Boolean(process.env.ADMIN_TOTP_SECRET?.trim());
}

/** null when TOTP is disabled or valid; "invalid" prevents a silent password-only fallback. */
export function adminTotpProblem(): "invalid" | null {
  if (!isAdminTotpEnabled()) return null;
  return getAdminTotpSecretBytes() ? null : "invalid";
}

async function totpForCounter(secret: Uint8Array, counter: number): Promise<string> {
  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), false);
  const keyBytes = new Uint8Array(secret);
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes as BufferSource));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function verifyAdminTotp(given: unknown): Promise<boolean> {
  if (!isAdminTotpEnabled()) return true;
  const secret = getAdminTotpSecretBytes();
  if (!secret) throw new Error("ADMIN_TOTP_SECRET is invalid");
  const code = typeof given === "string" ? given.replace(/\s/g, "") : "";
  if (!/^\d{6}$/.test(code)) return false;

  const currentCounter = Math.floor(Date.now() / (TOTP_PERIOD_SECONDS * 1000));
  let matchedCounter: number | null = null;
  for (const offset of [-1, 0, 1]) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    if (safeEqualStr(await totpForCounter(secret, counter), code)) matchedCounter = counter;
  }
  if (matchedCounter === null) return false;

  // Atomically remember the accepted time step so the same code cannot be replayed.
  return claimTotpCounter(matchedCounter);
}

async function sign(body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(getAdminSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return toB64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ADMIN_SIGN_PREFIX + body))));
}

export async function createAdminSession() {
  const now = Date.now();
  const payload: AdminTokenPayload = {
    scope: ADMIN_SCOPE,
    ver: await getAdminSessionVersion(),
    iat: now,
    exp: now + ADMIN_DAYS * 864e5,
  };
  const body = toB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const token = `${body}.${await sign(body)}`;
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: ADMIN_DAYS * 86400 });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig) return false;
  try {
    const expected = await sign(body);
    if (!expected || !safeEqualStr(expected, sig)) return false;
    const parsed = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Partial<AdminTokenPayload>;
    const version = parseSafeInteger(parsed.ver);
    const issuedAt = parseSafeInteger(parsed.iat);
    const expiresAt = parseSafeInteger(parsed.exp);
    const now = Date.now();
    // Old-format tokens (scope + exp only) intentionally fail here, revoking them on deploy.
    if (parsed.scope !== ADMIN_SCOPE || version === null || version < 0 || issuedAt === null || expiresAt === null) return false;
    if (issuedAt > now + ADMIN_CLOCK_SKEW_MS || expiresAt <= now) return false;
    if (expiresAt - issuedAt > ADMIN_DAYS * 864e5 + ADMIN_CLOCK_SKEW_MS) return false;
    return version === (await getAdminSessionVersion());
  } catch {
    return false;
  }
}

/** ADMIN_PASSWORD is required — the legacy settings-table hash fallback has been removed. */
export async function verifyAdminPassword(given: string) {
  const envPass = process.env.ADMIN_PASSWORD;
  if (!envPass) return false;
  return safeEqualStr(given, envPass);
}
