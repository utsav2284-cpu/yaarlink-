import type { Metadata } from "next";
import { SITE } from "@/config/site";

/**
 * Self-canonical and social-sharing URL for one route.
 *
 * The path is intentionally relative: the root layout sets `metadataBase`
 * from `SITE.url`, so Next resolves it against the canonical
 * `https://www.theyaar.com` origin instead of the redirecting apex.
 * The Open Graph site fields are repeated because a child `openGraph`
 * object replaces the parent object during metadata merging.
 */
export function canonicalMetadata(path: string): Metadata {
  return {
    alternates: { canonical: path },
    openGraph: {
      url: path,
      siteName: SITE.domain,
      locale: "en_IN",
      type: "website",
    },
  };
}
