import type { Metadata } from "next";
import { listPublicCampaigns, listPublicCreators } from "@/backend/public-listings";
import { canonicalMetadata } from "@/config/metadata";
import HomePageClient, { type HomeInitialListings } from "@/frontend/components/HomePageClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return canonicalMetadata("/");
}

export default async function HomePage() {
  const [campaignResult, creatorResult] = await Promise.allSettled([
    listPublicCampaigns(new URLSearchParams({ limit: "3", sort: "newest" })),
    listPublicCreators(new URLSearchParams({ limit: "4", sort: "newest" })),
  ]);

  if (campaignResult.status === "rejected") console.error(campaignResult.reason);
  if (creatorResult.status === "rejected") console.error(creatorResult.reason);

  const initialListings: HomeInitialListings = {
    campaigns:
      campaignResult.status === "fulfilled"
        ? campaignResult.value.campaigns.map((campaign) => ({
            id: campaign.id,
            businessName: campaign.businessName,
            title: campaign.title,
            promotionType: campaign.promotionType,
            location: campaign.location,
            language: campaign.language,
            format: campaign.format,
            createdAt: campaign.createdAt,
          }))
        : [],
    campaignsStatus: campaignResult.status === "fulfilled" ? "success" : "error",
    creators:
      creatorResult.status === "fulfilled"
        ? creatorResult.value.creators.map((creator) => ({
            id: creator.id,
            name: creator.name,
            category: creator.category,
            followers: creator.followers,
            location: creator.location,
            languages: creator.languages,
            contentTypes: creator.contentTypes,
            instagram: creator.instagram,
            listedAt: creator.listedAt,
            createdAt: creator.createdAt,
          }))
        : [],
    creatorsStatus: creatorResult.status === "fulfilled" ? "success" : "error",
  };

  return <HomePageClient initialListings={initialListings} />;
}
