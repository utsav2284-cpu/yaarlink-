import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { finishAdminPasskeyAuthentication } from "@/backend/admin-mfa";
import { logRouteError } from "@/backend/observability";
import {
  authLockoutSeconds,
  clearAuthFailures,
  getClientKey,
  hashKey,
  limitedResponse,
  rateLimit,
  registerAuthFailure,
} from "@/backend/rate-limit";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { readJsonObject } from "@/backend/validation";
import { parseAdminPasskeyAuthenticationResponse } from "@/shared/admin-webauthn";

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

    const clientKey = `${getClientKey(req, "admin-mfa-passkey-verify")}:${context.admin.id}`;
    const accountKey = `admin-mfa-passkey-verify-account:${await hashKey(context.admin.id)}`;
    const lockedFor = Math.max(
      await authLockoutSeconds(clientKey),
      await authLockoutSeconds(accountKey),
    );
    if (lockedFor > 0) return limitedResponse(lockedFor);
    const rl = await rateLimit(clientKey, 10, 15 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const response = parseAdminPasskeyAuthenticationResponse(parsedBody.body.response);
    if (!response) {
      await registerAuthFailure(clientKey);
      await registerAuthFailure(accountKey);
      return Response.json(
        { error: "That Passkey response is not valid. Try again.", code: "passkey_invalid" },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await finishAdminPasskeyAuthentication({ context, response, req });
    if (result.kind === "invalid_response" || result.kind === "counter_regression") {
      await registerAuthFailure(clientKey);
      await registerAuthFailure(accountKey);
    }
    if (result.kind === "challenge_expired") {
      return Response.json(
        { error: "That Passkey verification expired. Try again.", code: "passkey_challenge_expired" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (result.kind === "invalid_response" || result.kind === "counter_regression") {
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

    await clearAuthFailures(clientKey);
    await clearAuthFailures(accountKey);
    return Response.json({ ok: true, passkey: result.passkey }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-mfa", operation: "passkey_auth_finish" });
    return Response.json(
      { error: "Could not verify that Passkey.", code: "admin_mfa_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
