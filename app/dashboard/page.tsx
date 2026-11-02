import { redirect } from "next/navigation";
import { getSessionContext, isSessionUnavailableError, logSessionUnavailable } from "@/backend/auth";
import DashboardClient from "@/frontend/components/DashboardClient";
import { buildAuthPath, safeReturnTo } from "@/shared/return-to";
import { normalizeUserRole } from "@/shared/user-roles";

export const dynamic = "force-dynamic";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (typeof value === "string") {
      query.append(key, value);
    }
  }
  const queryString = query.toString();
  const returnTo = safeReturnTo(`/dashboard${queryString ? `?${queryString}` : ""}`);

  let session = null;
  let sessionUnavailable = false;
  try {
    session = await getSessionContext();
  } catch (error) {
    if (!isSessionUnavailableError(error)) throw error;
    // Unknown session state is not proof of logout. Let the client show its
    // existing retry/error surface rather than redirecting a possibly
    // signed-in person to login during a session-store outage.
    sessionUnavailable = true;
    logSessionUnavailable(error);
  }

  if (!session && !sessionUnavailable) {
    redirect(buildAuthPath("/login", { returnTo }));
  }

  const requestedView = normalizeUserRole(Array.isArray(params.view) ? params.view[0] : params.view);
  const initialView = requestedView ?? session?.user.primaryRole ?? "brand";

  return (
    <DashboardClient
      initialView={initialView}
      returnTo={returnTo}
      initialSessionUnavailable={sessionUnavailable}
    />
  );
}
