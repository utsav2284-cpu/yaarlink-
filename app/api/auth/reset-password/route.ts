import { NextResponse } from "next/server";
import { buildLoginUrl, consumePasswordResetToken, hashAccountToken, isAccountToken } from "@/backend/account-tokens";
import { hashPassword, SESSION_COOKIE } from "@/backend/auth";
import { sendAccountSecurityNoticeEmail } from "@/backend/email";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function invalidResponse() {
  return Response.json(
    { error: "This password reset link is not valid.", code: "invalid_token" },
    { status: 400, headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "reset-password"), 10, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.token;
    const newPassword = String(body?.newPassword || "");

    if (!isAccountToken(token)) return invalidResponse();
    if (newPassword.length < 10 || newPassword.length > 256) {
      return Response.json(
        { error: "Password must be between 10 and 256 characters.", code: "password_policy" },
        { status: 400, headers: NO_STORE },
      );
    }

    const tokenHash = await hashAccountToken("password_reset", token);
    const tokenRl = rateLimit(`reset-password-token:${hashKey(tokenHash)}`, 10, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    // Hash before consuming so an invalid token does not get an obviously
    // cheaper path than a real reset.
    const newPasswordHash = await hashPassword(newPassword);
    const completion = await consumePasswordResetToken(token, newPasswordHash);
    if (completion.kind !== "reset") return invalidResponse();

    const response = NextResponse.json({ ok: true, status: "password_reset" }, { headers: NO_STORE });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });

    await sendAccountSecurityNoticeEmail({
      to: completion.user.email,
      name: completion.user.name,
      subject: "Your YaarLink password was reset",
      heading: "Password reset complete",
      message: "Your YaarLink password was reset and all devices were signed out. If this was not you, reset your password again immediately and contact YaarLink.",
      actionLabel: "Log in",
      actionUrl: buildLoginUrl(req),
    }).catch(() => console.error("Password reset security notice failed", { userId: completion.user.id }));

    return response;
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not reset password.", code: "request_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
