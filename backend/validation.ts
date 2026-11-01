import { CAMPAIGN_BUDGET_MAX, CAMPAIGN_BUDGET_MIN } from "@/shared/constants";

export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export type ValidationFailure = {
  ok: false;
  error: string;
  code: string;
  field?: string;
};

export type ValidationResult<T> = { ok: true; value: T } | ValidationFailure;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasField(body: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function failure(error: string, code: string, field?: string): ValidationFailure {
  return field ? { ok: false, error, code, field } : { ok: false, error, code };
}

export function invalidRequestResponse(
  message = "Please send a valid JSON object.",
  headers: HeadersInit = NO_STORE_HEADERS,
): Response {
  return Response.json({ error: message, code: "invalid_request" }, { status: 400, headers });
}

export type JsonObjectResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

/**
 * Read a request body under one API contract: the body must be valid JSON and
 * its top-level value must be an object. Arrays, `null`, numbers, strings and
 * malformed JSON are client errors (400), never unhandled 500s.
 */
export async function readJsonObject(
  req: Request,
  options: { allowEmpty?: boolean; headers?: HeadersInit } = {},
): Promise<JsonObjectResult> {
  const headers = options.headers ?? NO_STORE_HEADERS;
  let parsed: unknown;

  try {
    if (options.allowEmpty) {
      const text = await req.text();
      if (!text.trim()) return { ok: true, body: {} };
      parsed = JSON.parse(text) as unknown;
    } else {
      parsed = (await req.json()) as unknown;
    }
  } catch {
    return { ok: false, response: invalidRequestResponse("Please send a valid JSON object.", headers) };
  }

  if (!isRecord(parsed)) {
    return { ok: false, response: invalidRequestResponse("Please send a valid JSON object.", headers) };
  }
  return { ok: true, body: parsed };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse an RFC UUID (versions 1–5, RFC variant) and return its canonical form. */
export function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

export function isUuid(value: unknown): value is string {
  return parseUuid(value) !== null;
}

function normalizeWhitespace(value: string, multiline: boolean): string {
  const trimmed = value.trim();
  return multiline ? trimmed.replace(/\r\n?/g, "\n") : trimmed.replace(/\s+/g, " ");
}

type TextOptions = {
  field: string;
  maxLength: number;
  multiline?: boolean;
  invalidCode?: string;
  invalidMessage?: string;
};

function validateNormalizedText(value: string, options: TextOptions): ValidationResult<string> {
  if (value.length > options.maxLength) {
    return failure("Please shorten the details and try again.", "field_too_long", options.field);
  }
  return { ok: true, value };
}

/** Normalize first, then validate and return the exact value to store. */
export function parseRequiredText(
  value: unknown,
  options: TextOptions & { requiredCode: string; requiredMessage: string },
): ValidationResult<string> {
  if (value == null) return failure(options.requiredMessage, options.requiredCode, options.field);
  if (typeof value !== "string") {
    return failure(
      options.invalidMessage ?? "Please check the details and try again.",
      options.invalidCode ?? "invalid_request",
      options.field,
    );
  }
  const normalized = normalizeWhitespace(value, Boolean(options.multiline));
  if (!normalized) return failure(options.requiredMessage, options.requiredCode, options.field);
  return validateNormalizedText(normalized, options);
}

/** Optional text: missing/null/whitespace clears to null; overlong text is rejected, never sliced. */
export function parseOptionalText(value: unknown, options: TextOptions): ValidationResult<string | null> {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return failure(
      options.invalidMessage ?? "Please check the details and try again.",
      options.invalidCode ?? "invalid_request",
      options.field,
    );
  }
  const normalized = normalizeWhitespace(value, Boolean(options.multiline));
  if (!normalized) return { ok: true, value: null };
  const checked = validateNormalizedText(normalized, options);
  return checked.ok ? { ok: true, value: checked.value } : checked;
}

export const EMAIL_MAX_LENGTH = 254;
const EMAIL_LOCAL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * Practical, strict email normalization. In particular this rejects empty
 * domain labels (`a@b..c`), leading/trailing dots and hyphens, a missing TLD,
 * and addresses longer than the SMTP path limit.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX_LENGTH || /[\s\u0000-\u001f\u007f]/.test(email)) return null;

  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (
    !local ||
    local.length > 64 ||
    !EMAIL_LOCAL_PATTERN.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return null;
  }

  const labels = domain.split(".");
  if (labels.length < 2 || domain.length > 253 || labels.some((label) => !EMAIL_LABEL_PATTERN.test(label))) {
    return null;
  }
  const topLevelDomain = labels[labels.length - 1];
  if (!/^[A-Za-z]{2,63}$/.test(topLevelDomain)) return null;
  return email;
}

export function isValidEmail(value: unknown): boolean {
  return normalizeEmail(value) !== null;
}

export function parseEmailField(
  value: unknown,
  options: { field?: string; required?: boolean } = {},
): ValidationResult<string | null> {
  const field = options.field ?? "email";
  if (value == null || (typeof value === "string" && !value.trim())) {
    return options.required
      ? failure("Please enter a valid email.", "invalid_email", field)
      : { ok: true, value: null };
  }
  const email = normalizeEmail(value);
  return email ? { ok: true, value: email } : failure("Please enter a valid email.", "invalid_email", field);
}

/**
 * Normalize a phone number to E.164 (`+` followed by digits).
 *
 * A bare 10-digit number, or an 11-digit number starting with the Indian
 * trunk `0`, is treated as Indian (this product's locale and the form
 * placeholders). Every other number must carry an explicit `+`/`00` country
 * code. India (+91), NANP (+1) and the UK (+44) get exact national-length
 * checks; other country codes must still satisfy E.164's 8–15 digit shape.
 */
export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim().replace(/\s+/g, " ");
  if (!input || !/^\+?[0-9().\-\s]+$/.test(input)) return null;
  if ((input.match(/\+/g) ?? []).length > 1) return null;

  const openingParens = (input.match(/\(/g) ?? []).length;
  const closingParens = (input.match(/\)/g) ?? []).length;
  if (openingParens !== closingParens || openingParens > 1) return null;

  const hasPlus = input.startsWith("+");
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;

  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
    if (!digits || digits.startsWith("0")) return null;
    return normalizeInternationalDigits(digits);
  }

  if (hasPlus) {
    if (digits.startsWith("0")) return null;
    return normalizeInternationalDigits(digits);
  }

  // Bare numbers are interpreted only in the unambiguous Indian forms.
  if (digits.length === 10 && /^[1-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && /^[1-9]/.test(digits.slice(1))) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && /^[1-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return null;
}

function normalizeInternationalDigits(digits: string): string | null {
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  if (digits.startsWith("91")) {
    return digits.length === 12 && /^[1-9]/.test(digits.slice(2)) ? `+${digits}` : null;
  }
  if (digits.startsWith("1")) {
    // NANP: country code 1 + area code/exchange, both starting 2–9.
    return digits.length === 11 && /[2-9]/.test(digits[1]) && /[2-9]/.test(digits[4]) ? `+${digits}` : null;
  }
  if (digits.startsWith("44")) {
    return digits.length === 12 && /^[1-9]/.test(digits.slice(2)) ? `+${digits}` : null;
  }
  return `+${digits}`;
}

export function parsePhoneField(
  value: unknown,
  options: { field?: string; required?: boolean } = {},
): ValidationResult<string | null> {
  const field = options.field ?? "phone";
  if (value == null || (typeof value === "string" && !value.trim())) {
    return options.required
      ? failure("Please enter a valid phone number.", "invalid_phone", field)
      : { ok: true, value: null };
  }
  const phone = normalizePhoneNumber(value);
  return phone
    ? { ok: true, value: phone }
    : failure("Please enter a valid phone number with a country code, or a 10-digit Indian number.", "invalid_phone", field);
}

function parseIntegerString(value: string): bigint | null {
  const trimmed = value.trim();
  const isPlain = /^[0-9]+$/.test(trimmed);
  const isWesternGrouped = /^[0-9]{1,3}(,[0-9]{3})+$/.test(trimmed);
  const isIndianGrouped = /^[0-9]{1,2}(,[0-9]{2})*,[0-9]{3}$/.test(trimmed);
  if (!isPlain && !isWesternGrouped && !isIndianGrouped) return null;
  try {
    return BigInt(trimmed.replace(/,/g, ""));
  } catch {
    return null;
  }
}

/** Strict integer field: decimals are rejected rather than rounded. */
export function parseIntegerField(
  value: unknown,
  options: { field: string; min: number; max: number; code: string; error: string },
): ValidationResult<number> {
  let parsed: bigint | null = null;
  if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === "string") parsed = parseIntegerString(value);

  if (parsed === null || parsed < BigInt(options.min) || parsed > BigInt(options.max)) {
    return failure(options.error, options.code, options.field);
  }
  return { ok: true, value: Number(parsed) };
}

export function parseBudgetField(value: unknown): ValidationResult<number> {
  return parseIntegerField(value, {
    field: "budget",
    min: CAMPAIGN_BUDGET_MIN,
    max: CAMPAIGN_BUDGET_MAX,
    code: "invalid_budget",
    error: "Please enter a budget between ₹500 and ₹1,00,00,000.",
  });
}

const FOLLOWER_MULTIPLIERS: Record<string, bigint> = {
  k: BigInt(1_000),
  thousand: BigInt(1_000),
  m: BigInt(1_000_000),
  million: BigInt(1_000_000),
  b: BigInt(1_000_000_000),
  billion: BigInt(1_000_000_000),
  l: BigInt(100_000),
  lakh: BigInt(100_000),
  lakhs: BigInt(100_000),
  lac: BigInt(100_000),
  lacs: BigInt(100_000),
  cr: BigInt(10_000_000),
  crore: BigInt(10_000_000),
  crores: BigInt(10_000_000),
};

export const MAX_FOLLOWERS = 100_000_000;

/**
 * Parse a follower count without silently stripping characters.
 * `5K` → 5000, `1.5K` → 1500 and `1 lakh` → 100000. Bare decimals such as
 * `5.5`, negatives and free-form text are rejected instead of being mangled
 * into a different number.
 */
export function parseFollowerCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_FOLLOWERS ? value : null;
  }
  if (typeof value !== "string") return null;

  const input = value.trim().toLowerCase();
  if (!input) return null;
  const match = /^([0-9][0-9,]*(?:\.[0-9]+)?)\s*([a-z]+)?$/.exec(input);
  if (!match) return null;

  const numeric = match[1].replace(/,/g, "");
  const suffix = match[2] ?? "";
  if (!suffix && numeric.includes(".")) return null;
  const multiplier = suffix ? FOLLOWER_MULTIPLIERS[suffix] : BigInt(1);
  if (multiplier === undefined) return null;

  const [whole, fraction = ""] = numeric.split(".");
  let numerator: bigint;
  try {
    numerator = BigInt(whole + fraction);
  } catch {
    return null;
  }
  const denominator = BigInt(10) ** BigInt(fraction.length);
  const product = numerator * multiplier;
  if (product % denominator !== BigInt(0)) return null;
  const result = product / denominator;
  return result >= BigInt(0) && result <= BigInt(MAX_FOLLOWERS) ? Number(result) : null;
}

export function parseFollowersField(value: unknown, field = "followers"): ValidationResult<number> {
  const followers = parseFollowerCount(value);
  return followers === null
    ? failure("Please enter a valid follower count, such as 25000, 25K, or 1.5 lakh.", "invalid_followers", field)
    : { ok: true, value: followers };
}

/**
 * Canonically parse an allowlisted list. The submitted item count, the
 * de-duplicated count and the final joined length are all bounded before the
 * value is stored in a comma-separated text column.
 */
export function parseCanonicalList<T extends string>(
  value: unknown,
  normalize: (item: unknown) => T | null,
  options: {
    field: string;
    code: string;
    error: string;
    maxItems: number;
    maxJoinedLength: number;
    minItems?: number;
  },
): ValidationResult<T[]> {
  let entries: unknown[];
  if (Array.isArray(value)) entries = value;
  else if (typeof value === "string") entries = value.split(",");
  else return failure(options.error, options.code, options.field);

  const minItems = options.minItems ?? 1;
  if (entries.length > options.maxItems) return failure(options.error, options.code, options.field);

  const canonical: T[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.trim()) return failure(options.error, options.code, options.field);
    const normalized = normalize(entry.trim().replace(/\s+/g, " "));
    if (!normalized) return failure(options.error, options.code, options.field);
    if (!canonical.includes(normalized)) canonical.push(normalized);
  }

  if (canonical.length < minItems || canonical.length > options.maxItems) {
    return failure(options.error, options.code, options.field);
  }
  if (canonical.join(", ").length > options.maxJoinedLength) {
    return failure(options.error, options.code, options.field);
  }
  return { ok: true, value: canonical };
}

/** Parse an optimistic-lock timestamp supplied by an edit form. */
export function parseExpectedUpdatedAt(body: Record<string, unknown>): ValidationResult<Date | null> {
  if (!hasField(body, "expectedUpdatedAt") || body.expectedUpdatedAt == null) return { ok: true, value: null };
  if (typeof body.expectedUpdatedAt !== "string") {
    return failure("Please refresh and try again.", "invalid_request", "expectedUpdatedAt");
  }
  const date = new Date(body.expectedUpdatedAt);
  return Number.isNaN(date.getTime())
    ? failure("Please refresh and try again.", "invalid_request", "expectedUpdatedAt")
    : { ok: true, value: date };
}
