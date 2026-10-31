import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/backend/db";
import { users } from "@/backend/db/schema";

/*
 * Auth helpers built on Web Crypto, so they run fast on Node and on Cloudflare Workers.
 * - Passwords: PBKDF2-SHA256 (100k iterations, the Workers maximum). Old bcrypt hashes still verify.
 * - Sessions: signed, httpOnly cookie (HMAC-SHA256). Revoked server-side via users.token_version.
 */

export const SESSION_COOKIE = "__Host-yl_session";
const SESSION_DAYS = 7;
const SESSION_SIGN_PREFIX = "yl_session:";
const PBKDF2_ITERATIONS = 100_000;
// Tokens claiming an `iat` further ahead than this are rejected (small allowance for clock skew).
const MAX_CLOCK_SKEW_MS = 60_000;

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

/** Returns { ok, needsRehash } — needsRehash is true for legacy bcrypt hashes. */
export async function verifyPassword(password: string, stored: string) {
  if (stored.startsWith("pbkdf2$")) {
    const [, iter, salt, hash] = stored.split("$");
    const calc = await pbkdf2(password, fromB64url(salt), Number(iter));
    return { ok: safeEqual(calc, fromB64url(hash)), needsRehash: false };
  }
  if (stored.startsWith("$2")) {
    return { ok: await bcrypt.compare(password, stored), needsRehash: true };
  }
  return { ok: false, needsRehash: false };
}

/* ---------- session secret ---------- */

/**
 * SESSION_SECRET is required. There is no database fallback: a missing secret fails the
 * request rather than silently signing sessions with a key stored next to the data it protects.
 */
function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return secret;
}

export function sessionSecretProblem(): "missing" | null {
  return process.env.SESSION_SECRET ? null : "missing";
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

type Payload = { uid: string; ver: number; iat: number; exp: number };

export async function createSessionToken(uid: string, tokenVersion: number) {
  const now = Date.now();
  const payload: Payload = { uid, ver: tokenVersion, iat: now, exp: now + SESSION_DAYS * 864e5 };
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
    if (!payload.uid || typeof payload.ver !== "number") return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.iat !== "number" || payload.iat > now + MAX_CLOCK_SKEW_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DAYS * 86400,
} as const;

export async function setSessionCookie(uid: string, tokenVersion: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(uid, tokenVersion), SESSION_COOKIE_OPTIONS);
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export type SessionUser = { id: string; name: string; email: string; phone: string | null; role: string };

/** The logged-in user, or null. Old cookies stop working once token_version is bumped. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const payload = await readToken(jar.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, payload.uid))
    .limit(1);
  const user = rows[0];
  if (!user || user.tokenVersion !== payload.ver) return null;
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}

/** Invalidate every session cookie issued for this user so far (called on logout). */
export async function bumpTokenVersion(uid: string) {
  await db.update(users).set({ tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, uid));
}
