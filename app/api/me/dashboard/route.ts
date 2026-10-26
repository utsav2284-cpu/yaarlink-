import { db } from "@/backend/db";
import { applications, campaigns, creators } from "@/backend/db/schema";
import { getSessionUser } from "@/backend/auth";
import { desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Private data for the logged-in user only. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in" }, { status: 401 });

    if (user.role === "brand") {
      // Only campaigns explicitly owned by this authenticated user.
      const myCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.ownerId, user.id))
        .orderBy(desc(campaigns.createdAt));
      const ids = myCampaigns.map((c) => c.id);
      const apps = ids.length
        ? await db.select().from(applications).where(inArray(applications.campaignId, ids)).orderBy(desc(applications.createdAt))
        : [];
      return Response.json({ user, campaigns: myCampaigns, applications: apps }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // Creator
    const profiles = await db
      .select()
      .from(creators)
      .where(eq(creators.userId, user.id))
      .orderBy(desc(creators.createdAt));
    const myApps = await db
      .select({
        id: applications.id,
        status: applications.status,
        message: applications.message,
        createdAt: applications.createdAt,
        campaignId: applications.campaignId,
        campaignTitle: campaigns.title,
        businessName: campaigns.businessName,
        format: campaigns.format,
        location: campaigns.location,
      })
      .from(applications)
      .leftJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .where(eq(applications.userId, user.id))
      .orderBy(desc(applications.createdAt));
    const open = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        businessName: campaigns.businessName,
        location: campaigns.location,
        language: campaigns.language,
        format: campaigns.format,
        promotionType: campaigns.promotionType,
      })
      .from(campaigns)
      .where(eq(campaigns.status, "open"))
      .orderBy(desc(campaigns.createdAt))
      .limit(6);
    return Response.json({ user, profiles, applications: myApps, openCampaigns: open }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not load dashboard" }, { status: 500 });
  }
}
