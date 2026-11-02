import { buildAccountActionUrl, claimPasswordResetByEmail, markAccountTokenEmailSent } from "@/backend/account-tokens";
import { emailDeliveryProblem, sendPasswordResetEmail } from "@/backend/email";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { hasField, normalizeEmail, readJsonObject } from "@/backend/validation";
import { safeReturnTo } from "@/shared/return-to";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function acceptedResponse() {
  // Existing, missing, cooled-down and send-limited accounts intentionally
  // receive the same response so this endpoint cannot enumerate users.
  return Response.json({ ok: true, status: "reset_email_requested" }, { status: 202, headers: NO_STORE });
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "forgot-password"), 5, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const email = normalizeEmail(parsedBody.body.email) ?? "";
    const returnTo = hasField(parsedBody.body, "returnTo") ? safeReturnTo(parsedBody.body.returnTo, "") : "";
    if (!email) {
      return Response.json(
        { error: "Please enter a valid email.", code: "invalid_email" },
        { status: 400, headers: NO_STORE },
      );
    }

    const emailRl = await rateLimit(`forgot-password-email:${await hashKey(email)}`, 5, 60 * 60_000);
    if (!emailRl.ok) return limitedResponse(emailRl.retryAfter);

    if (emailDeliveryProblem()) {
      return Response.json(
        { error: "Password reset email is temporarily unavailable.", code: "email_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }

    const claim = await claimPasswordResetByEmail(email);
    if (claim.kind === "send") {
      try {
        await sendPasswordResetEmail({
          to: claim.recipientEmail,
          name: claim.user.name,
          resetUrl: buildAccountActionUrl(req, "password_reset", claim.token, { returnTo }),
        });
        await markAccountTokenEmailSent(claim.tokenId, claim.tokenHash);
      } catch {
        console.error("Password reset email failed", { tokenId: claim.tokenId });
      }
    }

    return acceptedResponse();
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not request a password reset.", code: "request_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
