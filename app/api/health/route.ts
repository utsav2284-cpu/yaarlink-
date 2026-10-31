import { db } from "@/backend/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
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
