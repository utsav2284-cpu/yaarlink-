import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  hasRecentAdminStepUp,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { disableAdminTotp } from "@/backend/admin-mfa";
import { logRouteError } from "@/backend/observability";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST(req: Request) {
  if (!sameOriginMutationAllowed(req)) {
    return Response.json({ error: "Cross-site request rejected", code: "cross_site_rejected" }, { status: 403, headers: NO_STORE });
  }

  try {
    const context = await getAdminAccountSession();
    if (!context) {
      return Response.json({ error: "Please sign in as an administrator.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    }
    if (!context.mfaSatisfied) {
      return Response.json({ error: "Complete MFA verification first.", code: "mfa_required" }, { status: 403, headers: NO_STORE });
    }
    if (!hasRecentAdminStepUp(context)) {
      return Response.json({ error: "Verify MFA again before changing authenticator settings.", code: "mfa_step_up_required" }, { status: 403, headers: NO_STORE });
    }

    const rl = await rateLimit(`${getClientKey(req, "admin-mfa-totp-disable")}:${context.admin.id}`, 5, 15 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const password = typeof parsedBody.body.currentPassword === "string" ? parsedBody.body.currentPassword : "";
    const code = typeof parsedBody.body.code === "string" ? parsedBody.body.code : "";
    if (!password || password.length > 256 || !code || code.length > 32) {
      return Response.json({ error: "Current password and authenticator code are required.", code: "invalid_request" }, { status: 400, headers: NO_STORE });
    }

    const result = await disableAdminTotp({ context, password, code, req });
    if (result.kind === "invalid_password") {
      return Response.json({ error: "Current administrator password is incorrect.", code: "current_password_incorrect" }, { status: 403, headers: NO_STORE });
    }
    if (result.kind === "invalid_code") {
      return Response.json({ error: "That authenticator code is not valid.", code: "mfa_code_invalid" }, { status: 400, headers: NO_STORE });
    }
    if (result.kind === "not_enrolled") {
      return Response.json({ error: "Authenticator MFA is not enrolled yet.", code: "mfa_not_enrolled" }, { status: 409, headers: NO_STORE });
    }
    if (result.kind === "step_up_required") {
      return Response.json({ error: "Verify MFA again before changing authenticator settings.", code: "mfa_step_up_required" }, { status: 403, headers: NO_STORE });
    }
    if (result.kind === "last_method") {
      return Response.json(
        {
          error: "Authenticator MFA cannot be removed while it is your only MFA method. Add another method first, or replace the authenticator instead.",
          code: "admin_last_mfa_method",
        },
        { status: 409, headers: NO_STORE },
      );
    }
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-mfa", operation: "totp_disable" });
    return Response.json({ error: "Could not disable authenticator MFA.", code: "admin_mfa_failed" }, { status: 500, headers: NO_STORE });
  }
}
