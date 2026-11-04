import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { getAdminMfaStatus } from "@/backend/admin-mfa";
import { logRouteError } from "@/backend/observability";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: Request) {
  try {
    const context = await getAdminAccountSession();
    if (!context) {
      return Response.json(
        { error: "Please sign in as an administrator.", code: "unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }
    return Response.json({ mfa: await getAdminMfaStatus(context) }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-mfa", operation: "status" });
    return Response.json(
      { error: "Could not load administrator MFA status.", code: "request_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
