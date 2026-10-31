import { hashPassword } from "@/backend/auth";
import { emailDeliveryProblem, sendSignupVerificationEmail } from "@/backend/email";
import {
  buildSignupVerificationUrl,
  claimPendingSignup,
  isPendingSignupUniqueViolation,
  markPendingSignupEmailSent,
} from "@/backend/email-verification";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function verificationRequiredResponse() {
  // New, pending, throttled, and already-registered addresses intentionally
  // receive the same status/body and no session cookie. The account is not
  // created here; that happens only in the verify-email endpoint.
  return Response.json(
    { ok: true, status: "verification_required" },
    { status: 202, headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "signup"), 5, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return Response.json({ error: "Name, email and password required", code: "invalid_request" }, { status: 400, headers: NO_STORE });
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");

    if (!name || !email || !password) {
      return Response.json({ error: "Name, email and password required", code: "invalid_request" }, { status: 400, headers: NO_STORE });
    }
    if (body.legalConsent !== true) {
      return Response.json(
        { error: "Please agree to the Terms of Service and Privacy Policy.", code: "legal_consent_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Please enter a valid email.", code: "invalid_email" }, { status: 400, headers: NO_STORE });
    }
    if (password.length < 10 || password.length > 256) {
      return Response.json(
        { error: "Password must be between 10 and 256 characters.", code: "password_policy" },
        { status: 400, headers: NO_STORE },
      );
    }

    const emailRl = rateLimit(`signup-email:${hashKey(email)}`, 5, 60 * 60_000);
    if (!emailRl.ok) return limitedResponse(emailRl.retryAfter);

    if (emailDeliveryProblem()) {
      return Response.json(
        { error: "Email verification is temporarily unavailable.", code: "service_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }

    const cleanName = name.slice(0, 100);
    const cleanPhone = body.phone ? String(body.phone).trim().slice(0, 20) || null : null;
    const role = body.role === "creator" ? "creator" : "brand";

    // Hash before the account/pending branch so a known address does not get
    // an obviously cheaper code path than a new one.
    const passwordHash = await hashPassword(password);
    const claim = await claimPendingSignup({
      name: cleanName,
      email,
      phone: cleanPhone,
      role,
      passwordHash,
    });

    if (claim.kind === "send") {
      try {
        await sendSignupVerificationEmail({
          to: email,
          name: cleanName,
          verificationUrl: buildSignupVerificationUrl(req, claim.token),
        });
        await markPendingSignupEmailSent(claim.pendingId, claim.tokenHash);
      } catch {
        // Do not expose provider failures only for unregistered addresses;
        // that would become an enumeration signal. The pending claim's
        // cooldown still lets the legitimate user retry shortly afterwards.
        console.error("Signup verification email failed", { pendingId: claim.pendingId });
      }
    }

    return verificationRequiredResponse();
  } catch (error) {
    // Parallel requests are serialized by an advisory lock, but preserve the
    // generic response if a unique index still resolves a race.
    if (isPendingSignupUniqueViolation(error)) return verificationRequiredResponse();
    console.error(error);
    return Response.json({ error: "Could not sign up", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
