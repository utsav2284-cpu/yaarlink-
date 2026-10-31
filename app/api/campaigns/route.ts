import { db } from "@/backend/db";
import { campaigns } from "@/backend/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/backend/auth";
import { createVerificationCode } from "@/backend/moderation";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { normalizeProfileUrl } from "@/backend/social-url";
import { normalizeCategory, normalizeContentType, normalizeLanguage, normalizePromotionType } from "@/shared/constants";

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
        verificationStatus: campaigns.verificationStatus,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      // Fail closed: pending, rejected, closed, and unverified campaigns stay private.
      .where(and(eq(campaigns.status, "open"), eq(campaigns.verificationStatus, "verified")))
      .orderBy(desc(campaigns.createdAt))
      .limit(50);
    const canonicalRows = rows.map((row) => ({
      ...row,
      promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
      category: normalizeCategory(row.category) ?? row.category,
      language: normalizeLanguage(row.language) ?? row.language,
      format: normalizeContentType(row.format) ?? row.format,
    }));
    return Response.json({ campaigns: canonicalRows });
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
    if (b.website) {
      website = normalizeProfileUrl(b.website, "Instagram");
      if (!website) return Response.json({ error: "Please enter a valid website or Instagram URL." }, { status: 400 });
      website = website.slice(0, 200);
    }
    const budget = Math.round(Number(b.budget));
    if (!Number.isFinite(budget) || budget < 500 || budget > 10_000_000) {
      return Response.json({ error: "Please enter a budget between ₹500 and ₹1,00,00,000." }, { status: 400 });
    }

    const hasPromotionType = !(b.promotionType == null || (typeof b.promotionType === "string" && !b.promotionType.trim()));
    const promotionType = hasPromotionType ? normalizePromotionType(b.promotionType) : "Product";
    if (!promotionType) return Response.json({ error: "Please choose a valid promotion type." }, { status: 400 });

    const hasCategory = !(b.category == null || (typeof b.category === "string" && !b.category.trim()));
    const category = hasCategory ? normalizeCategory(b.category) : null;
    if (hasCategory && !category) return Response.json({ error: "Please choose a valid category." }, { status: 400 });

    const hasLanguage = !(b.language == null || (typeof b.language === "string" && !b.language.trim()));
    const language = hasLanguage ? normalizeLanguage(b.language) : "English";
    if (!language) return Response.json({ error: "Please choose a valid language." }, { status: 400 });

    const hasFormat = !(b.format == null || (typeof b.format === "string" && !b.format.trim()));
    const format = hasFormat ? normalizeContentType(b.format) : "Story";
    if (!format) return Response.json({ error: "Please choose a valid format." }, { status: 400 });

    const [row] = await db
      .insert(campaigns)
      .values({
        ownerId: user.id,
        businessName: String(b.businessName).slice(0, 120),
        contactName: b.contactName ? String(b.contactName).slice(0, 100) : null,
        email: email ? email.slice(0, 120) : null,
        phone: b.phone ? String(b.phone).slice(0, 20) : null,
        title: String(b.title).slice(0, 160),
        promotionType,
        category,
        description: b.description ? String(b.description).slice(0, 2000) : null,
        budget,
        location: b.location ? String(b.location).slice(0, 100) : null,
        language,
        targetAudience: b.targetAudience ? String(b.targetAudience).slice(0, 300) : null,
        format,
        website,
        status: "pending",
        verificationCode: createVerificationCode(),
        verificationStatus: "pending",
        moderationNote: null,
        reviewedAt: null,
      })
      .returning({ id: campaigns.id, title: campaigns.title, status: campaigns.status, verificationCode: campaigns.verificationCode, verificationStatus: campaigns.verificationStatus });
    return Response.json({ campaign: row });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not create campaign" }, { status: 500 });
  }
}
