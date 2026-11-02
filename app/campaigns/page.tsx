import {
  getSessionUser,
  isSessionUnavailableError,
  logSessionUnavailable,
  sessionSecretProblem,
} from "@/backend/auth";
import { listOwnApplications } from "@/backend/own-applications";
import { listPublicCampaigns } from "@/backend/public-listings";
import CampaignsPageClient, { type CampaignsInitialData } from "@/frontend/components/CampaignsPageClient";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  let campaigns: CampaignsInitialData["campaigns"] = [];
  let pagination: CampaignsInitialData["pagination"] = null;
  let campaignsStatus: CampaignsInitialData["campaignsStatus"] = "success";

  try {
    const result = await listPublicCampaigns(
      new URLSearchParams({ limit: "24", sort: "newest" }),
    );
    campaigns = result.campaigns;
    pagination = result.pagination;
  } catch (error) {
    console.error(error);
    campaignsStatus = "error";
  }

  let ownApplications: CampaignsInitialData["ownApplications"] = null;
  let ownApplicationsStatus: CampaignsInitialData["ownApplicationsStatus"] = "guest";

  try {
    if (sessionSecretProblem()) {
      ownApplicationsStatus = "error";
    } else {
      const user = await getSessionUser();
      if (user) {
        const campaignIds = campaigns.map((campaign) => campaign.id);
        const params = new URLSearchParams({
          limit: String(Math.max(1, campaignIds.length)),
        });
        if (campaignIds.length) params.set("campaignIds", campaignIds.join(","));
        ownApplications = await listOwnApplications(user, params);
        ownApplicationsStatus = "ready";
      }
    }
  } catch (error) {
    ownApplicationsStatus = "error";
    if (isSessionUnavailableError(error)) logSessionUnavailable(error);
    else console.error(error);
  }

  return (
    <CampaignsPageClient
      initialData={{
        campaigns,
        pagination,
        campaignsStatus,
        ownApplications,
        ownApplicationsStatus,
      }}
    />
  );
}
