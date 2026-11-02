/*
 * One server-side policy for every place a user chooses a new password:
 * signup, signup completion, password reset, and authenticated password
 * change. Length is counted in Unicode code points rather than UTF-16 code
 * units so an emoji or other astral character counts as one character.
 */

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLength } from "@/shared/password-policy";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLength };

const DEFAULT_PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const PWNED_PASSWORDS_TIMEOUT_MS = 2_500;
const PWNED_PASSWORDS_MAX_RESPONSE_CHARS = 262_144;
const enc = new TextEncoder();

export class PasswordBreachCheckUnavailableError extends Error {
  constructor() {
    super("Password breach check is unavailable");
    this.name = "PasswordBreachCheckUnavailableError";
  }
}

export type PasswordPolicyContext = {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
};

export type PasswordPolicyProblem = "length" | "breached";
export type PasswordValidationResult = { ok: true } | { ok: false; problem: PasswordPolicyProblem };

function compact(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function deLeet(value: string): string {
  return value
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b");
}

/*
 * A deliberately small local denylist for the most predictable choices. It is
 * not a substitute for the breach corpus below; it ensures obvious passwords
 * are rejected without a network call and gives the external check a sane
 * first line of defence.
 */
const COMMON_PASSWORDS = new Set(
  [
    "1234567890",
    "1234567891",
    "123456789a",
    "0123456789",
    "9876543210",
    "1111111111",
    "qwerty1234",
    "qwertyuiop",
    "1q2w3e4r5t",
    "q1w2e3r4t5",
    "password123",
    "password1234",
    "passw0rd123",
    "p@ssw0rd123",
    "abc1234567",
    "iloveyou123",
    "welcome123",
    "admin12345",
    "administrator",
    "letmein123",
    "football123",
    "baseball123",
    "sunshine123",
    "princess123",
    "superman123",
    "batman1234",
    "dragon1234",
    "master1234",
    "monkey1234",
    "shadow1234",
    "ashley1234",
    "michael123",
    "computer123",
    "internet123",
    "charlie123",
    "jordan1234",
    "tiger12345",
    "purple1234",
    "killer1234",
    "hockey1234",
    "samsung123",
    "india12345",
    "yaarlink123",
  ].map((password) => compact(password)),
);

const OBVIOUS_SEQUENCES = [
  "0123456789",
  "1234567890",
  "9876543210",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjklz",
  "zxcvbnm123",
];

function addContextValue(terms: Set<string>, value: string | null | undefined) {
  if (!value) return;
  const normalized = value.normalize("NFKC").toLowerCase();
  for (const part of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (Array.from(part).length >= 4) terms.add(part);
  }
  const whole = compact(value);
  if (Array.from(whole).length >= 4) terms.add(whole);
}

function contextTerms(context: PasswordPolicyContext): Set<string> {
  const terms = new Set<string>(["yaarlink", "theyaar"]);

  // Use the email local-part, not generic domain labels such as "gmail" or
  // "com", so ordinary words in an otherwise unrelated password are not
  // rejected merely because of the user's mail provider.
  addContextValue(terms, context.email?.split("@")[0]);
  addContextValue(terms, context.name);

  const phoneDigits = context.phone?.replace(/\D/g, "") ?? "";
  if (phoneDigits.length >= 6) terms.add(phoneDigits);
  if (phoneDigits.length > 10) terms.add(phoneDigits.slice(-10));

  return terms;
}

/** Local, synchronous policy. Call `validateNewPassword` for the breach corpus too. */
export function localPasswordPolicyProblem(
  password: string,
  context: PasswordPolicyContext = {},
): PasswordPolicyProblem | null {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) return "length";

  const chars = Array.from(password);
  if (chars.every((char) => char === chars[0])) return "breached";

  const compactPassword = compact(password);
  if (COMMON_PASSWORDS.has(compactPassword) || COMMON_PASSWORDS.has(deLeet(compactPassword))) return "breached";
  if (OBVIOUS_SEQUENCES.some((sequence) => compactPassword.startsWith(sequence))) return "breached";

  for (const term of contextTerms(context)) {
    if (term && compactPassword.includes(term)) return "breached";
  }
  return null;
}

export type PasswordBreachCheckOptions = {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
  timeoutMs?: number;
};

function breachRangeEndpoint(prefix: string, configuredUrl?: string): string {
  const configured = (configuredUrl ?? process.env.PWNED_PASSWORDS_RANGE_URL)?.trim();
  const raw = configured || DEFAULT_PWNED_PASSWORDS_RANGE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PasswordBreachCheckUnavailableError();
  }

  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(localHost && url.protocol === "http:")) {
    throw new PasswordBreachCheckUnavailableError();
  }
  if (url.username || url.password || url.search || url.hash) throw new PasswordBreachCheckUnavailableError();

  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath || ""}/${prefix}`;
  return url.toString();
}

function parseBreachRange(text: string, suffix: string): boolean {
  let sawValidEntry = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const match = /^([0-9A-F]{35}):(\d{1,15})$/i.exec(rawLine.trim());
    if (!match) continue;
    sawValidEntry = true;
    // Padded responses include count 0 entries solely to make response sizes
    // uniform. They are not evidence that a password was breached.
    if (match[1].toUpperCase() === suffix && Number(match[2]) > 0) return true;
  }
  if (!sawValidEntry) throw new PasswordBreachCheckUnavailableError();
  return false;
}

/**
 * Have I Been Pwned k-anonymity range lookup. Only the first five characters
 * of the password's SHA-1 hash leave this server; neither the password nor
 * its full hash is sent. Any network/protocol/configuration failure throws so
 * password-setting routes can fail closed with 503 rather than silently
 * accepting a password that was never checked.
 */
export async function isPasswordBreached(
  password: string,
  options: PasswordBreachCheckOptions = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PWNED_PASSWORDS_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", enc.encode(password)));
    const sha1 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const endpoint = breachRangeEndpoint(prefix, options.apiBaseUrl);
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        "Add-Padding": "true",
        "User-Agent": "YaarLink password breach check",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new PasswordBreachCheckUnavailableError();

    const text = await response.text();
    if (!text || text.length > PWNED_PASSWORDS_MAX_RESPONSE_CHARS) {
      throw new PasswordBreachCheckUnavailableError();
    }
    return parseBreachRange(text, suffix);
  } catch (error) {
    if (error instanceof PasswordBreachCheckUnavailableError) throw error;
    throw new PasswordBreachCheckUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

/** Full new-password validation: local policy first, then the breach corpus. */
export async function validateNewPassword(
  password: string,
  context: PasswordPolicyContext = {},
  breachOptions: PasswordBreachCheckOptions = {},
): Promise<PasswordValidationResult> {
  const localProblem = localPasswordPolicyProblem(password, context);
  if (localProblem) return { ok: false, problem: localProblem };
  if (await isPasswordBreached(password, breachOptions)) return { ok: false, problem: "breached" };
  return { ok: true };
}
