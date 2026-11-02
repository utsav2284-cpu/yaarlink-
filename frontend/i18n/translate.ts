import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/shared/password-policy";
import { formatNumberForLocale } from "./format";
import type { Dictionary, TranslationKey } from "./types";

export type TranslationValues = Readonly<Record<string, string | number>>;

/**
 * Translate one key from an already-loaded locale.
 *
 * Missing keys are programming errors. They throw during development instead
 * of silently rendering a dotted key; production keeps the page alive and
 * falls back to the key itself.
 */
export function translateMessage(
  messages: Dictionary,
  locale: string,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  const template = (messages as Partial<Record<string, string>>)[key];
  if (typeof template !== "string") {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`Missing translation for key "${String(key)}"`);
    }
    return String(key);
  }

  // Password copy must never drift from the policy enforced by the server,
  // so its bounds come from the same shared constants everywhere `t` is used.
  const resolvedValues: TranslationValues =
    key === "auth.pwHint" || key === "auth.passwordPolicy"
      ? { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, ...values }
      : values;

  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(resolvedValues, name)) return placeholder;
    const value = resolvedValues[name];
    return typeof value === "number" ? formatNumberForLocale(locale, value) : value;
  });
}
