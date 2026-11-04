import {
  adminIdentityUnavailableResponse,
  buildAdminIdentityUrl,
  claimAdminPasswordResetByEmail,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
  markAdminAuthTokenEmailSent,
  recordAdminSecurityEvent,
} from "@/backend/admin-identity";
import { emailDeliveryProblem, sendAdminPasswordResetEmail } from "@/backend/email";
import { logRouteError } from "@/backend/observability";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { normalizeEmail, readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function acceptedResponse() {
  // Existing, missing, inactive, cooled-down, and send-limited administrator
  // accounts intentionally receive the same response.
  return Response.json({ ok: true, status: "reset_email_requested" }, { status: 202, headers: NO_STORE });
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "admin-forgot-password"), 5, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const email = normalizeEmail(parsedBody.body.email) ?? "";
    if (!email) {
      return Response.json({ error: "Please enter a valid email.", code: "invalid_email" }, { status: 400, headers: NO_STORE });
    }

    const emailRl = await rateLimit(`admin-forgot-password-email:${await hashKey(email)}`, 5, 60 * 60_000);
    if (!emailRl.ok) return limitedResponse(emailRl.retryAfter);

    if (emailDeliveryProblem()) {
      return Response.json(
        { error: "Administrator password reset email is temporarily unavailable.", code: "email_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }

    const claim = await claimAdminPasswordResetByEmail(email);
    if (claim.kind === "send") {
      try {
        await sendAdminPasswordResetEmail({
          to: claim.admin.email,
          name: claim.admin.name ?? "YaarLink administrator",
          resetUrl: buildAdminIdentityUrl(req, "password_reset", claim.token),
        });
        await markAdminAuthTokenEmailSent(claim.tokenId, claim.tokenHash);
        await recordAdminSecurityEvent({
          adminUserId: claim.admin.id,
          actorAdminId: claim.admin.id,
          eventType: "admin.password_reset_requested",
          req,
          metadata: { delivery: "sent" },
        });
      } catch (error) {
        logRouteError(req, error, {
          component: "email",
          operation: "send_admin_password_reset",
          claimId: claim.tokenId,
        });
        await recordAdminSecurityEvent({
          adminUserId: claim.admin.id,
          actorAdminId: claim.admin.id,
          eventType: "admin.password_reset_requested",
          outcome: "failure",
          req,
          metadata: { delivery: "failed" },
        });
      }
    }

    return acceptedResponse();
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "password_forgot" });
    return Response.json({ error: "Could not request a password reset.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
