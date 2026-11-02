import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { LOCALES, OPEN_GRAPH_LOCALES } from "@/frontend/i18n/config";
import {
  NO_INDEX_ROUTES,
  ROUTE_DESCRIPTION_KEYS,
  ROUTE_TITLE_KEYS,
} from "@/frontend/i18n/routes";
import { getRequestLanguage, getRequestLocaleData } from "@/frontend/i18n/server";
import { translateMessage } from "@/frontend/i18n/translate";

function truncateDescription(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const characters = Array.from(normalized);
  if (characters.length <= maxLength) return normalized;
  return `${characters.slice(0, maxLength - 1).join("").trimEnd()}…`;
}

/**
 * Complete, self-canonical metadata for one route.
 *
 * The path is intentionally relative: the root layout sets `metadataBase`
 * from `SITE.url`, so Next resolves it against the canonical configured
 * origin instead of the redirecting apex.
 * Title, description, Open Graph, and Twitter fields are all generated from
 * the route's own localized copy. Child metadata replaces parent social
 * objects during merging, so returning the full set here prevents a route
 * from falling back to the home page's identity.
 */
export async function canonicalMetadata(path: string): Promise<Metadata> {
  const [lang, localeData] = await Promise.all([
    getRequestLanguage(),
    getRequestLocaleData(),
  ]);
  const locale = LOCALES[lang];
  const translate = (key: Parameters<typeof translateMessage>[2]) =>
    translateMessage(localeData.messages, locale, key);

  const routeTitleKey = ROUTE_TITLE_KEYS[path];
  const title = routeTitleKey
    ? `${translate(routeTitleKey)} · YaarLink`
    : path === "/"
      ? `YaarLink · ${SITE.domain} — ${translate("foot.tagline")}`
      : `YaarLink · ${SITE.domain}`;
  const description = truncateDescription(
    translate(ROUTE_DESCRIPTION_KEYS[path] ?? "meta.siteDescription").replaceAll("{domain}", SITE.domain),
  );
  const indexable = !NO_INDEX_ROUTES.has(path);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false, googleBot: { index: false, follow: false } },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE.name,
      locale: OPEN_GRAPH_LOCALES[lang],
      type: "website",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "YaarLink — simple marketing for brands, creators, and local pages",
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: "/twitter-image",
          width: 1200,
          height: 630,
          alt: "YaarLink — simple marketing for brands, creators, and local pages",
          type: "image/png",
        },
      ],
    },
  };
}
