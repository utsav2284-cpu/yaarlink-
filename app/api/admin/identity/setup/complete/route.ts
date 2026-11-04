import { validateAdminAccountPassword } from "@/backend/admin-password-policy";
import {
  adminIdentityUnavailableResponse,
  buildAdminSignInUrl,
  consumeAdminSetupToken,
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
import { parseRequiredText, readJsonObject } from "@/backend/validation";
import { ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH, ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH } from "@/shared/admin-password-policy";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function invalidResponse() {
  return Response.json({ error: "This administrator setup link is not valid.", code: "invalid_token" }, { status: 400, headers: NO_STORE });
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "admin-setup-complete"), 10, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    const token = body.token;
    const purpose = body.kind === "owner_setup" || body.kind === "admin_invitation" ? body.kind : null;
    const password = typeof body.password === "string" ? body.password : "";
    const parsedName = parseRequiredText(body.name, {
      field: "name",
      maxLength: 120,
      requiredCode: "name_required",
      requiredMessage: "Please enter your name.",
    });

    if (!isAdminAuthToken(token) || !purpose) return invalidResponse();
    if (!parsedName.ok) {
      return Response.json(
        { error: parsedName.error, code: parsedName.code, field: parsedName.field },
        { status: 400, headers: NO_STORE },
      );
    }

    const tokenRl = await rateLimit(`admin-setup-complete-token:${await hashKey(token)}`, 10, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    const inspection = await inspectAdminAuthToken(token, purpose);
    if (!inspection) return invalidResponse();

    let passwordValidation;
    try {
      passwordValidation = await validateAdminAccountPassword(password, {
        email: inspection.email,
        name: parsedName.value,
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

    const completion = await consumeAdminSetupToken({
      token,
      purpose,
      name: parsedName.value,
      passwordHash: await hashPassword(password),
      req,
    });
    if (completion.kind !== "completed") return invalidResponse();

    await sendAdminSecurityNoticeEmail({
      to: completion.admin.email,
      name: completion.admin.name ?? parsedName.value,
      subject: "Your YaarLink administrator account is ready",
      heading: "Administrator account created",
      message: "Your YaarLink administrator account was created. Sign in with the password you just chose, then complete the security steps shown in Admin security.",
      actionUrl: buildAdminSignInUrl(req),
    }).catch((error) =>
      logRouteError(req, error, {
        component: "email",
        operation: "send_admin_setup_notice",
        adminId: completion.admin.id,
      }),
    );

    return Response.json({ ok: true, admin: completion.admin }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "setup_complete" });
    return Response.json({ error: "Could not complete administrator setup.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
