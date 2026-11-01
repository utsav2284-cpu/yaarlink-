import { adminSecretProblem, clearAdminSession, isAdmin, isAdminSessionUnavailableError, logAdminSessionUnavailable, revokeAdminSessions } from "@/backend/admin";
import { logAdminAudit } from "@/backend/admin-audit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  // Same configuration gate as login — do not touch the admin cookie without a valid secret.
  if (adminSecretProblem()) return Response.json({ error: "Admin login is not configured.", code: "admin_not_configured" }, { status: 503, headers: NO_STORE });

  let wasAdmin = false;
  let lookupFailure: unknown = null;
  try {
    wasAdmin = await isAdmin();
  } catch (error) {
    lookupFailure = error;
  }

  try {
    let sessionVersion: number | null = null;
    if (wasAdmin) {
      // Incrementing the DB-backed version revokes every copied/current admin token,
      // not just the cookie in this browser.
      sessionVersion = await revokeAdminSessions();
      await logAdminAudit(req, {
        action: "admin.logout",
        details: { sessionVersion, revokedAllSessions: true },
      });
    }
    await clearAdminSession();
    if (lookupFailure) {
      if (isAdminSessionUnavailableError(lookupFailure)) logAdminSessionUnavailable(lookupFailure);
      else console.error("[admin-logout] session lookup failed", lookupFailure);
      return Response.json(
        {
          error:
            "This browser was signed out, but server-side session revocation could not be confirmed. Log in again and choose Lock admin to revoke all sessions.",
          code: "service_unavailable",
        },
        { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
      );
    }
    return Response.json({ ok: true, revoked: wasAdmin }, { headers: NO_STORE });
  } catch (error) {
    console.error("[admin-logout] could not revoke admin sessions", error);
    await clearAdminSession().catch(() => undefined);
    return Response.json(
      { error: "This browser was signed out, but server-side session revocation failed. Log in again and choose Lock admin to revoke all sessions.", code: "admin_session_revoke_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
