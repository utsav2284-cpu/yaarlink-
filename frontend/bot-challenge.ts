"use client";

export type BotChallengePurpose = "contact" | "report";
export type SolvedBotChallenge = { token: string; nonce: string };

const enc = new TextEncoder();

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

/**
 * Fetch a short-lived server challenge and solve a small SHA-256 proof of
 * work in the browser. This is invisible to normal visitors but makes bulk
 * unauthenticated form submissions materially more expensive.
 */
export async function solveBotChallenge(purpose: BotChallengePurpose): Promise<SolvedBotChallenge> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  const res = await fetch(`/api/bot-challenge?purpose=${purpose}`, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { token?: unknown; difficulty?: unknown };
  if (!res.ok || typeof data.token !== "string" || typeof data.difficulty !== "number") {
    throw new Error("Could not fetch bot challenge");
  }

  let counter = Math.floor(Math.random() * 1_000_000);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const nonce = counter.toString(36);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", enc.encode(`${data.token}.${nonce}`)),
    );
    if (leadingZeroBits(digest) >= data.difficulty) return { token: data.token, nonce };
    counter++;
    if (counter % 512 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Bot challenge timed out");
}
