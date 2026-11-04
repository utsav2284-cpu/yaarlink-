import {
  adminIdentityUnavailableResponse,
  getAdminAccountSession,
  isAdminIdentityUnavailableError,
  listAdminSessions,
  logAdminIdentityUnavailable,
  revokeOtherOwnAdminSessions,
  revokeOwnAdminSession,
} from "@/backend/admin-identity";
import { logRouteError } from "@/backend/observability";
import { sameOriginMutationAllowed } from "@/backend/same-origin";
import { parseUuid, readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function unauthorizedResponse() {
  return Response.json({ error: "Please sign in as an administrator.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
}

function mfaRequiredResponse() {
  return Response.json({ error: "Complete MFA verification before managing sessions.", code: "mfa_required" }, { status: 403, headers: NO_STORE });
}

export async function GET(req: Request) {
  try {
    const context = await getAdminAccountSession();
    if (!context) return unauthorizedResponse();
    if (!context.mfaSatisfied) return mfaRequiredResponse();
    return Response.json({ sessions: await listAdminSessions(context) }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "sessions_list" });
    return Response.json({ error: "Could not load sessions.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  if (!sameOriginMutationAllowed(req)) {
    return Response.json({ error: "Cross-site request rejected", code: "cross_site_rejected" }, { status: 403, headers: NO_STORE });
  }
  try {
    const context = await getAdminAccountSession();
    if (!context) return unauthorizedResponse();
    if (!context.mfaSatisfied) return mfaRequiredResponse();

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const action = parsedBody.body.action;

    if (action === "revoke_others") {
      const revokedCount = await revokeOtherOwnAdminSessions({ context, req });
      return Response.json({ ok: true, revokedCount, sessions: await listAdminSessions(context) }, { headers: NO_STORE });
    }

    if (action !== "revoke") {
      return Response.json({ error: "Invalid session action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    const sessionId = parseUuid(parsedBody.body.sessionId);
    if (!sessionId) {
      return Response.json({ error: "Session not found", code: "invalid_session" }, { status: 400, headers: NO_STORE });
    }
    const result = await revokeOwnAdminSession({ context, sessionId, req });
    if (result === "current_session") {
      return Response.json({ error: "Use sign out for the current session.", code: "current_session" }, { status: 400, headers: NO_STORE });
    }
    if (result !== "revoked") {
      return Response.json({ error: "Session not found", code: "session_not_found" }, { status: 404, headers: NO_STORE });
    }
    return Response.json({ ok: true, sessions: await listAdminSessions(context) }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "sessions_revoke" });
    return Response.json({ error: "Could not update sessions.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
