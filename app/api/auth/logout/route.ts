import { logRouteError } from "@/backend/observability";
import {
  clearSessionCookie,
  getSessionContext,
  isSessionUnavailableError,
  logSessionUnavailable,
  revokeUserSession,
  SessionUnavailableError,
  sessionUnavailableResponse,
  type SessionContext,
} from "@/backend/auth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  // Logout now revokes only this device. Account settings provides a
  // separate "sign out other devices" action, so using a second browser no
  // longer unexpectedly signs the owner out everywhere.
  let context: SessionContext | null = null;
  let failure: unknown = null;

  try {
    context = await getSessionContext();
  } catch (error) {
    failure = error;
  }

  if (context) {
    try {
      await revokeUserSession(context.user.id, context.sessionId);
    } catch (error) {
      failure ??= new SessionUnavailableError(error);
    }
  }

  // Always remove this browser's cookie, even when the database is degraded.
  // The response status below still distinguishes "cookie cleared" from
  // "server-side revocation confirmed" instead of hiding the failure.
  await clearSessionCookie();

  if (failure) {
    if (isSessionUnavailableError(failure)) {
      logSessionUnavailable(failure, "revocation check", req);
      return sessionUnavailableResponse(NO_STORE);
    }
    logRouteError(req, failure, { component: "session", operation: "revoke_current_session" });
    return Response.json(
      { ok: false, error: "Could not complete logout", code: "logout_failed" },
      { status: 500, headers: NO_STORE },
    );
  }

  return Response.json({ ok: true }, { headers: NO_STORE });
}
