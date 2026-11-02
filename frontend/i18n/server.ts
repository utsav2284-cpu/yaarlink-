import { cookies, headers } from "next/headers";
import { cache } from "react";
import {
  LANGUAGE_COOKIE,
  LOCALES,
  languageFromAcceptLanguage,
  normalizeLanguageTag,
  type Lang,
} from "./config";
import { loadLocale } from "./load-locale";
import { translateMessage, type TranslationValues } from "./translate";
import type { LocaleData, TranslationKey } from "./types";

/**
 * Resolve the request language before any HTML is rendered. A saved language
 * cookie wins; otherwise the browser/search crawler's Accept-Language header
 * is used. This is what removes the English-first flash and English-only SSR.
 */
export const getRequestLanguage = cache(async (): Promise<Lang> => {
  const cookieStore = await cookies();
  const saved = normalizeLanguageTag(cookieStore.get(LANGUAGE_COOKIE)?.value);
  if (saved) return saved;

  const requestHeaders = await headers();
  return languageFromAcceptLanguage(requestHeaders.get("accept-language"));
});

export const getRequestLocaleData = cache(async (): Promise<LocaleData> => {
  return loadLocale(await getRequestLanguage());
});

export async function translateForRequest(
  key: TranslationKey,
  values: TranslationValues = {},
): Promise<string> {
  const [lang, localeData] = await Promise.all([
    getRequestLanguage(),
    getRequestLocaleData(),
  ]);
  return translateMessage(localeData.messages, LOCALES[lang], key, values);
}
