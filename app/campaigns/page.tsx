import { headers } from "next/headers";
import { logRouteError } from "@/backend/observability";
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
    logRouteError(await headers(), error, { operation: "list_public_campaigns" }, "GET /campaigns");
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
    const requestHeaders = await headers();
    if (isSessionUnavailableError(error)) logSessionUnavailable(error, "lookup", requestHeaders, "GET /campaigns");
    else logRouteError(requestHeaders, error, { operation: "list_own_applications" }, "GET /campaigns");
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
