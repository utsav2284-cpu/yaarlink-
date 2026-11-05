import {
  adminIdentitySecretProblem,
  adminIdentityUnavailableResponse,
  createAdminAccountSession,
  createFirstAdminAccount,
  getFirstAdminSetupState,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { validateAdminAccountPassword } from "@/backend/admin-password-policy";
import { hashPassword } from "@/backend/auth";
import { logRouteError } from "@/backend/observability";
import { PasswordBreachCheckUnavailableError } from "@/backend/password-policy";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { normalizeEmail, parseRequiredText, readJsonObject } from "@/backend/validation";
import { ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH, ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH } from "@/shared/admin-password-policy";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * Stage 1 first-time setup. GET reports whether setup is still open (zero
 * administrator accounts) and whether a one-time setup key is required.
 * POST creates the first owner account and signs this browser in. The moment
 * any administrator exists, POST permanently returns 409 — there is no
 * public administrator registration.
 */
export async function GET(req: Request) {
  const rl = await rateLimit(getClientKey(req, "admin-first-setup-status"), 30, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  if (adminIdentitySecretProblem()) {
    return Response.json(
      { error: "Administrator sign-in is not configured.", code: "admin_not_configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  try {
    const state = await getFirstAdminSetupState();
    return Response.json({ ok: true, ...state }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "first_setup_status" });
    return Response.json({ error: "Could not check administrator setup.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  if (adminIdentitySecretProblem()) {
    return Response.json(
      { error: "Administrator sign-in is not configured.", code: "admin_not_configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  const rl = await rateLimit(getClientKey(req, "admin-first-setup"), 5, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

    const parsedName = parseRequiredText(body.name, {
      field: "name",
      maxLength: 120,
      requiredCode: "name_required",
      requiredMessage: "Please enter your name.",
    });
    if (!parsedName.ok) {
      return Response.json(
        { error: parsedName.error, code: parsedName.code, field: parsedName.field },
        { status: 400, headers: NO_STORE },
      );
    }

    const email = normalizeEmail(body.email) ?? "";
    const password = typeof body.password === "string" ? body.password : "";
    const setupKey = typeof body.setupKey === "string" ? body.setupKey : null;
    if (!email || !password) {
      return Response.json(
        { error: "Name, email and password are required.", code: "invalid_request" },
        { status: 400, headers: NO_STORE },
      );
    }

    const accountRl = await rateLimit(`admin-first-setup-account:${await hashKey(email)}`, 5, 15 * 60_000);
    if (!accountRl.ok) return limitedResponse(accountRl.retryAfter);

    let passwordValidation;
    try {
      passwordValidation = await validateAdminAccountPassword(password, {
        email,
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

    const result = await createFirstAdminAccount({
      name: parsedName.value,
      email,
      passwordHash: await hashPassword(password),
      setupKey,
      req,
    });

    if (result.kind === "setup_closed") {
      return Response.json(
        { error: "Administrator setup is already complete. Please sign in.", code: "admin_setup_closed" },
        { status: 409, headers: NO_STORE },
      );
    }
    if (result.kind === "invalid_setup_key") {
      return Response.json(
        { error: "That setup key is not correct.", code: "invalid_setup_key" },
        { status: 403, headers: NO_STORE },
      );
    }

    const session = await createAdminAccountSession(result.adminRow, req);
    return Response.json(
      {
        ok: true,
        admin: result.admin,
        session: {
          mfaRequired: session.mfaRequired,
          mfaEnrolled: session.mfaEnrolled,
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
    logRouteError(req, error, { component: "admin-identity", operation: "first_setup_create" });
    return Response.json({ error: "Could not create the administrator account.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
