import { validateAdminAccountPassword } from "@/backend/admin-password-policy";
import {
  ADMIN_ACCOUNT_COOKIE,
  adminAccountCookieOptions,
  adminIdentityUnavailableResponse,
  buildAdminSignInUrl,
  consumeAdminPasswordResetToken,
  inspectAdminAuthToken,
  isAdminAuthToken,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { hashPassword } from "@/backend/auth";
import { sendAdminSecurityNoticeEmail } from "@/backend/email";
import { logRouteError } from "@/backend/observability";
import { PasswordBreachCheckUnavailableError } from "@/backend/password-policy";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { readJsonObject } from "@/backend/validation";
import { ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH, ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH } from "@/shared/admin-password-policy";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function invalidResponse() {
  return Response.json({ error: "This administrator password reset link is not valid.", code: "invalid_token" }, { status: 400, headers: NO_STORE });
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "admin-password-reset"), 10, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const token = parsedBody.body.token;
    const newPassword = typeof parsedBody.body.newPassword === "string" ? parsedBody.body.newPassword : "";
    if (!isAdminAuthToken(token)) return invalidResponse();

    const tokenRl = await rateLimit(`admin-password-reset-token:${await hashKey(token)}`, 10, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    const inspection = await inspectAdminAuthToken(token, "password_reset");
    if (!inspection) return invalidResponse();

    let passwordValidation;
    try {
      passwordValidation = await validateAdminAccountPassword(newPassword, {
        email: inspection.email,
        name: inspection.name,
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

    const completion = await consumeAdminPasswordResetToken({
      token,
      passwordHash: await hashPassword(newPassword),
      req,
    });
    if (completion.kind !== "reset") return invalidResponse();

    const response = NextResponse.json({ ok: true, status: "password_reset" }, { headers: NO_STORE });
    response.cookies.set(ADMIN_ACCOUNT_COOKIE, "", adminAccountCookieOptions(0));

    await sendAdminSecurityNoticeEmail({
      to: completion.admin.email,
      name: completion.admin.name ?? "YaarLink administrator",
      subject: "Your YaarLink administrator password was reset",
      heading: "Administrator password reset complete",
      message: "Your YaarLink administrator password was reset and all administrator sessions were signed out. If this was not you, contact the owner immediately through a trusted channel.",
      actionUrl: buildAdminSignInUrl(req),
    }).catch((error) =>
      logRouteError(req, error, {
        component: "email",
        operation: "send_admin_password_reset_notice",
        adminId: completion.admin.id,
      }),
    );

    return response;
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "password_reset_complete" });
    return Response.json({ error: "Could not reset password.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
