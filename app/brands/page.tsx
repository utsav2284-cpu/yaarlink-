import { headers } from "next/headers";
import { logRouteError } from "@/backend/observability";
import { listPublicCreators } from "@/backend/public-listings";
import BrandsPageClient, { type BrandsInitialCreators } from "@/frontend/components/BrandsPageClient";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  let initialCreators: BrandsInitialCreators;

  try {
    const result = await listPublicCreators(
      new URLSearchParams({ limit: "8", sort: "newest" }),
    );
    initialCreators = {
      creators: result.creators,
      pagination: result.pagination,
      status: "success",
    };
  } catch (error) {
    logRouteError(await headers(), error, { operation: "list_public_creators" }, "GET /brands");
    initialCreators = { creators: [], pagination: null, status: "error" };
  }

  return <BrandsPageClient initialCreators={initialCreators} />;
}
