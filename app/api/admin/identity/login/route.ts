import {
  adminIdentitySecretProblem,
  adminIdentityUnavailableResponse,
  authenticateAdminAccount,
  createAdminAccountSession,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
  toAdminAccountView,
} from "@/backend/admin-identity";
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
import { normalizeEmail, readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function wrongCredentialsResponse() {
  return Response.json(
    { error: "Wrong administrator email or password.", code: "admin_wrong_credentials" },
    { status: 401, headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  if (adminIdentitySecretProblem()) {
    return Response.json({ error: "Administrator sign-in is not configured.", code: "admin_not_configured" }, { status: 503, headers: NO_STORE });
  }

  const clientKey = getClientKey(req, "admin-identity-login");
  const rl = await rateLimit(clientKey, 5, 5 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const email = normalizeEmail(parsedBody.body.email) ?? "";
    const password = typeof parsedBody.body.password === "string" ? parsedBody.body.password : "";
    if (!email || !password) {
      return Response.json({ error: "Email and password required", code: "invalid_request" }, { status: 400, headers: NO_STORE });
    }

    const accountKey = `admin-identity-login-account:${await hashKey(email)}`;
    const lockedFor = Math.max(await authLockoutSeconds(clientKey), await authLockoutSeconds(accountKey));
    if (lockedFor > 0) return limitedResponse(lockedFor);

    const result = await authenticateAdminAccount({ email, password, req });
    if (result.kind !== "authenticated") {
      await registerAuthFailure(accountKey);
      await registerAuthFailure(clientKey);
      return wrongCredentialsResponse();
    }

    await clearAuthFailures(accountKey);
    await clearAuthFailures(clientKey);
    const session = await createAdminAccountSession(result.admin, req);
    return Response.json(
      {
        ok: true,
        admin: toAdminAccountView(result.admin),
        session: {
          mfaRequired: session.mfaRequired,
          mfaEnrolled: session.mfaEnrolled,
          // Stage 1 simple mode: the password session is complete. Stage 2:
          // the browser still owes MFA verification, so this stays false.
          mfaSatisfied: !session.mfaRequired,
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "login" });
    return Response.json({ error: "Could not sign in.", code: "admin_login_failed" }, { status: 500, headers: NO_STORE });
  }
}
