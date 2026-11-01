import { adminPasswordProblem, adminSecretProblem, adminTotpProblem, createAdminSession, isAdminTotpEnabled, verifyAdminPassword, verifyAdminTotp } from "@/backend/admin";
import { logAdminAudit } from "@/backend/admin-audit";
import { authLockoutSeconds, clearAuthFailures, getClientKey, limitedResponse, rateLimit, registerAuthFailure } from "@/backend/rate-limit";
import { readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

async function failedAttemptResponse(clientKey: string, error: string) {
  const lockFor = await registerAuthFailure(clientKey);
  if (lockFor > 0) {
    return Response.json(
      { error: "Too many failed attempts. Please try again later.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(lockFor), ...NO_STORE } },
    );
  }
  return Response.json({ error, code: "admin_wrong_credentials" }, { status: 401, headers: NO_STORE });
}

export async function POST(req: Request) {
  // Refuse to operate unless the admin password and a distinct, strong admin
  // signing secret are configured. An invalid TOTP secret also fails closed
  // instead of silently using password-only auth.
  if (adminPasswordProblem() || adminSecretProblem() || adminTotpProblem()) {
    return Response.json({ error: "Admin login is not configured.", code: "admin_not_configured" }, { status: 503, headers: NO_STORE });
  }
  const clientKey = getClientKey(req, "admin-login");
  const rl = await rateLimit(clientKey, 5, 5 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  // Hard lockout + exponential backoff on repeated failures from this client.
  const locked = await authLockoutSeconds(clientKey);
  if (locked > 0) return limitedResponse(locked);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    const password = typeof body.password === "string" ? body.password : "";
    const mfaUsed = isAdminTotpEnabled();
    if (!password) {
      await logAdminAudit(req, {
        action: "admin.login",
        outcome: "failure",
        details: { reason: "missing_password", mfaConfigured: mfaUsed },
      });
      return Response.json({ error: "Password required", code: "password_required" }, { status: 400, headers: NO_STORE });
    }

    if (!(await verifyAdminPassword(password))) {
      await logAdminAudit(req, {
        action: "admin.login",
        outcome: "failure",
        details: { reason: "wrong_password", mfaConfigured: mfaUsed },
      });
      return await failedAttemptResponse(clientKey, mfaUsed ? "Wrong password or authenticator code" : "Wrong password");
    }

    if (mfaUsed && !(await verifyAdminTotp(body.totp))) {
      await logAdminAudit(req, {
        action: "admin.login",
        outcome: "failure",
        details: { reason: "invalid_totp", mfaConfigured: true },
      });
      return await failedAttemptResponse(clientKey, "Wrong password or authenticator code");
    }

    const priorFailures = await clearAuthFailures(clientKey);
    if (priorFailures > 0) console.warn(`[admin-login] success after ${priorFailures} failed attempt(s)`);
    await createAdminSession();
    await logAdminAudit(req, {
      action: "admin.login",
      details: { mfaUsed, priorFailures },
    });
    return Response.json({ ok: true, mfaUsed }, { headers: NO_STORE });
  } catch (error) {
    console.error(error);
    await logAdminAudit(req, {
      action: "admin.login",
      outcome: "failure",
      details: { reason: "server_error" },
    });
    return Response.json({ error: "Could not log in", code: "admin_login_failed" }, { status: 500, headers: NO_STORE });
  }
}
