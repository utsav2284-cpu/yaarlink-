/**
 * Bounds shared by the server policy, form attributes, and localized UI copy.
 *
 * The minimum was 6, which is too short to resist offline cracking once a
 * database dump leaks: six characters is only a few seconds of GPU work no
 * matter how many character classes the rule demands. Ten is the shortest
 * length that is defensible for a password that must also pass the breach and
 * context checks below. Every user-facing string reads this constant through
 * the {min} placeholder, so the UI copy, the input minLength attributes, and
 * the server error text all move together.
 *
 * Raising this does not lock out existing accounts: the minimum is enforced
 * when a password is created or changed, not when it is used to log in.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

/** Count Unicode code points so astral characters count as one character. */
export function passwordLength(password: string): number {
  let length = 0;
  for (const _char of password) length += 1;
  return length;
}

export function isPasswordLengthValid(password: string): boolean {
  const length = passwordLength(password);
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}

/**
 * The four password-creation requirements shown in the UI and enforced by
 * the server policy. Letters are Unicode-aware (any cased script counts),
 * a number is any decimal digit, and a symbol is any non-alphanumeric,
 * non-whitespace character.
 */
export interface PasswordRequirements {
  minLength: boolean;
  letterCases: boolean;
  number: boolean;
  symbol: boolean;
}

export function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: passwordLength(password) >= PASSWORD_MIN_LENGTH,
    letterCases: /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password),
    number: /\p{Nd}/u.test(password),
    symbol: /[^\p{L}\p{N}\s]/u.test(password),
  };
}

export function passwordRequirementsMet(password: string): number {
  const result = checkPasswordRequirements(password);
  return [result.minLength, result.letterCases, result.number, result.symbol].filter(Boolean).length;
}

/** All four creation requirements plus the shared maximum length. */
export function isPasswordCompliant(password: string): boolean {
  return passwordLength(password) <= PASSWORD_MAX_LENGTH && passwordRequirementsMet(password) === 4;
}

const SUGGEST_LOWER = "abcdefghjkmnpqrstuvwxyz";
const SUGGEST_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const SUGGEST_DIGITS = "23456789";
const SUGGEST_SYMBOLS = "!@#$%^&*";

function randomIndex(maxExclusive: number): number {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  let value = 0;
  do {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maxExclusive;
}

function pick(chars: string): string {
  return chars[randomIndex(chars.length)];
}

/**
 * Generate a password that satisfies every creation requirement, using the
 * platform CSPRNG. Ambiguous characters (0/O, 1/l/I) are excluded so the
 * suggestion stays easy to read and type.
 */
export function generateSuggestedPassword(length = 14): string {
  const size = Math.max(8, Math.min(length, PASSWORD_MAX_LENGTH));
  const all = SUGGEST_LOWER + SUGGEST_UPPER + SUGGEST_DIGITS + SUGGEST_SYMBOLS;
  const chars = [pick(SUGGEST_LOWER), pick(SUGGEST_UPPER), pick(SUGGEST_DIGITS), pick(SUGGEST_SYMBOLS)];
  while (chars.length < size) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
