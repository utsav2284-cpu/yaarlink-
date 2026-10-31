import { db } from "@/backend/db";
import { applications, campaigns, contacts, creators } from "@/backend/db/schema";
import { isAdmin } from "@/backend/admin";
import { desc } from "drizzle-orm";
import { normalizeCategory, normalizeContentType, normalizeContentTypeList, normalizeLanguage, normalizeLanguageList, normalizePlatform, normalizePromotionType } from "@/shared/constants";

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
    const canonicalCampaigns = c.map((row) => ({
      ...row,
      promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
      category: normalizeCategory(row.category) ?? row.category,
      language: normalizeLanguage(row.language) ?? row.language,
      format: normalizeContentType(row.format) ?? row.format,
    }));
    const canonicalCreators = cr.map((row) => ({
      ...row,
      platform: normalizePlatform(row.platform) ?? "Instagram",
      category: normalizeCategory(row.category) ?? row.category,
      languages: row.languages ? (normalizeLanguageList(row.languages, true) ?? []).join(", ") : row.languages,
      contentTypes: row.contentTypes ? (normalizeContentTypeList(row.contentTypes, true) ?? []).join(", ") : row.contentTypes,
    }));
    return Response.json({ campaigns: canonicalCampaigns, creators: canonicalCreators, applications: a, contacts: co }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not load data" }, { status: 500 });
  }
}
