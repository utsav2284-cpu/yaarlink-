import { checkDatabaseHealth } from "@/backend/db/health";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const health = await checkDatabaseHealth();
  return Response.json(health, {
    status: health.ok ? 200 : 503,
    headers: health.ok ? NO_STORE : { ...NO_STORE, "Retry-After": "30" },
  });
}
