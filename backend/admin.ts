import { cookies } from "next/headers";

export const ADMIN_COOKIE = "__Host-yl_admin";
const ADMIN_DAYS = 1;
const ADMIN_SCOPE = "admin";
const ADMIN_SIGN_PREFIX = "yl_admin:";

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

async function sign(body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(getAdminSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return toB64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ADMIN_SIGN_PREFIX + body))));
}

export async function createAdminSession() {
  const body = toB64url(new TextEncoder().encode(JSON.stringify({ scope: ADMIN_SCOPE, exp: Date.now() + ADMIN_DAYS * 864e5 })));
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
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  try {
    const expected = await sign(body);
    if (!expected || !safeEqualStr(expected, sig)) return false;
    const parsed = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    // A user session token has no `scope`, so it can never satisfy this check.
    return parsed.scope === ADMIN_SCOPE && Number(parsed.exp) > Date.now();
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
