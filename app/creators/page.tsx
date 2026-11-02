import { listPublicCampaigns } from "@/backend/public-listings";
import CreatorsPageClient, { type CreatorsInitialCampaigns } from "@/frontend/components/CreatorsPageClient";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  let initialCampaigns: CreatorsInitialCampaigns;

  try {
    const result = await listPublicCampaigns(
      new URLSearchParams({ limit: "6", sort: "newest" }),
    );
    initialCampaigns = {
      campaigns: result.campaigns,
      pagination: result.pagination,
      status: "success",
    };
  } catch (error) {
    console.error(error);
    initialCampaigns = { campaigns: [], pagination: null, status: "error" };
  }

  return <CreatorsPageClient initialCampaigns={initialCampaigns} />;
}
