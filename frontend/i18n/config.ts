export const SUPPORTED_LANGS = ["en", "hi", "pa"] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = "en";

/** The cookie contains only the selected language code (for example, `hi`). */
export const LANGUAGE_COOKIE = "yaarlink-lang";
export const LANGUAGE_STORAGE_KEY = "yaarlink-lang";
export const LANGUAGE_COOKIE_SYNC_KEY = "yaarlink-lang-cookie-sync";
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const LANGS: readonly { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिन्दी", short: "हिं" },
  { code: "pa", label: "ਪੰਜਾਬੀ", short: "ਪੰ" },
];

export const LOCALES: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  pa: "pa-IN",
};

export const OPEN_GRAPH_LOCALES: Record<Lang, string> = {
  en: "en_IN",
  hi: "hi_IN",
  pa: "pa_IN",
};

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "hi" || value === "pa";
}

/** Convert a BCP 47 language tag such as `pa-Guru-IN` to a supported UI language. */
export function normalizeLanguageTag(value: unknown): Lang | null {
  if (typeof value !== "string") return null;
  const primary = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return isLang(primary) ? primary : null;
}

/**
 * Choose the best supported language from an Accept-Language header.
 * Quality values are honoured; header order breaks ties.
 */
export function languageFromAcceptLanguage(header: string | null | undefined): Lang {
  if (!header) return DEFAULT_LANG;

  const candidates = header
    .split(",")
    .map((part, index) => {
      const [tagPart, ...parameters] = part.split(";");
      const tag = tagPart?.trim();
      if (!tag || tag === "*") return null;

      let quality = 1;
      for (const parameter of parameters) {
        const [name, rawValue] = parameter.split("=", 2).map((item) => item.trim());
        if (name?.toLowerCase() !== "q") continue;
        const parsed = Number(rawValue);
        quality = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
      }

      const lang = normalizeLanguageTag(tag);
      return lang && quality > 0 ? { lang, quality, index } : null;
    })
    .filter((candidate): candidate is { lang: Lang; quality: number; index: number } => candidate !== null)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  return candidates[0]?.lang ?? DEFAULT_LANG;
}
