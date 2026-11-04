import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { verifyAdminRecoveryCodeForSession } from "@/backend/admin-mfa";
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

    const clientKey = `${getClientKey(req, "admin-mfa-recovery-verify")}:${context.admin.id}`;
    const accountKey = `admin-mfa-recovery-verify-account:${await hashKey(context.admin.id)}`;
    const lockedFor = Math.max(await authLockoutSeconds(clientKey), await authLockoutSeconds(accountKey));
    if (lockedFor > 0) return limitedResponse(lockedFor);
    const rl = await rateLimit(clientKey, 10, 15 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const code = typeof parsedBody.body.code === "string" ? parsedBody.body.code : "";
    if (!code || code.length > 64) {
      return Response.json({ error: "Enter one unused recovery code.", code: "recovery_code_required" }, { status: 400, headers: NO_STORE });
    }

    const result = await verifyAdminRecoveryCodeForSession({ context, code, req });
    if (result.kind === "invalid_code") {
      await registerAuthFailure(clientKey);
      await registerAuthFailure(accountKey);
      return Response.json({ error: "That recovery code is not valid or was already used.", code: "recovery_code_invalid" }, { status: 400, headers: NO_STORE });
    }
    if (result.kind === "session_expired") {
      return Response.json({ error: "Your administrator session expired. Sign in again.", code: "session_expired" }, { status: 401, headers: NO_STORE });
    }

    await clearAuthFailures(clientKey);
    await clearAuthFailures(accountKey);
    return Response.json({ ok: true, recoveryCodesRemaining: result.recoveryCodesRemaining }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-mfa", operation: "recovery_verify" });
    return Response.json({ error: "Could not verify the recovery code.", code: "admin_mfa_failed" }, { status: 500, headers: NO_STORE });
  }
}
