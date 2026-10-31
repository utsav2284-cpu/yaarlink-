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
  const rl = rateLimit(getClientKey(req, "verify-email"), 10, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.token;
    const password = String(body?.password || "");

    if (!isSignupVerificationToken(token) || password.length < 10 || password.length > 256) {
      return invalidResponse();
    }

    const tokenHash = await hashSignupVerificationToken(token);
    const tokenRl = rateLimit(`verify-email-token:${hashKey(tokenHash)}`, 10, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    const pending = await findPendingSignupByTokenHash(tokenHash);
    if (!pending) return invalidResponse();

    const { ok } = await verifyPassword(password, pending.passwordHash);
    if (!ok) {
      await recordFailedPendingVerification(pending.id);
      return invalidResponse();
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
