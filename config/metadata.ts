import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { LOCALES, OPEN_GRAPH_LOCALES } from "@/frontend/i18n/config";
import { ROUTE_TITLE_KEYS } from "@/frontend/i18n/routes";
import { getRequestLanguage, getRequestLocaleData } from "@/frontend/i18n/server";
import { translateMessage } from "@/frontend/i18n/translate";

/**
 * Self-canonical and social-sharing metadata for one route.
 *
 * The path is intentionally relative: the root layout sets `metadataBase`
 * from `SITE.url`, so Next resolves it against the canonical
 * `https://www.theyaar.com` origin instead of the redirecting apex.
 * The Open Graph fields are repeated because a child `openGraph` object
 * replaces the parent object during metadata merging. They are translated
 * with the same request language as the rendered HTML.
 */
export async function canonicalMetadata(path: string): Promise<Metadata> {
  const [lang, localeData] = await Promise.all([
    getRequestLanguage(),
    getRequestLocaleData(),
  ]);
  const locale = LOCALES[lang];
  const routeTitleKey = ROUTE_TITLE_KEYS[path];
  const title = routeTitleKey
    ? `${translateMessage(localeData.messages, locale, routeTitleKey)} · YaarLink`
    : `YaarLink · ${SITE.domain}`;
  const description = translateMessage(
    localeData.messages,
    locale,
    "meta.siteDescription",
  );

  return {
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE.domain,
      locale: OPEN_GRAPH_LOCALES[lang],
      type: "website",
    },
  };
}
