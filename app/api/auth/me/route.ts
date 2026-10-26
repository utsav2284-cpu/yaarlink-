import { getSessionUser } from "@/backend/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
