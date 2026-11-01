const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates the short proof-of-ownership code shown only to the listing owner
 * (and the admin reviewer). The owner sends it from the linked social/business
 * account or temporarily places it in that account's bio/about section.
 */
export function createVerificationCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `YL-${suffix}`;
}

export { isUuid, parseUuid } from "@/backend/validation";

export function normalizeReviewStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
