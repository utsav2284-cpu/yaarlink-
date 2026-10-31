import { db } from "@/backend/db";
import { applications, campaigns } from "@/backend/db/schema";
import { isAdmin } from "@/backend/admin";
import { getSessionUser } from "@/backend/auth";
import { and, desc, eq } from "drizzle-orm";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

// Applications contain creators' contact details — owner (admin) only.
// Brands see applications for their own campaigns via /api/me/dashboard.
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Not allowed" }, { status: 401 });
  try {
    const rows = await db.select().from(applications).orderBy(desc(applications.createdAt)).limit(200);
    return Response.json({ applications: rows });
  } catch (e) {
    console.error(e);
    return Response.json({ applications: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "application-create"), 20, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const b = await req.json();
    const campaignId = String(b.campaignId || "");
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return Response.json({ error: "Invalid campaign" }, { status: 400 });

    const camp = await db.select({ id: campaigns.id, status: campaigns.status, verificationStatus: campaigns.verificationStatus }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!camp.length) return Response.json({ error: "Campaign not found" }, { status: 404 });
    if (camp[0].status !== "open" || camp[0].verificationStatus !== "verified") return Response.json({ error: "This campaign is no longer accepting applications." }, { status: 400 });

    const user = await getSessionUser().catch(() => null);
    if (!user) return Response.json({ error: "Please log in as a creator before applying." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (user.role !== "creator") return Response.json({ error: "Only creator accounts can apply to campaigns." }, { status: 403 });
    const creatorName = String(b.creatorName || user.name || "").trim();
    if (!creatorName) return Response.json({ error: "Please add your name / page name" }, { status: 400 });

    const contact = String(b.creatorContact || user.phone || user.email || "").trim().slice(0, 120);
    if (contact) {
      const dup = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.campaignId, campaignId), eq(applications.creatorContact, contact))).limit(1);
      if (dup.length) return Response.json({ error: "You have already applied to this campaign." }, { status: 400 });
    }

    {
      const dup = await db
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.campaignId, campaignId), eq(applications.userId, user.id)))
        .limit(1);
      if (dup.length) return Response.json({ error: "You have already applied to this campaign." }, { status: 400 });
    }

    const [row] = await db
      .insert(applications)
      .values({
        campaignId,
        userId: user.id,
        creatorName: creatorName.slice(0, 100),
        creatorContact: contact || null,
        message: b.message ? String(b.message).slice(0, 1000) : null,
        status: "applied",
      })
      .returning({ id: applications.id });
    return Response.json({ application: row });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not apply" }, { status: 500 });
  }
}
