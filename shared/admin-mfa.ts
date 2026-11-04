/*
 * Pure administrator MFA primitives shared by the server and node tests.
 * Database storage, encryption, replay-counter persistence, cookies, and
 * audit logging live in backend/admin-mfa.ts and backend/admin-identity.ts.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function encodeBase32(bytes: Uint8Array): string {
  let output = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= bits === 0 ? 0 : (1 << bits) - 1;
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  while (output.length % 8 !== 0) output += "=";
  return output;
}

export function decodeBase32(input: string): Uint8Array | null {
  const normalized = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!normalized || normalized.length % 8 === 1) return null;

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= bits === 0 ? 0 : (1 << bits) - 1;
    }
  }
  return new Uint8Array(bytes);
}

export function generateTotpSecret(byteLength = 20): { bytes: Uint8Array; base32: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return { bytes, base32: encodeBase32(bytes) };
}

export async function totpForCounter(secret: Uint8Array, counter: number): Promise<string> {
  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), false);
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes as BufferSource));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function safeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/**
 * Return the matched 30-second counter for a TOTP code, or null. Callers must
 * persist/claim that counter atomically; this pure helper does not by itself
 * provide replay protection.
 */
export async function matchTotpCode({
  secret,
  code,
  at = Date.now(),
  window = 1,
}: {
  secret: Uint8Array;
  code: unknown;
  at?: number;
  window?: number;
}): Promise<number | null> {
  const normalized = typeof code === "string" ? code.replace(/\s/g, "") : "";
  if (!/^\d{6}$/.test(normalized)) return null;

  const currentCounter = Math.floor(at / 30_000);
  let matched: number | null = null;
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    if (safeEqualString(await totpForCounter(secret, counter), normalized)) matched = counter;
  }
  return matched;
}

export function buildTotpUri({ issuer, account, secret }: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secret.replace(/=+$/, ""),
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function randomIndex(maxExclusive: number): number {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maxExclusive;
}

export function normalizeRecoveryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z2-9]{12}$/.test(normalized) ? normalized : null;
}

export function generateRecoveryCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let raw = "";
    for (let index = 0; index < 12; index += 1) {
      raw += RECOVERY_CODE_ALPHABET[randomIndex(RECOVERY_CODE_ALPHABET.length)];
    }
    codes.add(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`);
  }
  return [...codes];
}
