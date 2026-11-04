import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { finishAdminPasskeyRegistration } from "@/backend/admin-mfa";
import { logRouteError } from "@/backend/observability";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { readJsonObject } from "@/backend/validation";
import {
  normalizePasskeyDeviceName,
  parseAdminPasskeyRegistrationResponse,
} from "@/shared/admin-webauthn";

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
    if (!context.mfaSatisfied) {
      return Response.json(
        { error: "Complete MFA verification before adding a Passkey.", code: "mfa_required" },
        { status: 403, headers: NO_STORE },
      );
    }

    const rl = await rateLimit(
      `${getClientKey(req, "admin-mfa-passkey-register-finish")}:${context.admin.id}`,
      10,
      15 * 60_000,
    );
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const response = parseAdminPasskeyRegistrationResponse(parsedBody.body.response);
    const deviceName = normalizePasskeyDeviceName(parsedBody.body.deviceName ?? "Passkey");
    if (!response || !deviceName) {
      return Response.json(
        { error: "That Passkey response is not valid. Try again.", code: "passkey_invalid" },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await finishAdminPasskeyRegistration({ context, response, deviceName, req });
    if (result.kind === "already_registered") {
      return Response.json(
        { error: "That Passkey is already registered.", code: "passkey_already_registered" },
        { status: 409, headers: NO_STORE },
      );
    }
    if (result.kind === "challenge_expired") {
      return Response.json(
        { error: "That Passkey setup request expired. Start again.", code: "passkey_challenge_expired" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (result.kind === "invalid_response") {
      return Response.json(
        { error: "That Passkey could not be verified. Try again.", code: "passkey_invalid" },
        { status: 400, headers: NO_STORE },
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
    if (result.kind === "session_expired") {
      return Response.json(
        { error: "Your administrator session expired. Sign in again.", code: "session_expired" },
        { status: 401, headers: NO_STORE },
      );
    }
    if (result.kind === "step_up_required") {
      return Response.json(
        { error: "Verify MFA again before adding a Passkey.", code: "mfa_step_up_required" },
        { status: 403, headers: NO_STORE },
      );
    }
    return Response.json({ ok: true, passkey: result.passkey }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-mfa", operation: "passkey_register_finish" });
    return Response.json(
      { error: "Could not finish Passkey setup.", code: "admin_mfa_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
