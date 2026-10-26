import { db } from "@/backend/db";
import { applications, campaigns, contacts, creators } from "@/backend/db/schema";
import { isAdmin } from "@/backend/admin";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Owner-only: full data including campaign budgets and contact details.
export async function GET() {
  try {
    if (!(await isAdmin())) return Response.json({ error: "Not allowed" }, { status: 401 });
    const [c, cr, a, co] = await Promise.all([
      db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(200),
      db.select().from(creators).orderBy(desc(creators.createdAt)).limit(200),
      db.select().from(applications).orderBy(desc(applications.createdAt)).limit(200),
      db.select().from(contacts).orderBy(desc(contacts.createdAt)).limit(200),
    ]);
    return Response.json({ campaigns: c, creators: cr, applications: a, contacts: co }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not load data" }, { status: 500 });
  }
}
