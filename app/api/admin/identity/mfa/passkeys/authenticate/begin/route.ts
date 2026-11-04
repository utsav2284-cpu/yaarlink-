import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { beginAdminPasskeyAuthentication } from "@/backend/admin-mfa";
import { logRouteError } from "@/backend/observability";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST(req: Request) {
  if (!sameOriginMutationAllowed(req)) {
    return Response.json(
      { error: "Cross-site request rejected", code: "cross_site_rejected" },
      { status: 403, headers: NO_STORE },
    );
  }

  try {
    const context = await getAdminAccountSession();
    if (!context) {
      return Response.json(
        { error: "Please sign in as an administrator.", code: "unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }

    const rl = await rateLimit(
      `${getClientKey(req, "admin-mfa-passkey-auth-begin")}:${context.admin.id}`,
      10,
      15 * 60_000,
    );
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { allowEmpty: true, headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;

    const result = await beginAdminPasskeyAuthentication({ context, req });
    if (result.kind === "not_enrolled") {
      return Response.json(
        { error: "No Passkey is registered for this administrator.", code: "passkey_not_enrolled" },
        { status: 409, headers: NO_STORE },
      );
    }
    if (result.kind === "origin_not_allowed") {
      return Response.json(
        {
          error: "Passkeys are not available on this address. Open administrator security on the secure site address.",
          code: "passkey_origin_not_allowed",
        },
        { status: 400, headers: NO_STORE },
      );
    }
    return Response.json({ ok: true, options: result.options }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-mfa", operation: "passkey_auth_begin" });
    return Response.json(
      { error: "Could not start Passkey verification.", code: "admin_mfa_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
