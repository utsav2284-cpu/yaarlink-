import type { Lang } from "./config";
import type { LocaleData } from "./types";

/**
 * Locale bundles are deliberately behind dynamic imports. The server renders
 * with the one bundle selected for the request, and the browser downloads
 * another language only when the user actually switches to it.
 */
const LOCALE_LOADERS: Record<Lang, () => Promise<LocaleData>> = {
  en: async () => (await import("./locales/en")).enLocale,
  hi: async () => (await import("./locales/hi")).hiLocale,
  pa: async () => (await import("./locales/pa")).paLocale,
};

export function loadLocale(lang: Lang): Promise<LocaleData> {
  return LOCALE_LOADERS[lang]();
}
