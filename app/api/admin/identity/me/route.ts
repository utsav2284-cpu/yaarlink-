import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { logRouteError } from "@/backend/observability";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: Request) {
  try {
    const context = await getAdminAccountSession();
    if (!context) {
      return Response.json({ error: "Please sign in as an administrator.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    }
    return Response.json(
      {
        admin: context.admin,
        session: {
          id: context.sessionId,
          createdAt: context.sessionCreatedAt,
          expiresAt: context.sessionExpiresAt,
          mfaVerifiedAt: context.mfaVerifiedAt,
          mfaEnrolled: context.mfaEnrolled,
          mfaSatisfied: context.mfaSatisfied,
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "me" });
    return Response.json({ error: "Could not load administrator session.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
