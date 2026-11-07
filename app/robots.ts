import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account",
          // The whole admin surface, including the setup, MFA and preview
          // routes. These were previously crawlable: they are not linked from
          // any public page and are not in the sitemap, but a crawler that
          // discovers the URL from a referrer or a pasted link would index a
          // login screen and the synthetic preview dashboard.
          "/admin",
          "/admin/",
          "/admin-preview",
          "/api/",
          "/dashboard",
          "/forgot-password",
          "/reset-password",
          "/verify-account-email",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
