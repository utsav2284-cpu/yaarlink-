import { adminSecretProblem, clearAdminSession } from "@/backend/admin";
export const dynamic = "force-dynamic";
export async function POST() {
  // C1: same configuration gate as login — do not touch the admin cookie without a valid secret.
  if (adminSecretProblem()) return Response.json({ error: "Admin login is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  await clearAdminSession();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
