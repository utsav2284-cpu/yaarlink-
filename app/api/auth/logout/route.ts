import { bumpTokenVersion, clearSessionCookie, getSessionUser } from "@/backend/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  // M3: revoke server-side — bump the user's token version so the cookie cannot be replayed.
  const user = await getSessionUser().catch(() => null);
  if (user) await bumpTokenVersion(user.id);
  await clearSessionCookie();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
