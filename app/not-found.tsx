import type { Metadata } from "next";
import { SITE } from "@/config/site";
import NotFoundClient from "@/frontend/components/NotFoundClient";
import { OPEN_GRAPH_LOCALES } from "@/frontend/i18n/config";
import { getRequestLanguage, translateForRequest } from "@/frontend/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [lang, notFoundTitle, description] = await Promise.all([
    getRequestLanguage(),
    translateForRequest("nf.title"),
    translateForRequest("nf.body"),
  ]);
  const title = `${notFoundTitle} · YaarLink`;

  return {
    title: { absolute: title },
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
    openGraph: {
      title,
      description,
      siteName: SITE.name,
      locale: OPEN_GRAPH_LOCALES[lang],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function NotFound() {
  return <NotFoundClient />;
}
