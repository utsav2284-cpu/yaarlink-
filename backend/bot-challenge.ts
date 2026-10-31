import { hashKey, rateLimit } from "@/backend/rate-limit";

export const BOT_CHALLENGE_PURPOSES = ["contact", "report"] as const;
export type BotChallengePurpose = (typeof BOT_CHALLENGE_PURPOSES)[number];

export function isBotChallengePurpose(value: string | null): value is BotChallengePurpose {
  return value === "contact" || value === "report";
}

const BOT_CHALLENGE_DIFFICULTY = 14;
const BOT_CHALLENGE_TTL_MS = 10 * 60_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

type BotChallengePayload = {
  v: 1;
  purpose: BotChallengePurpose;
  iat: number;
  exp: number;
  salt: string;
  difficulty: number;
};

export type BotChallenge = {
  token: string;
  difficulty: number;
  expiresAt: number;
};

function challengeSecret(): string {
  return (
    process.env.BOT_CHALLENGE_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    ""
  );
}

export function botChallengeProblem(): string | null {
  return challengeSecret() ? null : "BOT_CHALLENGE_SECRET or SESSION_SECRET is not configured";
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    for (let shift = 7; shift >= 0; shift--) {
      if ((byte >> shift) & 1) return bits;
      bits++;
    }
    return bits;
  }
  return bits;
}

export async function createBotChallenge(purpose: BotChallengePurpose): Promise<BotChallenge> {
  const secret = challengeSecret();
  if (!secret) throw new Error("Bot challenge secret is not configured");

  const now = Date.now();
  const payload: BotChallengePayload = {
    v: 1,
    purpose,
    iat: now,
    exp: now + BOT_CHALLENGE_TTL_MS,
    salt: base64UrlEncode(crypto.getRandomValues(new Uint8Array(18))),
    difficulty: BOT_CHALLENGE_DIFFICULTY,
  };
  const body = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(await hmacSha256(secret, body));
  return { token: `${body}.${signature}`, difficulty: payload.difficulty, expiresAt: payload.exp };
}

type VerifiedBotChallenge = { tokenHash: string; expiresAt: number };

async function verifyBotChallenge(input: unknown, purpose: BotChallengePurpose): Promise<VerifiedBotChallenge | null> {
  const secret = challengeSecret();
  if (!secret || !input || typeof input !== "object" || Array.isArray(input)) return null;

  const candidate = input as { token?: unknown; nonce?: unknown };
  if (typeof candidate.token !== "string" || candidate.token.length < 20 || candidate.token.length > 1024) return null;
  if (typeof candidate.nonce !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(candidate.nonce)) return null;

  const [body, signatureValue, extra] = candidate.token.split(".");
  if (!body || !signatureValue || extra !== undefined) return null;
  const actualSignature = base64UrlDecode(signatureValue);
  if (!actualSignature || actualSignature.length !== 32) return null;
  const expectedSignature = await hmacSha256(secret, body);
  if (!constantTimeEqual(actualSignature, expectedSignature)) return null;

  const payloadBytes = base64UrlDecode(body);
  if (!payloadBytes) return null;
  let payload: BotChallengePayload;
  try {
    payload = JSON.parse(dec.decode(payloadBytes)) as BotChallengePayload;
  } catch {
    return null;
  }

  const now = Date.now();
  if (
    payload.v !== 1 ||
    payload.purpose !== purpose ||
    payload.difficulty !== BOT_CHALLENGE_DIFFICULTY ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp) ||
    payload.iat > now + 60_000 ||
    payload.exp <= now ||
    payload.exp - payload.iat > BOT_CHALLENGE_TTL_MS + 60_000 ||
    typeof payload.salt !== "string" ||
    payload.salt.length < 16 ||
    payload.salt.length > 64
  ) {
    return null;
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(`${candidate.token}.${candidate.nonce}`)),
  );
  if (leadingZeroBits(digest) < payload.difficulty) return null;

  return { tokenHash: await hashKey(`bot-challenge-token:${candidate.token}`), expiresAt: payload.exp };
}

/**
 * Verify and consume a proof-of-work token exactly once. Consumption uses
 * the distributed limiter, so a solved token cannot be replayed against
 * another app instance/isolate.
 */
export async function consumeBotChallenge(input: unknown, purpose: BotChallengePurpose): Promise<boolean> {
  const verified = await verifyBotChallenge(input, purpose);
  if (!verified) return false;
  const ttl = Math.max(1000, verified.expiresAt - Date.now());
  const once = await rateLimit(`bot-challenge-used:${verified.tokenHash}`, 1, ttl);
  return once.ok;
}
