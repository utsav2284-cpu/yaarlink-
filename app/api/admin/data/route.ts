import { db } from "@/backend/db";
import { adminAuditLogs, applications, campaigns, contacts, creators, reports } from "@/backend/db/schema";
import { isAdmin } from "@/backend/admin";
import { desc } from "drizzle-orm";
import { normalizeCategory, normalizeContentType, normalizeContentTypeList, normalizeLanguage, normalizeLanguageList, normalizePlatform, normalizePromotionType } from "@/shared/constants";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Owner-only: full data including campaign budgets and contact details.
export async function GET() {
  try {
    if (!(await isAdmin())) return Response.json({ error: "Not allowed" }, { status: 401, headers: NO_STORE });
    const [c, cr, a, co, r, auditLogs] = await Promise.all([
      db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(200),
      db.select().from(creators).orderBy(desc(creators.createdAt)).limit(200),
      db.select().from(applications).orderBy(desc(applications.createdAt)).limit(200),
      db.select().from(contacts).orderBy(desc(contacts.createdAt)).limit(200),
      db.select().from(reports).orderBy(desc(reports.createdAt)).limit(200),
      db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(200),
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
    const pendingFirst = <T extends { status?: string | null }>(rows: T[]) =>
      [...rows].sort((x, y) => (x.status === "pending" ? 0 : 1) - (y.status === "pending" ? 0 : 1));
    const campaignLabels = new Map(canonicalCampaigns.map((row) => [row.id, `${row.title} (${row.businessName})`]));
    const creatorLabels = new Map(canonicalCreators.map((row) => [row.id, row.name]));
    const enrichedApplications = a.map((row) => ({
      ...row,
      campaignLabel: campaignLabels.get(row.campaignId) ?? "Deleted campaign",
      creatorLabel: creatorLabels.get(row.creatorId) ?? row.creatorName,
    }));
    const enrichedReports = [...r]
      .sort((x, y) => (x.status === "open" ? 0 : 1) - (y.status === "open" ? 0 : 1))
      .map((row) => ({
        ...row,
        targetLabel:
          row.targetType === "campaign"
            ? (campaignLabels.get(row.targetId) ?? "Deleted campaign")
            : (creatorLabels.get(row.targetId) ?? "Deleted creator"),
      }));
    return Response.json(
      {
        campaigns: pendingFirst(canonicalCampaigns),
        creators: pendingFirst(canonicalCreators),
        applications: enrichedApplications,
        contacts: co,
        reports: enrichedReports,
        auditLogs,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not load data" }, { status: 500, headers: NO_STORE });
  }
}
