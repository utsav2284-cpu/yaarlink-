import { applicationContactOptions, isCompletedCreatorProfile } from "@/backend/application-contact";
import { db } from "@/backend/db";
import { applications, campaigns, creators, notifications } from "@/backend/db/schema";
import { getSessionUser, sessionSecretProblem } from "@/backend/auth";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { normalizeCategory, normalizeContentType, normalizeContentTypeList, normalizeLanguage, normalizeLanguageList, normalizePlatform, normalizePromotionType } from "@/shared/constants";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

async function loadNotifications(userId: string) {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      campaignId: notifications.campaignId,
      applicationId: notifications.applicationId,
      campaignTitle: notifications.campaignTitle,
      actorName: notifications.actorName,
      applicationStatus: notifications.applicationStatus,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(20);
  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { notifications: rows, unreadNotificationCount: Number(unread?.count ?? 0) };
}

/** Private data for the logged-in user only. */
export async function GET() {
  if (sessionSecretProblem()) {
    return Response.json(
      { error: "Session service is temporarily unavailable", code: "service_unavailable" },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
    );
  }

  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    const notificationData = await loadNotifications(user.id);

    if (user.role === "brand") {
      // Only campaigns explicitly owned by this authenticated user.
      const myCampaigns = await db.select().from(campaigns).where(eq(campaigns.ownerId, user.id)).orderBy(desc(campaigns.createdAt));
      const ids = myCampaigns.map((c) => c.id);
      const appRows = ids.length
        ? await db
            .select({ application: applications, profileName: creators.name })
            .from(applications)
            .leftJoin(creators, eq(applications.creatorId, creators.id))
            .where(inArray(applications.campaignId, ids))
            .orderBy(desc(applications.createdAt))
        : [];
      // Show the linked creator profile's current name, not a legacy
      // free-text snapshot stored on older applications.
      const apps = appRows.map(({ application, profileName }) => ({
        ...application,
        creatorName: profileName || application.creatorName,
      }));
      const canonicalCampaigns = myCampaigns.map((row) => ({
        ...row,
        promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
        category: normalizeCategory(row.category) ?? row.category,
        language: normalizeLanguage(row.language) ?? row.language,
        format: normalizeContentType(row.format) ?? row.format,
      }));
      return Response.json(
        { user, campaigns: canonicalCampaigns, applications: apps, ...notificationData },
        { headers: NO_STORE },
      );
    }

    // Creator
    const profiles = await db.select().from(creators).where(eq(creators.userId, user.id)).orderBy(desc(creators.createdAt));
    const myApps = await db
      .select({
        id: applications.id,
        status: applications.status,
        message: applications.message,
        creatorContact: applications.creatorContact,
        decisionNote: applications.decisionNote,
        decisionAt: applications.decisionAt,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
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
      .where(and(eq(campaigns.status, "open"), eq(campaigns.verificationStatus, "verified")))
      .orderBy(desc(campaigns.createdAt))
      .limit(6);
    const canonicalProfiles = profiles.map((row) => ({
      ...row,
      platform: normalizePlatform(row.platform) ?? "Instagram",
      category: normalizeCategory(row.category) ?? row.category,
      languages: row.languages ? (normalizeLanguageList(row.languages, true) ?? []).join(", ") : row.languages,
      contentTypes: row.contentTypes ? (normalizeContentTypeList(row.contentTypes, true) ?? []).join(", ") : row.contentTypes,
    }));
    const canonicalApps = myApps.map((row) => ({
      ...row,
      format: normalizeContentType(row.format) ?? row.format,
    }));
    const canonicalOpen = open.map((row) => ({
      ...row,
      promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
      language: normalizeLanguage(row.language) ?? row.language,
      format: normalizeContentType(row.format) ?? row.format,
    }));
    const applicationProfile = profiles.find((profile) => isCompletedCreatorProfile(profile)) ?? profiles[0];
    return Response.json(
      {
        user,
        profiles: canonicalProfiles,
        applications: canonicalApps,
        openCampaigns: canonicalOpen,
        applicationContactOptions: applicationContactOptions(user, applicationProfile).map((option) => option.value),
        ...notificationData,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not load dashboard", code: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}
