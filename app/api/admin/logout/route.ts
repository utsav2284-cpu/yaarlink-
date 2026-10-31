import { adminSecretProblem, clearAdminSession, isAdmin, revokeAdminSessions } from "@/backend/admin";
import { logAdminAudit } from "@/backend/admin-audit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  // Same configuration gate as login — do not touch the admin cookie without a valid secret.
  if (adminSecretProblem()) return Response.json({ error: "Admin login is not configured." }, { status: 503, headers: NO_STORE });

  const wasAdmin = await isAdmin().catch(() => false);
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
    return Response.json({ ok: true, revoked: wasAdmin }, { headers: NO_STORE });
  } catch (error) {
    console.error("[admin-logout] could not revoke admin sessions", error);
    await clearAdminSession().catch(() => undefined);
    return Response.json(
      { error: "This browser was signed out, but server-side session revocation failed. Log in again and choose Lock admin to revoke all sessions." },
      { status: 500, headers: NO_STORE },
    );
  }
}
