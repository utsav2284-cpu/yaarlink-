import { validateAdminAccountPassword } from "@/backend/admin-password-policy";
import {
  adminIdentityUnavailableResponse,
  buildAdminSecurityUrl,
  changeAdminAccountPassword,
  getAdminAccountSession,
  hasRecentAdminStepUp,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { hashPassword } from "@/backend/auth";
import { sendAdminSecurityNoticeEmail } from "@/backend/email";
import { logRouteError } from "@/backend/observability";
import { PasswordBreachCheckUnavailableError } from "@/backend/password-policy";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { readJsonObject } from "@/backend/validation";
import { ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH, ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH } from "@/shared/admin-password-policy";

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
      return Response.json({ error: "Complete MFA verification before changing your password.", code: "mfa_required" }, { status: 403, headers: NO_STORE });
    }
    if (!hasRecentAdminStepUp(context)) {
      return Response.json(
        { error: "Verify MFA again before changing your password.", code: "mfa_step_up_required" },
        { status: 403, headers: NO_STORE },
      );
    }

    const rl = await rateLimit(`${getClientKey(req, "admin-password-change")}:${context.admin.id}`, 5, 15 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const currentPassword = typeof parsedBody.body.currentPassword === "string" ? parsedBody.body.currentPassword : "";
    const newPassword = typeof parsedBody.body.newPassword === "string" ? parsedBody.body.newPassword : "";
    if (!currentPassword) {
      return Response.json({ error: "Current password required", code: "current_password_required" }, { status: 400, headers: NO_STORE });
    }
    if (currentPassword === newPassword) {
      return Response.json({ error: "Choose a different password.", code: "same_password" }, { status: 400, headers: NO_STORE });
    }

    let passwordValidation;
    try {
      passwordValidation = await validateAdminAccountPassword(newPassword, {
        email: context.admin.email,
        name: context.admin.name,
      });
    } catch (error) {
      if (error instanceof PasswordBreachCheckUnavailableError) {
        return Response.json(
          { error: "Password security check is temporarily unavailable. Please try again later.", code: "password_breach_check_unavailable" },
          { status: 503, headers: NO_STORE },
        );
      }
      throw error;
    }
    if (!passwordValidation.ok) {
      return Response.json(
        passwordValidation.problem === "breached"
          ? { error: "That password has appeared in a known data breach. Choose a different one.", code: "password_breached" }
          : {
              error: `Administrator password needs ${ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH}–${ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH} characters with uppercase and lowercase letters, a number, and a symbol.`,
              code: "admin_password_policy",
            },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await changeAdminAccountPassword({
      context,
      currentPassword,
      newPasswordHash: await hashPassword(newPassword),
      req,
    });
    if (result.kind !== "changed") {
      return Response.json({ error: "Current password is wrong.", code: "wrong_password" }, { status: 401, headers: NO_STORE });
    }

    await sendAdminSecurityNoticeEmail({
      to: result.admin.email,
      name: result.admin.name ?? "YaarLink administrator",
      subject: "Your YaarLink administrator password was changed",
      heading: "Administrator password changed",
      message: "Your YaarLink administrator password was changed. This browser stayed signed in and other administrator sessions were signed out. If this was not you, reset your password immediately and contact the owner.",
      actionUrl: buildAdminSecurityUrl(req),
    }).catch((error) =>
      logRouteError(req, error, {
        component: "email",
        operation: "send_admin_password_change_notice",
        adminId: result.admin.id,
      }),
    );

    return Response.json({ ok: true, admin: result.admin }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "password_change" });
    return Response.json({ error: "Could not change password.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
