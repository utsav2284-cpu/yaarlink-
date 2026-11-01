export type DisallowedContentReason = "url" | "contact" | "profanity" | "scam" | "spam";

const URL_PATTERN =
  /(?:https?:\/\/|hxxps?:\/\/|www\.|\b[a-z0-9][a-z0-9-]{0,62}\.(?:com|net|org|io|co|in|me|ly|gg|xyz|top|site|online|click|link|info|biz|app|dev|ai|to|cc|tv|ru|su)\b|\[\s*dot\s*\]|\s+dot\s+)/i;

const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d[\s().-]?){7,}\d/;

const SCAM_PATTERNS: RegExp[] = [
  /\b(?:registration|joining|processing)\s+(?:fee|payment|charge)\b/i,
  /\b(?:security\s+deposit|pay\s+first|send\s+money|gift\s+cards?)\b/i,
  /\b(?:share|send|give).{0,30}\b(?:otp|password|bank\s+details?|card\s+details?|seed\s+phrase)\b/i,
  /\b(?:crypto|bitcoin|forex|investment).{0,40}\b(?:double|doubling|guaranteed|profit|returns?)\b/i,
  /\b(?:double|doubling).{0,30}\b(?:money|investment|crypto|bitcoin)\b/i,
  /\bguaranteed\s+(?:income|profit|returns?|earnings?)\b/i,
  /\bearn\b.{0,40}\b(?:per\s+day|daily|every\s+day)\b/i,
  /\b(?:daily\s+income|work\s+from\s+home\s+task|telegram\s+task|whatsapp\s+task)\b/i,
  /\b(?:buy|free|cheap)\s+(?:followers?|likes?|subscribers?|views?)\b/i,
  /\b(?:betting|casino|gambling)\b.{0,40}\b(?:bonus|earn|profit|join|link)\b/i,
  /\bloan\b.{0,40}\b(?:no\s+documents?|instant\s+approval|guaranteed\s+approval)\b/i,
  /\b(?:claim|win).{0,30}\b(?:prize|bonus|cashback|reward)\b/i,
  /\bwallet\s+connect\b/i,
];

const PROFANITY = new Set([
  "asshole",
  "bastard",
  "behenchod",
  "bhenchod",
  "bhosdike",
  "bitch",
  "chutiya",
  "dick",
  "fuck",
  "fucker",
  "fucking",
  "gaand",
  "harami",
  "madarchod",
  "motherfucker",
  "pussy",
  "randi",
  "shit",
  "slut",
  "whore",
  "मादरचोद",
  "बहनचोद",
  "भोसड़ीके",
  "चूतिया",
  "रंडी",
  "ਹਰਾਮੀ",
  "ਭੈਣਚੋਦ",
  "ਮਾਦਰਚੋਦ",
]);

const URL_SHORTENER_HOSTS = new Set([
  "bit.ly",
  "cutt.ly",
  "is.gd",
  "qr.ae",
  "rb.gy",
  "rebrand.ly",
  "shorturl.at",
  "t.co",
  "tinyurl.com",
  "v.gd",
]);

const SUSPICIOUS_URL_TERMS = [
  "claim-bonus",
  "crypto-doubler",
  "free-money",
  "login-verify",
  "verify-wallet",
  "wallet-connect",
];

function deLeet(token: string): string {
  return token
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function hasProfanity(normalized: string): boolean {
  const tokens = normalized.match(/[\p{L}\p{N}$@]+/gu) ?? [];
  if (tokens.some((token) => PROFANITY.has(token) || PROFANITY.has(deLeet(token)))) return true;

  // Catch deliberately spaced/punctuated spellings such as "f u c k" without
  // scanning across ordinary word boundaries (which causes false positives).
  let singleCharacterRun = "";
  const runs: string[] = [];
  for (const token of tokens) {
    if (token.length === 1) {
      singleCharacterRun += token;
    } else if (singleCharacterRun) {
      runs.push(singleCharacterRun);
      singleCharacterRun = "";
    }
  }
  if (singleCharacterRun) runs.push(singleCharacterRun);

  return runs.some((run) => {
    const comparable = deLeet(run);
    return [...PROFANITY].some((term) => comparable.includes(term));
  });
}

function hasSpamRepetition(normalized: string): boolean {
  if (/(.)\1{13,}/u.test(normalized)) return true;
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (token.length < 3) continue;
    const next = (counts.get(token) ?? 0) + 1;
    if (next >= 8) return true;
    counts.set(token, next);
  }
  return false;
}

/**
 * Conservative application-content gate. It is intentionally narrower than a
 * general-purpose profanity filter: obvious scams, profanity, repetitive
 * spam and (for creator messages) links or off-platform contact details are
 * rejected, while ordinary discussion of fees and deliverables is allowed.
 */
export function findDisallowedContent(
  value: string | null | undefined,
  options: { allowUrls?: boolean; allowContactDetails?: boolean } = {},
): DisallowedContentReason | null {
  if (!value) return null;
  const normalized = value.normalize("NFKC").toLowerCase();

  if (!options.allowUrls && URL_PATTERN.test(normalized)) return "url";
  if (!options.allowContactDetails && (EMAIL_PATTERN.test(normalized) || PHONE_PATTERN.test(normalized))) {
    return "contact";
  }
  if (SCAM_PATTERNS.some((pattern) => pattern.test(normalized))) return "scam";
  if (hasProfanity(normalized)) return "profanity";
  if (hasSpamRepetition(normalized)) return "spam";
  return null;
}

/** Block hidden-destination shorteners and obviously scam-shaped profile URLs. */
export function hasSuspiciousUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  if (URL_SHORTENER_HOSTS.has(host)) return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("xn--")) return true;
  const comparable = `${host}${url.pathname}`.toLowerCase();
  return SUSPICIOUS_URL_TERMS.some((term) => comparable.includes(term));
}
