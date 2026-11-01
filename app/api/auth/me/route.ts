import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionSecretProblem, sessionUnavailableResponse } from "@/backend/auth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  if (sessionSecretProblem()) {
    return Response.json(
      { error: "Session service is temporarily unavailable", code: "service_unavailable" },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
    );
  }

  try {
    const user = await getSessionUser();
    return Response.json({ user }, { headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) logSessionUnavailable(e);
    else console.error(e);
    // A database/session-store outage is not evidence that the visitor is
    // logged out. Clients use this 503 to show a retry state instead of
    // switching to logged-out controls.
    return sessionUnavailableResponse(NO_STORE);
  }
}
