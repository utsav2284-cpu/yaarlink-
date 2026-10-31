import {
  changeUserPasswordKeepingSession,
  changeUserPhone,
  deleteUserAccount,
  getPendingEmailChange,
  listActiveUserSessions,
  verifyUserPassword,
} from "@/backend/account";
import {
  buildAccountActionUrl,
  buildAccountSettingsUrl,
  buildLoginUrl,
  claimAccountToken,
  invalidateAccountToken,
  markAccountTokenEmailSent,
} from "@/backend/account-tokens";
import {
  clearSessionCookie,
  getSessionContext,
  isSessionId,
  revokeOtherUserSessions,
  revokeUserSession,
  sessionSecretProblem,
  setExistingSessionCookie,
} from "@/backend/auth";
import {
  emailDeliveryProblem,
  sendAccountSecurityNoticeEmail,
  sendEmailChangeVerificationEmail,
  sendExistingAccountEmailVerificationEmail,
} from "@/backend/email";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9][0-9 ()-]{6,19}$/;

function jsonError(status: number, error: string, code: string) {
  return Response.json({ error, code }, { status, headers: NO_STORE });
}

function cleanEmail(value: unknown) {
  return String(value || "").toLowerCase().trim();
}

function cleanPhone(value: unknown): { ok: true; phone: string | null } | { ok: false } {
  const phone = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!phone) return { ok: true, phone: null };
  if (phone.length > 20 || !PHONE_PATTERN.test(phone)) return { ok: false };
  return { ok: true, phone };
}

async function accountPayload(userId: string, sessionId: string, user: unknown) {
  const [sessions, pendingEmailChange] = await Promise.all([
    listActiveUserSessions(userId, sessionId),
    getPendingEmailChange(userId),
  ]);
  return { user, sessions, pendingEmailChange };
}

export async function GET() {
  try {
    const context = await getSessionContext();
    if (!context) return jsonError(401, "Please log in", "unauthorized");
    return Response.json(await accountPayload(context.user.id, context.sessionId, context.user), { headers: NO_STORE });
  } catch (error) {
    console.error(error);
    return jsonError(500, "Could not load account settings.", "request_failed");
  }
}

export async function PATCH(req: Request) {
  try {
    const context = await getSessionContext();
    if (!context) return jsonError(401, "Please log in", "unauthorized");

    const rl = await rateLimit(`${getClientKey(req, "account")}:${await hashKey(context.user.id)}`, 30, 15 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(body?.action || "");
    const sensitive = ["request_email_change", "change_phone", "change_password"].includes(action);
    if (sensitive) {
      const sensitiveRl = await rateLimit(`account-sensitive:${await hashKey(context.user.id)}`, 10, 15 * 60_000);
      if (!sensitiveRl.ok) return limitedResponse(sensitiveRl.retryAfter);
    }

    if (action === "request_email_verification") {
      if (context.user.emailVerifiedAt) {
        return Response.json({ ok: true, status: "already_verified" }, { headers: NO_STORE });
      }
      if (emailDeliveryProblem()) return jsonError(503, "Email verification is temporarily unavailable.", "email_unavailable");

      const claim = await claimAccountToken({ userId: context.user.id, purpose: "email_verification" });
      if (claim.kind !== "send") {
        return Response.json({ ok: true, status: "already_sent" }, { status: 202, headers: NO_STORE });
      }
      try {
        await sendExistingAccountEmailVerificationEmail({
          to: claim.recipientEmail,
          name: claim.user.name,
          verificationUrl: buildAccountActionUrl(req, "email_verification", claim.token),
        });
        await markAccountTokenEmailSent(claim.tokenId, claim.tokenHash);
      } catch {
        console.error("Account email verification email failed", { tokenId: claim.tokenId });
        return jsonError(503, "Email verification is temporarily unavailable.", "email_unavailable");
      }
      return Response.json({ ok: true, status: "verification_sent" }, { status: 202, headers: NO_STORE });
    }

    if (action === "cancel_email_change") {
      await invalidateAccountToken(context.user.id, "email_change");
      return Response.json({ ok: true, status: "email_change_cancelled" }, { headers: NO_STORE });
    }

    if (action === "request_email_change") {
      const newEmail = cleanEmail(body?.newEmail);
      const currentPassword = String(body?.currentPassword || "");
      if (!newEmail || newEmail.length > 160 || !EMAIL_PATTERN.test(newEmail)) {
        return jsonError(400, "Please enter a valid email.", "invalid_email");
      }
      if (!currentPassword || currentPassword.length > 256) {
        return jsonError(400, "Current password is required.", "current_password_required");
      }
      if (newEmail === context.user.email) return jsonError(400, "Enter a different email address.", "email_unchanged");
      if (!(await verifyUserPassword(context.user.id, currentPassword))) {
        return jsonError(400, "Current password is incorrect.", "wrong_password");
      }
      if (emailDeliveryProblem()) return jsonError(503, "Email verification is temporarily unavailable.", "email_unavailable");

      const claim = await claimAccountToken({ userId: context.user.id, purpose: "email_change", targetEmail: newEmail });
      if (claim.kind === "email_unavailable") return jsonError(409, "That email cannot be used.", "email_unavailable");
      if (claim.kind !== "send") {
        return Response.json(
          { ok: true, status: "already_sent", pendingEmailChange: await getPendingEmailChange(context.user.id) },
          { status: 202, headers: NO_STORE },
        );
      }

      try {
        await sendEmailChangeVerificationEmail({
          to: claim.recipientEmail,
          name: claim.user.name,
          verificationUrl: buildAccountActionUrl(req, "email_change", claim.token),
        });
        await markAccountTokenEmailSent(claim.tokenId, claim.tokenHash);
      } catch {
        console.error("Email change verification email failed", { tokenId: claim.tokenId });
        return jsonError(503, "Email verification is temporarily unavailable.", "email_unavailable");
      }

      await sendAccountSecurityNoticeEmail({
        to: context.user.email,
        name: context.user.name,
        subject: "Email change requested for your YaarLink account",
        heading: "Email change requested",
        message: `A request was made to change your YaarLink account email to ${newEmail}. It will not change until that address confirms the one-time link. If this was not you, change your password immediately.`,
        actionLabel: "Open account settings",
        actionUrl: buildAccountSettingsUrl(req),
      }).catch(() => console.error("Email change request notice failed", { userId: context.user.id }));

      return Response.json(
        { ok: true, status: "email_change_sent", pendingEmailChange: { email: newEmail, expiresAt: claim.expiresAt } },
        { status: 202, headers: NO_STORE },
      );
    }

    if (action === "change_phone") {
      const currentPassword = String(body?.currentPassword || "");
      const cleaned = cleanPhone(body?.phone);
      if (!cleaned.ok) return jsonError(400, "Please enter a valid phone number.", "invalid_phone");
      if (!currentPassword || currentPassword.length > 256) {
        return jsonError(400, "Current password is required.", "current_password_required");
      }
      const result = await changeUserPhone({ userId: context.user.id, currentPassword, phone: cleaned.phone });
      if (result.kind === "wrong_password") return jsonError(400, "Current password is incorrect.", "wrong_password");
      if (result.kind !== "changed") return jsonError(401, "Please log in again", "unauthorized");
      return Response.json({ ok: true, status: "phone_changed", phone: result.phone }, { headers: NO_STORE });
    }

    if (action === "change_password") {
      const currentPassword = String(body?.currentPassword || "");
      const newPassword = String(body?.newPassword || "");
      if (!currentPassword || currentPassword.length > 256) {
        return jsonError(400, "Current password is required.", "current_password_required");
      }
      if (newPassword.length < 10 || newPassword.length > 256) {
        return jsonError(400, "Password must be between 10 and 256 characters.", "password_policy");
      }
      if (sessionSecretProblem()) return jsonError(503, "Password change is temporarily unavailable.", "request_failed");

      const result = await changeUserPasswordKeepingSession({
        userId: context.user.id,
        sessionId: context.sessionId,
        currentPassword,
        newPassword,
      });
      if (result.kind === "wrong_password") return jsonError(400, "Current password is incorrect.", "wrong_password");
      if (result.kind === "same_password") return jsonError(400, "Choose a different password.", "same_password");
      if (result.kind !== "changed") return jsonError(401, "Please log in again", "unauthorized");

      await setExistingSessionCookie(context.user.id, result.tokenVersion, context.sessionId);
      await sendAccountSecurityNoticeEmail({
        to: result.user.email,
        name: result.user.name,
        subject: "Your YaarLink password was changed",
        heading: "Password changed",
        message: "Your YaarLink password was changed and your other devices were signed out. If this was not you, reset your password immediately.",
        actionLabel: "Open account settings",
        actionUrl: buildAccountSettingsUrl(req),
      }).catch(() => console.error("Password change security notice failed", { userId: context.user.id }));

      return Response.json({ ok: true, status: "password_changed" }, { headers: NO_STORE });
    }

    if (action === "revoke_session") {
      const sessionId = body?.sessionId;
      if (!isSessionId(sessionId)) return jsonError(400, "Invalid session.", "invalid_session");
      if (sessionId === context.sessionId) return jsonError(400, "Use logout for this device.", "current_session");
      const revoked = await revokeUserSession(context.user.id, sessionId);
      if (!revoked) return jsonError(404, "Session not found.", "session_not_found");
      return Response.json({ ok: true, status: "session_revoked" }, { headers: NO_STORE });
    }

    if (action === "revoke_other_sessions") {
      const revokedCount = await revokeOtherUserSessions(context.user.id, context.sessionId);
      return Response.json({ ok: true, status: "other_sessions_revoked", revokedCount }, { headers: NO_STORE });
    }

    return jsonError(400, "Unsupported account action.", "invalid_request");
  } catch (error) {
    console.error(error);
    return jsonError(500, "Could not update account settings.", "request_failed");
  }
}

export async function DELETE(req: Request) {
  try {
    const context = await getSessionContext();
    if (!context) return jsonError(401, "Please log in", "unauthorized");

    const rl = await rateLimit(`account-delete:${await hashKey(context.user.id)}`, 5, 15 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const currentPassword = String(body?.currentPassword || "");
    const confirmationEmail = cleanEmail(body?.confirmationEmail);
    if (!currentPassword || currentPassword.length > 256) {
      return jsonError(400, "Current password is required.", "current_password_required");
    }

    const result = await deleteUserAccount({ userId: context.user.id, currentPassword, confirmationEmail });
    if (result.kind === "wrong_password") return jsonError(400, "Current password is incorrect.", "wrong_password");
    if (result.kind === "confirmation_mismatch") {
      return jsonError(400, "Type your account email exactly to confirm deletion.", "confirmation_mismatch");
    }
    if (result.kind !== "deleted") return jsonError(401, "Please log in again", "unauthorized");

    await clearSessionCookie();
    await sendAccountSecurityNoticeEmail({
      to: result.user.email,
      name: result.user.name,
      subject: "Your YaarLink account was deleted",
      heading: "Account deleted",
      message: "Your YaarLink account and its linked profile, campaigns, applications, notifications and sessions were deleted. If this was not you, contact YaarLink immediately.",
      actionLabel: "Visit YaarLink",
      actionUrl: buildLoginUrl(req),
    }).catch(() => console.error("Account deletion notice failed", { userId: result.user.id }));

    return Response.json({ ok: true, status: "account_deleted" }, { headers: NO_STORE });
  } catch (error) {
    console.error(error);
    return jsonError(500, "Could not delete account.", "request_failed");
  }
}
