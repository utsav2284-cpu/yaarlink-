import { db } from "@/backend/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // TEMP DIAGNOSTIC: verify the connected database actually has the app tables.
    const result = (await db.execute(sql`
      select
        current_database() as db_name,
        current_user as db_user,
        (select count(*)::int from users) as users_count,
        (select count(*)::int from campaigns) as campaigns_count,
        (select count(*)::int from creators) as creators_count
    `)) as unknown as { rows: Array<Record<string, unknown>> };
    const row = result.rows[0] ?? {};
    return Response.json({ ok: true, dbName: row.db_name, dbUser: row.db_user, users: row.users_count, campaigns: row.campaigns_count, creators: row.creators_count });
  } catch (e) {
    // TEMP DIAGNOSTIC (remove after DB connection is fixed): expose a redacted
    // error summary so production connection failures can be identified.
    const err = e as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
    const raw = `${err?.message ?? ""} ${err?.cause?.message ?? ""}`.trim();
    const detail = raw.replace(/:[^@\s]+@/g, ":***@").slice(0, 240);
    return Response.json(
      { ok: false, errorName: err?.name ?? "Error", errorCode: err?.code ?? err?.cause?.code ?? null, detail },
      { status: 500 },
    );
  }
}
