import {
  adminIdentityUnavailableResponse,
  buildAdminIdentityUrl,
  buildAdminSecurityUrl,
  createAdminInvitation,
  getAdminAccountSession,
  hasRecentAdminStepUp,
  isAdminIdentityUnavailableError,
  listAdminAccounts,
  logAdminIdentityUnavailable,
  markAdminAuthTokenEmailSent,
  requireAdminPermission,
  resendAdminInvitation,
  revokeAdminInvitation,
  revokeAdminSessionsForAccount,
  updateAdminAccount,
  type AdminInvitationResult,
} from "@/backend/admin-identity";
import { emailDeliveryProblem, sendAdminInvitationEmail, sendAdminOwnerSetupEmail, sendAdminSecurityNoticeEmail } from "@/backend/email";
import { logRouteError } from "@/backend/observability";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { normalizeEmail, parseUuid, readJsonObject } from "@/backend/validation";
import { hasAdminPermission, isAdminRole, type AdminPermission, type AdminRole } from "@/shared/admin-rbac";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function unauthorizedResponse() {
  return Response.json({ error: "Please sign in as an administrator.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
}

function forbiddenResponse() {
  return Response.json({ error: "You do not have permission to do this.", code: "forbidden" }, { status: 403, headers: NO_STORE });
}

function mfaRequiredResponse() {
  return Response.json({ error: "Complete MFA verification first.", code: "mfa_required" }, { status: 403, headers: NO_STORE });
}

function stepUpRequiredResponse() {
  return Response.json(
    { error: "Verify MFA again before making administrator account changes.", code: "mfa_step_up_required" },
    { status: 403, headers: NO_STORE },
  );
}

function crossSiteResponse() {
  return Response.json({ error: "Cross-site request rejected", code: "cross_site_rejected" }, { status: 403, headers: NO_STORE });
}

function roleLabel(role: AdminRole): string {
  return role.replaceAll("_", " ");
}

async function deliverInvitation(req: Request, result: Extract<AdminInvitationResult, { kind: "send" }>): Promise<void> {
  const url = buildAdminIdentityUrl(req, result.claim.purpose, result.claim.token);
  if (result.claim.purpose === "owner_setup") {
    await sendAdminOwnerSetupEmail({ to: result.admin.email, setupUrl: url });
  } else {
    await sendAdminInvitationEmail({
      to: result.admin.email,
      invitationUrl: url,
      roleLabel: roleLabel(result.admin.role),
    });
  }
  await markAdminAuthTokenEmailSent(result.claim.tokenId, result.claim.tokenHash);
}

async function invitationResponse(req: Request, result: AdminInvitationResult): Promise<Response> {
  if (result.kind === "forbidden") return forbiddenResponse();
  if (result.kind === "conflict") {
    return Response.json(
      { error: "An administrator account already exists for this email.", code: "admin_account_exists" },
      { status: 409, headers: NO_STORE },
    );
  }
  if (result.kind === "cooldown") {
    return Response.json(
      { error: "Please wait before sending another invitation to this email.", code: "rate_limited", admin: result.admin },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } },
    );
  }

  try {
    await deliverInvitation(req, result);
  } catch (error) {
    logRouteError(req, error, {
      component: "email",
      operation: "send_admin_invitation",
      adminId: result.admin.id,
      claimId: result.claim.tokenId,
    });
    return Response.json(
      {
        error: "The invitation was created, but the email could not be delivered. Check email configuration, then resend it.",
        code: "email_delivery_failed",
        admin: result.admin,
        accounts: await listAdminAccounts(),
      },
      { status: 502, headers: NO_STORE },
    );
  }

  return Response.json(
    { ok: true, admin: result.admin, accounts: await listAdminAccounts(), emailDelivered: true },
    { status: 201, headers: NO_STORE },
  );
}

export async function GET(req: Request) {
  try {
    const context = await getAdminAccountSession();
    if (!context) return unauthorizedResponse();
    if (!context.mfaSatisfied) return mfaRequiredResponse();
    if (!hasAdminPermission(context.admin.role, "admin_users.view")) return forbiddenResponse();
    return Response.json({ accounts: await listAdminAccounts() }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "accounts_list" });
    return Response.json({ error: "Could not load administrator accounts.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  if (!sameOriginMutationAllowed(req)) return crossSiteResponse();
  try {
    const context = await requireAdminPermission("admin_users.invite", req);
    if (!context) {
      const signedIn = await getAdminAccountSession();
      return signedIn ? forbiddenResponse() : unauthorizedResponse();
    }
    if (!hasRecentAdminStepUp(context)) return stepUpRequiredResponse();

    const rl = await rateLimit(`${getClientKey(req, "admin-invite")}:${context.admin.id}`, 20, 60 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    if (emailDeliveryProblem()) {
      return Response.json(
        { error: "Administrator invitation email is not configured.", code: "email_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const email = normalizeEmail(parsedBody.body.email) ?? "";
    const role = parsedBody.body.role;
    if (!email) return Response.json({ error: "Please enter a valid email.", code: "invalid_email" }, { status: 400, headers: NO_STORE });
    if (!isAdminRole(role)) return Response.json({ error: "Please choose a valid administrator role.", code: "invalid_admin_role" }, { status: 400, headers: NO_STORE });

    return invitationResponse(req, await createAdminInvitation({ actor: context, email, role, req }));
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "accounts_invite" });
    return Response.json({ error: "Could not create administrator invitation.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

function requiredPermissionForPatch(action: unknown): AdminPermission | null {
  switch (action) {
    case "update_role":
      return "admin_users.manage_roles";
    case "update_status":
      return "admin_users.suspend";
    case "resend_invitation":
    case "revoke_invitation":
      return "admin_users.invite";
    case "revoke_sessions":
      return "admin_users.sessions.manage";
    default:
      return null;
  }
}

export async function PATCH(req: Request) {
  if (!sameOriginMutationAllowed(req)) return crossSiteResponse();
  try {
    const context = await getAdminAccountSession();
    if (!context) return unauthorizedResponse();
    if (!context.mfaSatisfied) return mfaRequiredResponse();

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const action = parsedBody.body.action;
    const permission = requiredPermissionForPatch(action);
    if (!permission) {
      return Response.json({ error: "Invalid administrator account action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }
    if (!hasAdminPermission(context.admin.role, permission)) return forbiddenResponse();
    if (
      (action === "update_role" || action === "update_status" || action === "revoke_sessions") &&
      !hasRecentAdminStepUp(context)
    ) {
      return stepUpRequiredResponse();
    }

    const targetAdminId = parseUuid(parsedBody.body.adminId);
    if (!targetAdminId) {
      return Response.json({ error: "Administrator account not found", code: "admin_account_not_found" }, { status: 400, headers: NO_STORE });
    }

    if (action === "resend_invitation") {
      if (emailDeliveryProblem()) {
        return Response.json(
          { error: "Administrator invitation email is not configured.", code: "email_unavailable" },
          { status: 503, headers: NO_STORE },
        );
      }
      return invitationResponse(req, await resendAdminInvitation({ actor: context, adminUserId: targetAdminId, req }));
    }

    if (action === "revoke_invitation") {
      const revoked = await revokeAdminInvitation({ actor: context, adminUserId: targetAdminId, req });
      if (!revoked) {
        return Response.json({ error: "Pending invitation not found", code: "admin_account_not_found" }, { status: 404, headers: NO_STORE });
      }
      return Response.json({ ok: true, accounts: await listAdminAccounts() }, { headers: NO_STORE });
    }

    if (action === "revoke_sessions") {
      const revoked = await revokeAdminSessionsForAccount({ actor: context, targetAdminId, req });
      if (!revoked) return forbiddenResponse();
      return Response.json({ ok: true, accounts: await listAdminAccounts() }, { headers: NO_STORE });
    }

    const role = action === "update_role" ? parsedBody.body.role : undefined;
    const status = action === "update_status" ? parsedBody.body.status : undefined;
    if (action === "update_role" && !isAdminRole(role)) {
      return Response.json({ error: "Please choose a valid administrator role.", code: "invalid_admin_role" }, { status: 400, headers: NO_STORE });
    }
    if (action === "update_status" && status !== "active" && status !== "suspended" && status !== "revoked") {
      return Response.json({ error: "Please choose a valid administrator status.", code: "invalid_admin_status" }, { status: 400, headers: NO_STORE });
    }

    const result = await updateAdminAccount({
      actor: context,
      targetAdminId,
      role: action === "update_role" ? (role as AdminRole) : undefined,
      status: action === "update_status" ? (status as "active" | "suspended" | "revoked") : undefined,
      req,
    });

    if (result.kind === "forbidden" || result.kind === "self_change_forbidden") {
      return Response.json(
        {
          error:
            result.kind === "self_change_forbidden"
              ? "You cannot change your own role or account status."
              : "You do not have permission to do this.",
          code: result.kind,
        },
        { status: 403, headers: NO_STORE },
      );
    }
    if (result.kind === "not_found") {
      return Response.json({ error: "Administrator account not found", code: "admin_account_not_found" }, { status: 404, headers: NO_STORE });
    }
    if (result.kind === "last_super_admin") {
      return Response.json(
        { error: "The last active Super Admin cannot be demoted, suspended, or revoked.", code: "last_super_admin" },
        { status: 409, headers: NO_STORE },
      );
    }
    if (result.kind === "invalid_transition") {
      return Response.json({ error: "That account change is not allowed.", code: "invalid_admin_transition" }, { status: 409, headers: NO_STORE });
    }

    await sendAdminSecurityNoticeEmail({
      to: result.admin.email,
      name: result.admin.name ?? "YaarLink administrator",
      subject: "Your YaarLink administrator access changed",
      heading: "Administrator access changed",
      message: `Your YaarLink administrator account is now ${roleLabel(result.admin.role)} with status ${result.admin.status}. If you did not expect this change, contact the owner immediately.`,
      actionUrl: buildAdminSecurityUrl(req),
    }).catch((error) =>
      logRouteError(req, error, {
        component: "email",
        operation: "send_admin_access_change_notice",
        adminId: result.admin.id,
      }),
    );

    return Response.json({ ok: true, admin: result.admin, accounts: await listAdminAccounts() }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "accounts_update" });
    return Response.json({ error: "Could not update administrator account.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
