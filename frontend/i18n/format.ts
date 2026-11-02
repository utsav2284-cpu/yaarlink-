const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const listFormatters = new Map<string, Intl.ListFormat>();
const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function formatterKey(locale: string, options: unknown) {
  return `${locale}:${JSON.stringify(options ?? {})}`;
}

export function formatNumberForLocale(
  locale: string,
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  const key = formatterKey(locale, options);
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatters.set(key, formatter);
  }
  const numericValue = Number(value);
  return formatter.format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatCompactNumberForLocale(locale: string, value: number): string {
  return formatNumberForLocale(locale, value, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatCurrencyForLocale(locale: string, value: number): string {
  return formatNumberForLocale(locale, value, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function formatListForLocale(
  locale: string,
  values: readonly string[],
  options: Intl.ListFormatOptions = { style: "long", type: "conjunction" },
): string {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean);
  if (cleanValues.length < 2) return cleanValues[0] ?? "";

  const key = formatterKey(locale, options);
  let formatter = listFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.ListFormat(locale, options);
    listFormatters.set(key, formatter);
  }
  return formatter.format(cleanValues);
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateForLocale(
  locale: string,
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  if (value === null || value === undefined || value === "") return "";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";

  const key = formatterKey(locale, options);
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

export function formatDateTimeForLocale(
  locale: string,
  value: string | number | Date | null | undefined,
): string {
  return formatDateForLocale(locale, value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Format a public listing's age in the selected locale, e.g. “3 days ago”. */
export function formatRelativeTimeForLocale(
  locale: string,
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";

  let formatter = relativeTimeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "long" });
    relativeTimeFormatters.set(locale, formatter);
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["second", 1],
    ["minute", 60],
    ["hour", 60 * 60],
    ["day", 60 * 60 * 24],
    ["week", 60 * 60 * 24 * 7],
    ["month", 60 * 60 * 24 * 30.44],
    ["year", 60 * 60 * 24 * 365.25],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let unitSeconds = 1;
  for (const [candidate, seconds] of units) {
    if (absSeconds >= seconds) {
      unit = candidate;
      unitSeconds = seconds;
    }
  }
  return formatter.format(Math.trunc(diffSeconds / unitSeconds), unit);
}
