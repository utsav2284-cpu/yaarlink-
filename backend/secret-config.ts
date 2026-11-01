/*
 * Central validation for authentication-related server configuration.
 *
 * Signing secrets must look like machine-generated key material, not merely
 * be non-empty. The checks intentionally accept the documented
 * `openssl rand -hex 32` format (and ordinary Base64/alphanumeric generated
 * secrets) while rejecting copied examples, short values, repeated patterns,
 * whitespace-bearing values, and ordinary lower-case human passphrases.
 * Error messages contain variable names and reasons only—never secret values.
 */

export type SecretEnvironment = Record<string, string | undefined>;
export type SecretProblemReason = "missing" | "weak" | "shared" | "invalid";
export type SecretConfigurationProblem = {
  name: string;
  reason: SecretProblemReason;
};
export type SigningSecretName = "SESSION_SECRET" | "ADMIN_SESSION_SECRET" | "BOT_CHALLENGE_SECRET";

export const SIGNING_SECRET_MIN_LENGTH = 32;
export const SIGNING_SECRET_MAX_LENGTH = 512;
export const ADMIN_PASSWORD_MIN_LENGTH = 16;
export const ADMIN_PASSWORD_MAX_LENGTH = 256;

export class SecretConfigurationError extends Error {
  readonly problems: readonly SecretConfigurationProblem[];

  constructor(problems: SecretConfigurationProblem[]) {
    super(
      `Invalid server secret configuration: ${problems
        .map((problem) => `${problem.name} (${problem.reason})`)
        .join(", ")}`,
    );
    this.name = "SecretConfigurationError";
    this.problems = problems;
  }

  get reason(): SecretProblemReason {
    return this.problems[0]?.reason ?? "invalid";
  }
}

const PLACEHOLDER_PATTERNS = [
  /change(?:[-_\s]*me|me)/i,
  /replace(?:[-_\s]*(?:me|this|with)|with)/i,
  /placeholder/i,
  /your[-_\s]*(?:secret|password|key|token)/i,
  /(?:example|sample|dummy|test|dev|local|default)[-_\s]*(?:secret|password|key|token)/i,
  /(?:secret|password|key|token)[-_\s]*(?:example|sample|dummy|test|dev|local|default)/i,
  /(?:insert|paste|put)[-_\s]*(?:your[-_\s]*)?(?:secret|password|key|token)/i,
  /(?:super|very|my|long)[-_\s]*secret/i,
  /random[-_\s]*characters/i,
  /session[-_\s]*secret/i,
  /admin[-_\s]*secret/i,
  /secret[-_\s]*key/i,
  /let[-_\s]*me[-_\s]*in/i,
  /^x{4,}$/i,
  /todo/i,
];

export function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function shannonEntropy(chars: string[]): number {
  const counts = new Map<string, number>();
  for (const char of chars) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / chars.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function isRepeatedPattern(value: string, maxChunkLength = 16): boolean {
  const max = Math.min(maxChunkLength, Math.floor(value.length / 2));
  for (let length = 1; length <= max; length++) {
    const chunk = value.slice(0, length);
    if (chunk.repeat(Math.ceil(value.length / length)).slice(0, value.length) === value) return true;
  }
  return false;
}

function characterClassCount(value: string): number {
  let count = 0;
  if (/[a-z]/.test(value)) count++;
  if (/[A-Z]/.test(value)) count++;
  if (/[0-9]/.test(value)) count++;
  if (/[^A-Za-z0-9]/.test(value)) count++;
  return count;
}

function estimatedEntropyBits(value: string, length: number): number {
  let pool = 0;
  if (/[a-z]/.test(value)) pool += 26;
  if (/[A-Z]/.test(value)) pool += 26;
  if (/[0-9]/.test(value)) pool += 10;
  if (/[^A-Za-z0-9\s]/.test(value)) pool += 33;
  if (/[^\x00-\x7f]/.test(value)) pool += 128;
  return pool > 1 ? length * Math.log2(pool) : 0;
}

/** Returns why a signing secret is unusable, or null when it is strong enough. */
export function signingSecretProblem(value: string | undefined): "missing" | "weak" | null {
  if (value === undefined || value === "") return "missing";

  const chars = codePoints(value);
  if (chars.length < SIGNING_SECRET_MIN_LENGTH || chars.length > SIGNING_SECRET_MAX_LENGTH) return "weak";
  if (/[\s\u0000-\u001f\u007f]/u.test(value)) return "weak";
  if (isPlaceholderSecret(value)) return "weak";
  if (isRepeatedPattern(value)) return "weak";

  const lower = value.toLowerCase();
  if (
    lower.includes("abcdefghijklmnopqrstuvwxyz") ||
    lower.includes("zyxwvutsrqponmlkjihgfedcba") ||
    lower.includes("01234567890123456789") ||
    lower.includes("98765432109876543210")
  ) {
    return "weak";
  }

  const entropy = shannonEntropy(chars);
  const distinct = new Set(chars).size;
  if (entropy < 3 || distinct < 8) return "weak";
  if (estimatedEntropyBits(value, chars.length) < 128) return "weak";

  const classes = characterClassCount(value);
  if (classes < 2 && !(chars.length >= 64 && entropy >= 4.2)) return "weak";

  // A long string made mostly of lower-case letters/separators is the shape
  // of a human passphrase. Hex is exempted because its letter ratio varies by
  // chance; other machine-generated formats normally include upper-case
  // letters, symbols, or many more digits. A mixed lower-case/digit value
  // with at least 4 bits of per-character Shannon entropy is also treated as
  // generated material, while ordinary word-like strings stay below that.
  const isHex = /^[0-9a-f]+$/i.test(value);
  const letters = (value.match(/[A-Za-z]/g) ?? []).length;
  const letterRatio = letters / chars.length;
  const generatedLookingAlphanumeric = classes >= 2 && entropy >= 4;
  if (
    !isHex &&
    !/[A-Z]/.test(value) &&
    letterRatio > 0.6 &&
    !generatedLookingAlphanumeric &&
    !(chars.length >= 64 && entropy >= 4.2)
  ) {
    return "weak";
  }

  return null;
}

export function signingSecretProblemForName(
  name: SigningSecretName,
  env: SecretEnvironment = process.env,
): "missing" | "weak" | null {
  return signingSecretProblem(env[name]);
}

export function getSigningSecret(name: SigningSecretName, env: SecretEnvironment = process.env): string {
  const problem = signingSecretProblemForName(name, env);
  if (problem) throw new SecretConfigurationError([{ name, reason: problem }]);
  return env[name] as string;
}

const COMMON_ADMIN_PASSWORDS = new Set([
  "administrator",
  "adminpassword",
  "passwordpassword",
  "letmeinletmein",
  "yaarlinkadmin",
  "adminyaarlink",
  "changepassword",
  "defaultpassword",
]);

export function adminPasswordProblem(
  value: string | undefined,
  env: SecretEnvironment = process.env,
): "missing" | "weak" | "shared" | null {
  if (value === undefined || value === "") return "missing";

  const length = codePoints(value).length;
  if (length < ADMIN_PASSWORD_MIN_LENGTH || length > ADMIN_PASSWORD_MAX_LENGTH) return "weak";
  if (isPlaceholderSecret(value)) return "weak";
  if (new Set(codePoints(value)).size <= 2 || isRepeatedPattern(value, 8)) return "weak";

  const compact = value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMMON_ADMIN_PASSWORDS.has(compact)) return "weak";

  if (
    value === env.SESSION_SECRET ||
    value === env.ADMIN_SESSION_SECRET ||
    value === env.BOT_CHALLENGE_SECRET
  ) {
    return "shared";
  }
  return null;
}

export function decodeBase32Secret(input: string): Uint8Array | null {
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
      value &= bits === 0 ? 0 : (1 << bits) - 1;
    }
  }
  return new Uint8Array(bytes);
}

export function adminTotpSecretProblem(value: string | undefined): "invalid" | null {
  if (value === undefined || value.trim() === "") return null;
  const decoded = decodeBase32Secret(value.trim());
  if (!decoded || decoded.byteLength < 10) return "invalid";
  return new Set(decoded).size >= 4 ? null : "invalid";
}

export function botChallengeSecretProblem(env: SecretEnvironment = process.env): SecretConfigurationProblem | null {
  const botSecret = env.BOT_CHALLENGE_SECRET;
  if (botSecret) {
    if (botSecret === env.SESSION_SECRET || botSecret === env.ADMIN_SESSION_SECRET) {
      return { name: "BOT_CHALLENGE_SECRET", reason: "shared" };
    }
    const problem = signingSecretProblem(botSecret);
    return problem ? { name: "BOT_CHALLENGE_SECRET", reason: problem } : null;
  }

  if (!signingSecretProblem(env.SESSION_SECRET)) return null;
  if (!signingSecretProblem(env.ADMIN_SESSION_SECRET) && env.ADMIN_SESSION_SECRET !== env.SESSION_SECRET) return null;
  return { name: "BOT_CHALLENGE_SECRET", reason: "missing" };
}

export function getBotChallengeSecret(env: SecretEnvironment = process.env): string {
  if (botChallengeSecretProblem(env)) return "";
  return env.BOT_CHALLENGE_SECRET || env.SESSION_SECRET || env.ADMIN_SESSION_SECRET || "";
}

/**
 * Validate every authentication secret needed by the deployed app. Optional
 * values are validated whenever present; optional TOTP must not silently
 * degrade to password-only admin login because its value is malformed.
 */
export function collectServerSecretProblems(env: SecretEnvironment = process.env): SecretConfigurationProblem[] {
  const problems: SecretConfigurationProblem[] = [];

  const sessionProblem = signingSecretProblem(env.SESSION_SECRET);
  if (sessionProblem) problems.push({ name: "SESSION_SECRET", reason: sessionProblem });

  if (!env.ADMIN_SESSION_SECRET) {
    problems.push({ name: "ADMIN_SESSION_SECRET", reason: "missing" });
  } else if (env.ADMIN_SESSION_SECRET === env.SESSION_SECRET) {
    problems.push({ name: "ADMIN_SESSION_SECRET", reason: "shared" });
  } else {
    const problem = signingSecretProblem(env.ADMIN_SESSION_SECRET);
    if (problem) problems.push({ name: "ADMIN_SESSION_SECRET", reason: problem });
  }

  if (env.BOT_CHALLENGE_SECRET) {
    if (env.BOT_CHALLENGE_SECRET === env.SESSION_SECRET || env.BOT_CHALLENGE_SECRET === env.ADMIN_SESSION_SECRET) {
      problems.push({ name: "BOT_CHALLENGE_SECRET", reason: "shared" });
    } else {
      const problem = signingSecretProblem(env.BOT_CHALLENGE_SECRET);
      if (problem) problems.push({ name: "BOT_CHALLENGE_SECRET", reason: problem });
    }
  }

  const passwordProblem = adminPasswordProblem(env.ADMIN_PASSWORD, env);
  if (passwordProblem) problems.push({ name: "ADMIN_PASSWORD", reason: passwordProblem });

  if (env.ADMIN_TOTP_SECRET?.trim()) {
    const problem = adminTotpSecretProblem(env.ADMIN_TOTP_SECRET);
    if (problem) problems.push({ name: "ADMIN_TOTP_SECRET", reason: problem });
  }

  return problems;
}

export function assertServerSecretConfiguration(env: SecretEnvironment = process.env): void {
  const problems = collectServerSecretProblems(env);
  if (problems.length) throw new SecretConfigurationError(problems);
}
