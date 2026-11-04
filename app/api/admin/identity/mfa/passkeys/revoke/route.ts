import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  hasRecentAdminStepUp,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { revokeAdminPasskey } from "@/backend/admin-mfa";
import { logRouteError } from "@/backend/observability";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { parseUuid, readJsonObject } from "@/backend/validation";

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
    if (!context.mfaSatisfied || !hasRecentAdminStepUp(context)) {
      return Response.json(
        { error: "Verify MFA again before removing a Passkey.", code: "mfa_step_up_required" },
        { status: 403, headers: NO_STORE },
      );
    }

    const rl = await rateLimit(
      `${getClientKey(req, "admin-mfa-passkey-revoke")}:${context.admin.id}`,
      5,
      15 * 60_000,
    );
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const passkeyId = parseUuid(parsedBody.body.passkeyId);
    const password =
      typeof parsedBody.body.currentPassword === "string" ? parsedBody.body.currentPassword : "";
    if (!passkeyId || !password || password.length > 256) {
      return Response.json(
        { error: "Choose a Passkey and enter your current administrator password.", code: "invalid_request" },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await revokeAdminPasskey({ context, passkeyId, password, req });
    if (result.kind === "invalid_password") {
      return Response.json(
        { error: "Current administrator password is incorrect.", code: "current_password_incorrect" },
        { status: 403, headers: NO_STORE },
      );
    }
    if (result.kind === "step_up_required") {
      return Response.json(
        { error: "Verify MFA again before removing a Passkey.", code: "mfa_step_up_required" },
        { status: 403, headers: NO_STORE },
      );
    }
    if (result.kind === "not_found") {
      return Response.json(
        { error: "That Passkey was not found.", code: "passkey_not_found" },
        { status: 404, headers: NO_STORE },
      );
    }
    if (result.kind === "last_method") {
      return Response.json(
        {
          error: "This Passkey cannot be removed while it is your only MFA method. Add another method first.",
          code: "admin_last_mfa_method",
        },
        { status: 409, headers: NO_STORE },
      );
    }
    return Response.json(
      { ok: true, remainingPasskeys: result.remainingPasskeys },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-mfa", operation: "passkey_revoke" });
    return Response.json(
      { error: "Could not remove that Passkey.", code: "admin_mfa_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
