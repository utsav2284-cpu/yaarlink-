import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { translateForRequest } from "@/frontend/i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return {
    name: `${SITE.name} — ${SITE.domain}`,
    short_name: SITE.name,
    description: await translateForRequest("meta.siteDescription"),
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffbf1",
    theme_color: "#1c1917",
    categories: ["business", "social"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
