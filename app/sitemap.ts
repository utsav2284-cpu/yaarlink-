import type { MetadataRoute } from "next";
import { listPublicSitemapEntries } from "@/backend/public-listings";
import { SITE } from "@/config/site";

export const dynamic = "force-dynamic";

// Evaluated when a deployment's server process starts. Public listing/detail
// entries below use their real database update times instead.
const STATIC_LAST_MODIFIED = new Date();

function latestDate(dates: Array<Date | undefined>, fallback: Date): Date {
  let latest = fallback;
  for (const date of dates) {
    if (date && date.getTime() > latest.getTime()) latest = date;
  }
  return latest;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let campaignEntries: Array<{ id: string; lastModified: Date }> = [];
  let creatorEntries: Array<{ id: string; lastModified: Date }> = [];

  try {
    const publicEntries = await listPublicSitemapEntries();
    campaignEntries = publicEntries.campaigns;
    creatorEntries = publicEntries.creators;
  } catch (error) {
    // A database outage should not make the entire sitemap disappear. The
    // static public routes remain discoverable, while no unverified detail
    // URLs are guessed or advertised.
    console.error(error);
  }

  const latestCampaign = latestDate(
    campaignEntries.map((entry) => entry.lastModified),
    STATIC_LAST_MODIFIED,
  );
  const latestCreator = latestDate(
    creatorEntries.map((entry) => entry.lastModified),
    STATIC_LAST_MODIFIED,
  );
  const latestMarketplace = latestDate(
    [latestCampaign, latestCreator],
    STATIC_LAST_MODIFIED,
  );

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, lastModified: latestMarketplace, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/campaigns`, lastModified: latestCampaign, changeFrequency: "daily", priority: 0.95 },
    { url: `${SITE.url}/brands`, lastModified: latestCreator, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE.url}/creators`, lastModified: latestCampaign, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE.url}/how-it-works`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE.url}/about`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/contact`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/privacy`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE.url}/terms`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE.url}/refund-policy`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE.url}/data-rights`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE.url}/account-deletion`, lastModified: STATIC_LAST_MODIFIED, changeFrequency: "yearly", priority: 0.4 },
  ];

  return [
    ...staticRoutes,
    ...campaignEntries.map((campaign) => ({
      url: `${SITE.url}/campaigns/${campaign.id}`,
      lastModified: campaign.lastModified,
      changeFrequency: "daily" as const,
      priority: 0.85,
    })),
    ...creatorEntries.map((creator) => ({
      url: `${SITE.url}/creators/${creator.id}`,
      lastModified: creator.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
