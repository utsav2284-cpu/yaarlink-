import { db } from "@/backend/db";
import { campaigns } from "@/backend/db/schema";
import { desc } from "drizzle-orm";
import { getSessionUser } from "@/backend/auth";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

// Public listing: budget and brand contact details are owner-only and never sent to users.
export async function GET() {
  try {
    const rows = await db
      .select({
        id: campaigns.id,
        businessName: campaigns.businessName,
        title: campaigns.title,
        promotionType: campaigns.promotionType,
        category: campaigns.category,
        description: campaigns.description,
        location: campaigns.location,
        language: campaigns.language,
        targetAudience: campaigns.targetAudience,
        format: campaigns.format,
        website: campaigns.website,
        status: campaigns.status,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt))
      .limit(50);
    return Response.json({ campaigns: rows });
  } catch (e) {
    console.error(e);
    return Response.json({ campaigns: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "campaign-create"), 5, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const b = await req.json();
    const user = await getSessionUser().catch(() => null);
    if (!user) return Response.json({ error: "Please log in as a brand before creating a campaign." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (user.role !== "brand") return Response.json({ error: "Only brand accounts can create campaigns." }, { status: 403 });
    if (!b.email) b.email = user.email;
    if (!b.businessName || !b.title) return Response.json({ error: "Business name and title required" }, { status: 400 });
    const email = b.email ? String(b.email).toLowerCase().trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Please enter a valid email." }, { status: 400 });
    let website: string | null = null;
    if (b.website) { try { const u = new URL(String(b.website)); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); website = u.toString().slice(0, 200); } catch { return Response.json({ error: "Please enter a valid website URL." }, { status: 400 }); } }
    const budget = Math.round(Number(b.budget));
    if (!Number.isFinite(budget) || budget < 500 || budget > 10_000_000) {
      return Response.json({ error: "Please enter a budget between ₹500 and ₹1,00,00,000." }, { status: 400 });
    }
    const [row] = await db
      .insert(campaigns)
      .values({
        ownerId: user.id,
        businessName: String(b.businessName).slice(0, 120),
        contactName: b.contactName ? String(b.contactName).slice(0, 100) : null,
        email: email ? email.slice(0, 120) : null,
        phone: b.phone ? String(b.phone).slice(0, 20) : null,
        title: String(b.title).slice(0, 160),
        promotionType: b.promotionType ? String(b.promotionType).slice(0, 40) : "Product",
        category: b.category ? String(b.category).slice(0, 60) : null,
        description: b.description ? String(b.description).slice(0, 2000) : null,
        budget,
        location: b.location ? String(b.location).slice(0, 100) : null,
        language: b.language ? String(b.language).slice(0, 60) : "English",
        targetAudience: b.targetAudience ? String(b.targetAudience).slice(0, 300) : null,
        format: b.format ? String(b.format).slice(0, 60) : "Story",
        website,
        status: "open",
      })
      .returning({ id: campaigns.id, title: campaigns.title });
    return Response.json({ campaign: row });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not create campaign" }, { status: 500 });
  }
}
