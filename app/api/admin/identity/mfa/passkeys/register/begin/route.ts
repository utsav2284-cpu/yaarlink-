import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  hasRecentAdminStepUp,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { beginAdminPasskeyRegistration } from "@/backend/admin-mfa";
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
    if (!context.mfaSatisfied || !hasRecentAdminStepUp(context)) {
      return Response.json(
        { error: "Verify MFA again before adding a Passkey.", code: "mfa_step_up_required" },
        { status: 403, headers: NO_STORE },
      );
    }

    const rl = await rateLimit(
      `${getClientKey(req, "admin-mfa-passkey-register-begin")}:${context.admin.id}`,
      5,
      15 * 60_000,
    );
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const password =
      typeof parsedBody.body.currentPassword === "string" ? parsedBody.body.currentPassword : "";
    if (!password || password.length > 256) {
      return Response.json(
        { error: "Enter your current administrator password.", code: "current_password_required" },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await beginAdminPasskeyRegistration({ context, password, req });
    if (result.kind === "invalid_password") {
      return Response.json(
        { error: "Current administrator password is incorrect.", code: "current_password_incorrect" },
        { status: 403, headers: NO_STORE },
      );
    }
    if (result.kind === "step_up_required") {
      return Response.json(
        { error: "Verify MFA again before adding a Passkey.", code: "mfa_step_up_required" },
        { status: 403, headers: NO_STORE },
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
    logRouteError(req, error, { component: "admin-mfa", operation: "passkey_register_begin" });
    return Response.json(
      { error: "Could not start Passkey setup.", code: "admin_mfa_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
