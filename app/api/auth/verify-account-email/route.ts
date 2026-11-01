import { consumeEmailVerificationToken, hashAccountToken, isAccountToken } from "@/backend/account-tokens";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "verify-account-email"), 10, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const token = parsedBody.body.token;
    if (!isAccountToken(token)) {
      return Response.json({ error: "This verification link is not valid.", code: "invalid_token" }, { status: 400, headers: NO_STORE });
    }

    const tokenHash = await hashAccountToken("email_verification", token);
    const tokenRl = await rateLimit(`verify-account-email-token:${await hashKey(tokenHash)}`, 10, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    const completion = await consumeEmailVerificationToken(token);
    if (completion.kind !== "verified") {
      return Response.json({ error: "This verification link is not valid.", code: "invalid_token" }, { status: 400, headers: NO_STORE });
    }

    return Response.json({ ok: true, status: "email_verified" }, { headers: NO_STORE });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not verify email.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
