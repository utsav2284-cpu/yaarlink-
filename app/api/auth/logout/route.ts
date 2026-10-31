import { clearSessionCookie, getSessionContext, revokeUserSession } from "@/backend/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  // Logout now revokes only this device. Account settings provides a
  // separate "sign out other devices" action, so using a second browser no
  // longer unexpectedly signs the owner out everywhere.
  const context = await getSessionContext().catch(() => null);
  if (context) await revokeUserSession(context.user.id, context.sessionId).catch(() => false);
  await clearSessionCookie();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
