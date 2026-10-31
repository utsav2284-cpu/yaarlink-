import { NextResponse } from "next/server";
import { buildLoginUrl, consumeEmailChangeToken, hashAccountToken, isAccountToken } from "@/backend/account-tokens";
import { SESSION_COOKIE } from "@/backend/auth";
import { sendAccountSecurityNoticeEmail } from "@/backend/email";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "confirm-email-change"), 10, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const token = body?.token;
    if (!isAccountToken(token)) {
      return Response.json({ error: "This email change link is not valid.", code: "invalid_token" }, { status: 400, headers: NO_STORE });
    }

    const tokenHash = await hashAccountToken("email_change", token);
    const tokenRl = rateLimit(`confirm-email-change-token:${hashKey(tokenHash)}`, 10, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    const completion = await consumeEmailChangeToken(token);
    if (completion.kind === "email_unavailable") {
      return Response.json({ error: "That email can no longer be used.", code: "email_unavailable" }, { status: 409, headers: NO_STORE });
    }
    if (completion.kind !== "changed") {
      return Response.json({ error: "This email change link is not valid.", code: "invalid_token" }, { status: 400, headers: NO_STORE });
    }

    const response = NextResponse.json({ ok: true, status: "email_changed" }, { headers: NO_STORE });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });

    const loginUrl = buildLoginUrl(req);
    await Promise.allSettled([
      sendAccountSecurityNoticeEmail({
        to: completion.oldEmail,
        name: completion.user.name,
        subject: "Your YaarLink account email was changed",
        heading: "Account email changed",
        message: `The login and recovery email for your YaarLink account was changed to ${completion.newEmail}, and all devices were signed out. If this was not you, contact YaarLink immediately.`,
        actionLabel: "Log in",
        actionUrl: loginUrl,
      }),
      sendAccountSecurityNoticeEmail({
        to: completion.newEmail,
        name: completion.user.name,
        subject: "Your new YaarLink email is confirmed",
        heading: "New email confirmed",
        message: "This address is now the login and recovery email for your YaarLink account.",
        actionLabel: "Log in",
        actionUrl: loginUrl,
      }),
    ]);

    return response;
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not confirm the email change.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
