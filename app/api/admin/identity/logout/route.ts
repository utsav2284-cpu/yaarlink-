import {
  adminIdentityUnavailableResponse,
  clearAdminAccountSessionCookie,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
  logoutAdminAccountSession,
} from "@/backend/admin-identity";
import { logRouteError } from "@/backend/observability";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST(req: Request) {
  try {
    const revoked = await logoutAdminAccountSession(req);
    return Response.json({ ok: true, revoked }, { headers: NO_STORE });
  } catch (error) {
    await clearAdminAccountSessionCookie().catch(() => undefined);
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "logout" });
    return Response.json(
      { error: "This browser was signed out, but server-side session revocation could not be confirmed.", code: "admin_session_revoke_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
