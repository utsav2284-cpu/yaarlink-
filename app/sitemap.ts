import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "",
    "/brands",
    "/creators",
    "/campaigns",
    "/how-it-works",
    "/about",
    "/contact",
    "/signup",
    "/login",
    "/privacy",
    "/terms",
    "/refund-policy",
    "/data-rights",
    "/account-deletion",
  ];
  return pages.map((p) => ({
    url: `${SITE.url}${p}`,
    changeFrequency: p === "/campaigns" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
