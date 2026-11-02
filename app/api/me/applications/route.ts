import { logRouteError } from "@/backend/observability";
import {
  getSessionUser,
  isSessionUnavailableError,
  logSessionUnavailable,
  sessionSecretProblem,
  sessionUnavailableResponse,
} from "@/backend/auth";
import { listOwnApplications } from "@/backend/own-applications";
import { isListingQueryError } from "@/backend/pagination";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Private, reload-safe application state for the signed-in user. The public
 * campaigns page uses this to keep showing an existing application instead of
 * presenting every campaign as unapplied after a refresh, and to identify
 * campaigns the same dual-purpose account owns before an application starts.
 */
export async function GET(req: Request) {
  if (sessionSecretProblem()) {
    return Response.json(
      { error: "Session service is temporarily unavailable", code: "service_unavailable" },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
    );
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return Response.json(
        { error: "Please log in to view your applications", code: "login_required" },
        { status: 401, headers: NO_STORE },
      );
    }

    const result = await listOwnApplications(user, new URL(req.url).searchParams);
    return Response.json(result, { headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e, "lookup", req);
      return sessionUnavailableResponse(NO_STORE);
    }
    if (isListingQueryError(e)) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    }
    logRouteError(req, e);
    return Response.json(
      { error: "Could not load your applications", code: "load_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
