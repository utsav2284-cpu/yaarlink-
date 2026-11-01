import { NextResponse } from "next/server";
import {
  createSessionToken,
  createUserSessionRecord,
  sessionSecretProblem,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  verifyPassword,
} from "@/backend/auth";
import {
  completePendingSignup,
  findPendingSignupByTokenHash,
  hashSignupVerificationToken,
  isSignupVerificationToken,
  isUserEmailUniqueViolation,
  recordFailedPendingVerification,
} from "@/backend/email-verification";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordBreachCheckUnavailableError,
  passwordLength,
  validateNewPassword,
} from "@/backend/password-policy";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function invalidResponse() {
  return Response.json(
    { error: "This verification link or password is not valid.", code: "invalid_token" },
    { status: 400, headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "verify-email"), 10, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.token;
    const password = String(body?.password || "");

    const submittedPasswordLength = passwordLength(password);
    if (
      !isSignupVerificationToken(token) ||
      submittedPasswordLength < PASSWORD_MIN_LENGTH ||
      submittedPasswordLength > PASSWORD_MAX_LENGTH
    ) {
      return invalidResponse();
    }

    const tokenHash = await hashSignupVerificationToken(token);
    const tokenRl = await rateLimit(`verify-email-token:${await hashKey(tokenHash)}`, 10, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    const pending = await findPendingSignupByTokenHash(tokenHash);
    if (!pending) return invalidResponse();

    const { ok } = await verifyPassword(password, pending.passwordHash);
    if (!ok) {
      await recordFailedPendingVerification(pending.id);
      return invalidResponse();
    }

    // Recheck at account creation as well as initial signup. This closes the
    // gap for a pending signup created before the breach check was deployed
    // (and for newly published breach data) without consuming the token when
    // the check is unavailable.
    let passwordValidation;
    try {
      passwordValidation = await validateNewPassword(password, {
        email: pending.email,
        name: pending.name,
        phone: pending.phone,
      });
    } catch (error) {
      if (error instanceof PasswordBreachCheckUnavailableError) {
        return Response.json(
          {
            error: "Password security check is temporarily unavailable. Please try again later.",
            code: "password_breach_check_unavailable",
          },
          { status: 503, headers: NO_STORE },
        );
      }
      throw error;
    }
    if (!passwordValidation.ok) {
      if (passwordValidation.problem === "length") return invalidResponse();
      return Response.json(
        {
          error: "That password has appeared in a known data breach. Start signup again with a different one.",
          code: "password_breached",
        },
        { status: 400, headers: NO_STORE },
      );
    }

    if (sessionSecretProblem()) {
      return Response.json(
        { error: "Account creation is temporarily unavailable.", code: "service_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }

    // Choose the user ID, sign the session, and build the success response
    // before committing anything. A missing/broken session secret therefore
    // fails before the pending signup is consumed or account/profile rows are
    // created. The prepared response is simply discarded if completion loses
    // a race or the transaction otherwise does not create the account.
    const userId = crypto.randomUUID();
    const verifiedAt = new Date();
    const session = createUserSessionRecord(req);
    const sessionToken = await createSessionToken(userId, 0, session.id, session.createdAt.getTime());
    const response = NextResponse.json(
      { user: { id: userId, name: pending.name, email: pending.email, role: pending.role } },
      { headers: NO_STORE },
    );
    response.cookies.set(SESSION_COOKIE, sessionToken, SESSION_COOKIE_OPTIONS);

    const completion = await completePendingSignup({
      pendingId: pending.id,
      email: pending.email,
      tokenHash,
      passwordHash: pending.passwordHash,
      userId,
      verifiedAt,
      session,
    });

    if (completion.kind !== "created") return invalidResponse();

    return response;
  } catch (error) {
    // A parallel completion (or an account created by another path) is not a
    // server error from the caller's perspective; the token is simply no
    // longer usable. The page directs the person to log in in that case.
    if (isUserEmailUniqueViolation(error)) return invalidResponse();
    console.error(error);
    return Response.json({ error: "Could not verify email", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
