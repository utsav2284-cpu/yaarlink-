import { hashPassword } from "@/backend/auth";
import { emailDeliveryProblem, sendSignupVerificationEmail } from "@/backend/email";
import {
  buildSignupVerificationUrl,
  claimPendingSignup,
  isPendingSignupUniqueViolation,
  markPendingSignupEmailSent,
} from "@/backend/email-verification";
import { PasswordBreachCheckUnavailableError, validateNewPassword } from "@/backend/password-policy";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import {
  hasField,
  parseEmailField,
  parsePhoneField,
  parseRequiredText,
  readJsonObject,
} from "@/backend/validation";
import { safeReturnTo } from "@/shared/return-to";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

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
  const rl = await rateLimit(getClientKey(req, "signup"), 5, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

    const parsedName = parseRequiredText(body.name, {
      field: "name",
      maxLength: 100,
      requiredCode: "invalid_request",
      requiredMessage: "Name, email and password required",
    });
    if (!parsedName.ok) {
      return Response.json(
        { error: parsedName.error, code: parsedName.code, field: parsedName.field },
        { status: 400, headers: NO_STORE },
      );
    }

    const parsedEmail = parseEmailField(body.email, { field: "email", required: true });
    if (!parsedEmail.ok || !parsedEmail.value) {
      return Response.json({ error: "Please enter a valid email.", code: "invalid_email", field: "email" }, { status: 400, headers: NO_STORE });
    }

    const parsedPhone = parsePhoneField(body.phone, { field: "phone" });
    if (!parsedPhone.ok) {
      return Response.json(
        { error: parsedPhone.error, code: parsedPhone.code, field: parsedPhone.field },
        { status: 400, headers: NO_STORE },
      );
    }

    const password = body.password;
    if (typeof password !== "string" || !password) {
      return Response.json({ error: "Name, email and password required", code: "invalid_request", field: "password" }, { status: 400, headers: NO_STORE });
    }

    let role: "brand" | "creator" = "brand";
    if (hasField(body, "role") && body.role != null) {
      const requestedRole = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";
      if (requestedRole !== "brand" && requestedRole !== "creator") {
        return Response.json({ error: "Please choose a valid account type.", code: "invalid_request", field: "role" }, { status: 400, headers: NO_STORE });
      }
      role = requestedRole;
    }

    const name = parsedName.value;
    const email = parsedEmail.value;
    const cleanPhone = parsedPhone.value;
    const returnTo = hasField(body, "returnTo") ? safeReturnTo(body.returnTo, "") : "";

    if (body.legalConsent !== true) {
      return Response.json(
        { error: "Please agree to the Terms of Service and Privacy Policy.", code: "legal_consent_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    let passwordValidation;
    try {
      passwordValidation = await validateNewPassword(password, {
        email,
        name,
        phone: cleanPhone,
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
      return Response.json(
        passwordValidation.problem === "breached"
          ? {
              error: "That password has appeared in a known data breach. Choose a different one.",
              code: "password_breached",
            }
          : { error: "Password must be between 10 and 256 characters.", code: "password_policy" },
        { status: 400, headers: NO_STORE },
      );
    }

    const emailRl = await rateLimit(`signup-email:${await hashKey(email)}`, 5, 60 * 60_000);
    if (!emailRl.ok) return limitedResponse(emailRl.retryAfter);

    if (emailDeliveryProblem()) {
      return Response.json(
        { error: "Email verification is temporarily unavailable.", code: "service_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }

    const cleanName = name;

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
          verificationUrl: buildSignupVerificationUrl(req, claim.token, returnTo),
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
