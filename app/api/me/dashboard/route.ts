import { applicationContactOptions } from "@/backend/application-contact";
import { db } from "@/backend/db";
import { applications, campaigns, creators, notifications } from "@/backend/db/schema";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionSecretProblem, sessionUnavailableResponse } from "@/backend/auth";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  APPLICATION_STATUSES,
  CAMPAIGN_REVIEW_STATUSES,
  CREATOR_REVIEW_STATUSES,
  VERIFICATION_STATUSES,
  normalizeCategory,
  normalizeContentType,
  normalizeContentTypeList,
  normalizeLanguage,
  normalizeLanguageList,
  normalizePlatform,
  normalizePromotionType,
} from "@/shared/constants";
import {
  allConditions,
  cursorCondition,
  decodeCursor,
  encodeCursor,
  isListingQueryError,
  ListingQueryError,
  paginateRows,
  parseEnumParam,
  parseListingParams,
  parseNormalizedParam,
  parseUuidParam,
  scopeFrom,
  searchCondition,
  sortOrder,
  textExpression,
  tokenListCondition,
  type PaginationMeta,
  type SortKey,
} from "@/backend/pagination";
import { USER_ROLES, type UserRole } from "@/shared/user-roles";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const DASHBOARD_SECTIONS = ["campaigns", "applications", "profiles", "openCampaigns", "notifications"] as const;
const CAMPAIGN_SORTS = ["newest", "oldest", "title", "budget_desc", "budget_asc", "status"] as const;
const APPLICATION_SORTS = ["newest", "oldest", "updated", "status"] as const;
const PROFILE_SORTS = ["newest", "oldest", "name", "followers_desc", "followers_asc", "status"] as const;
const OPEN_CAMPAIGN_SORTS = ["newest", "oldest", "title", "business"] as const;
const NOTIFICATION_SORTS = ["newest", "oldest", "unread"] as const;

type CampaignSortRow = {
  id: string;
  title: string;
  businessName: string;
  budget: number;
  status: string;
  createdAt: Date;
};

type ApplicationSortRow = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ProfileSortRow = {
  id: string;
  name: string;
  followers: number;
  verifiedFollowers: number | null;
  status: string;
  createdAt: Date;
};

type NotificationSortRow = {
  id: string;
  readAt: Date | null;
  createdAt: Date;
};

function campaignSortKeys(sort: string): Array<SortKey<CampaignSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${campaigns.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "title":
      return [
        { expression: sql`lower(${campaigns.title})`, direction: "asc", kind: "string", value: (row) => row.title.toLocaleLowerCase("en-US") },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "budget_desc":
      return [
        { expression: sql`${campaigns.budget}`, direction: "desc", kind: "number", value: (row) => row.budget },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "budget_asc":
      return [
        { expression: sql`${campaigns.budget}`, direction: "asc", kind: "number", value: (row) => row.budget },
        { expression: sql`${campaigns.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "status":
      return [
        { expression: sql`${campaigns.status}`, direction: "asc", kind: "string", value: (row) => row.status },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

function applicationSortKeys(sort: string): Array<SortKey<ApplicationSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${applications.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${applications.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "updated":
      return [
        { expression: sql`${applications.updatedAt}`, direction: "desc", kind: "date", value: (row) => row.updatedAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "status":
      return [
        { expression: sql`${applications.status}`, direction: "asc", kind: "string", value: (row) => row.status },
        { expression: sql`${applications.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${applications.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

function profileSortKeys(sort: string): Array<SortKey<ProfileSortRow>> {
  const effectiveFollowers = sql`coalesce(${creators.verifiedFollowers}, ${creators.followers})`;
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${creators.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${creators.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "name":
      return [
        { expression: sql`lower(${creators.name})`, direction: "asc", kind: "string", value: (row) => row.name.toLocaleLowerCase("en-US") },
        { expression: sql`${creators.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "followers_desc":
      return [
        { expression: effectiveFollowers, direction: "desc", kind: "number", value: (row) => row.verifiedFollowers ?? row.followers },
        { expression: sql`${creators.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "followers_asc":
      return [
        { expression: effectiveFollowers, direction: "asc", kind: "number", value: (row) => row.verifiedFollowers ?? row.followers },
        { expression: sql`${creators.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${creators.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "status":
      return [
        { expression: sql`${creators.status}`, direction: "asc", kind: "string", value: (row) => row.status },
        { expression: sql`${creators.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${creators.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

function openCampaignSortKeys(sort: string): Array<SortKey<CampaignSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${campaigns.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "title":
      return [
        { expression: sql`lower(${campaigns.title})`, direction: "asc", kind: "string", value: (row) => row.title.toLocaleLowerCase("en-US") },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "business":
      return [
        { expression: sql`lower(${campaigns.businessName})`, direction: "asc", kind: "string", value: (row) => row.businessName.toLocaleLowerCase("en-US") },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

function notificationSortKeys(sort: string): Array<SortKey<NotificationSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${notifications.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${notifications.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "unread":
      return [
        {
          expression: sql`case when ${notifications.readAt} is null then 0 else 1 end`,
          direction: "asc",
          kind: "number",
          value: (row) => (row.readAt ? 1 : 0),
        },
        { expression: sql`${notifications.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${notifications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${notifications.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${notifications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

function canonicalCampaign<
  T extends {
    promotionType: string;
    category: string | null;
    language: string;
    format: string;
    submissionId?: string | null;
    submissionFingerprint?: string | null;
  },
>(row: T) {
  const { submissionId: _submissionId, submissionFingerprint: _submissionFingerprint, ...publicRow } = row;
  return {
    ...publicRow,
    promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
    category: normalizeCategory(row.category) ?? row.category,
    language: normalizeLanguage(row.language) ?? row.language,
    format: normalizeContentType(row.format) ?? row.format,
  };
}

function canonicalProfile<T extends { platform: string; category: string | null; languages: string; contentTypes: string }>(row: T) {
  return {
    ...row,
    platform: normalizePlatform(row.platform) ?? "Instagram",
    category: normalizeCategory(row.category) ?? row.category,
    languages: row.languages ? (normalizeLanguageList(row.languages, true) ?? []).join(", ") : row.languages,
    contentTypes: row.contentTypes ? (normalizeContentTypeList(row.contentTypes, true) ?? []).join(", ") : row.contentTypes,
  };
}

async function loadNotifications(userId: string, params: URLSearchParams, includeRows: boolean) {
  const listing = parseListingParams(params, {
    prefix: "notification",
    defaultLimit: 20,
    defaultSort: "newest",
    allowedSorts: NOTIFICATION_SORTS,
  });
  const readFilter = parseEnumParam(params, "read", ["read", "unread"], { prefix: "notification" });
  const scope = scopeFrom({ listing: "dashboard-notifications", userId, q: listing.q, readFilter });
  const keys = notificationSortKeys(listing.sort);
  const cursorValues = includeRows ? decodeCursor(listing.cursor, { sort: listing.sort, scope, keys }) : null;
  const search = searchCondition(
    [
      textExpression(sql`${notifications.kind}`),
      textExpression(sql`${notifications.campaignTitle}`),
      textExpression(sql`${notifications.actorName}`),
      textExpression(sql`${notifications.applicationStatus}`),
      textExpression(sql`${notifications.campaignId}`),
      textExpression(sql`${notifications.applicationId}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    eq(notifications.userId, userId),
    readFilter === "read" ? sql`${notifications.readAt} is not null` : undefined,
    readFilter === "unread" ? isNull(notifications.readAt) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);

  const [[totalRow], [overallRow], [unreadRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(baseWhere),
    db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    includeRows
      ? db
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
          .where(pageWhere)
          .orderBy(...sortOrder(keys))
          .limit(listing.limit + 1)
      : Promise.resolve([]),
  ]);
  const page = includeRows
    ? paginateRows(rowsWithExtra, {
        limit: listing.limit,
        total: Number(totalRow?.count ?? 0),
        sort: listing.sort,
        scope,
        keys,
      })
    : null;
  return {
    notifications: page?.items,
    pagination: page?.pagination,
    notificationTotal: Number(overallRow?.count ?? 0),
    unreadNotificationCount: Number(unreadRow?.count ?? 0),
  };
}

async function loadBrandCounts(userId: string) {
  const [[campaignRow], [applicationRow], [budgetRow]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(eq(campaigns.ownerId, userId)),
    db
      .select({ count: sql<number>`count(distinct ${applications.id})::int` })
      .from(applications)
      .innerJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .where(eq(campaigns.ownerId, userId)),
    db
      .select({ total: sql<number>`coalesce(sum(${campaigns.budget}), 0)::int` })
      .from(campaigns)
      .where(eq(campaigns.ownerId, userId)),
  ]);
  return {
    campaigns: Number(campaignRow?.count ?? 0),
    applications: Number(applicationRow?.count ?? 0),
    campaignBudgetTotal: Number(budgetRow?.total ?? 0),
  };
}

async function loadCreatorCounts(userId: string) {
  const [[profileRow], [completedRow], [applicationRow], [openRow]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(creators).where(eq(creators.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(creators)
      .where(and(eq(creators.userId, userId), ne(creators.status, "incomplete"))),
    db.select({ count: sql<number>`count(*)::int` }).from(applications).where(eq(applications.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(and(eq(campaigns.status, "open"), eq(campaigns.verificationStatus, "verified"), ne(campaigns.ownerId, userId))),
  ]);
  return {
    profiles: Number(profileRow?.count ?? 0),
    completedProfiles: Number(completedRow?.count ?? 0),
    applications: Number(applicationRow?.count ?? 0),
    openCampaigns: Number(openRow?.count ?? 0),
  };
}

async function loadBrandCampaignPage(userId: string, params: URLSearchParams) {
  const listing = parseListingParams(params, {
    prefix: "campaign",
    defaultLimit: 25,
    defaultSort: "newest",
    allowedSorts: CAMPAIGN_SORTS,
  });
  const status = parseEnumParam(params, "status", CAMPAIGN_REVIEW_STATUSES, { prefix: "campaign" });
  const verificationStatus = parseEnumParam(params, "verificationStatus", VERIFICATION_STATUSES, { prefix: "campaign" });
  const language = parseNormalizedParam(params, "language", normalizeLanguage, { prefix: "campaign", aliases: ["lang"] });
  const category = parseNormalizedParam(params, "category", normalizeCategory, { prefix: "campaign" });
  const promotionType = parseNormalizedParam(params, "promotionType", normalizePromotionType, { prefix: "campaign", aliases: ["type"] });
  const format = parseNormalizedParam(params, "format", normalizeContentType, { prefix: "campaign", aliases: ["contentType"] });
  const scope = scopeFrom({
    listing: "dashboard-brand-campaigns",
    userId,
    q: listing.q,
    status,
    verificationStatus,
    language,
    category,
    promotionType,
    format,
  });
  const keys = campaignSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${campaigns.id}`),
      textExpression(sql`${campaigns.title}`),
      textExpression(sql`${campaigns.businessName}`),
      textExpression(sql`${campaigns.contactName}`),
      textExpression(sql`${campaigns.email}`),
      textExpression(sql`${campaigns.phone}`),
      textExpression(sql`${campaigns.description}`),
      textExpression(sql`${campaigns.location}`),
      textExpression(sql`${campaigns.targetAudience}`),
      textExpression(sql`${campaigns.promotionType}`),
      textExpression(sql`${campaigns.category}`),
      textExpression(sql`${campaigns.language}`),
      textExpression(sql`${campaigns.format}`),
      textExpression(sql`${campaigns.website}`),
      textExpression(sql`${campaigns.status}`),
      textExpression(sql`${campaigns.verificationStatus}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    eq(campaigns.ownerId, userId),
    status ? eq(campaigns.status, status) : undefined,
    verificationStatus ? eq(campaigns.verificationStatus, verificationStatus) : undefined,
    language ? eq(campaigns.language, language) : undefined,
    category ? eq(campaigns.category, category) : undefined,
    promotionType ? eq(campaigns.promotionType, promotionType) : undefined,
    format ? eq(campaigns.format, format) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(baseWhere),
    db.select().from(campaigns).where(pageWhere).orderBy(...sortOrder(keys)).limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, {
    limit: listing.limit,
    total: Number(totalRow?.count ?? 0),
    sort: listing.sort,
    scope,
    keys,
  });
  return { campaigns: page.items.map(canonicalCampaign), rawCampaigns: page.items, pagination: page.pagination };
}

function brandApplicationSearch() {
  return [
    textExpression(sql`${applications.id}`),
    textExpression(sql`${applications.creatorName}`),
    textExpression(sql`${applications.creatorContact}`),
    textExpression(sql`${applications.message}`),
    textExpression(sql`${applications.decisionNote}`),
    textExpression(sql`${applications.status}`),
    textExpression(sql`${campaigns.title}`),
    textExpression(sql`${campaigns.businessName}`),
    textExpression(sql`${creators.name}`),
  ];
}

function brandApplicationScope(userId: string, campaignId: string, q: string, status: string | null) {
  return scopeFrom({ listing: "dashboard-brand-applications", userId, campaignId, q, status });
}

type BrandApplicationRow = {
  id: string;
  campaignId: string;
  userId: string;
  creatorId: string;
  creatorName: string;
  creatorContact: string | null;
  message: string | null;
  status: string;
  decisionNote: string | null;
  decisionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profileName: string | null;
};

function outputBrandApplication(row: BrandApplicationRow) {
  const { profileName, ...application } = row;
  // Show the linked creator profile's current name, not a legacy free-text
  // snapshot stored on older applications.
  return { ...application, creatorName: profileName || application.creatorName };
}

async function loadBrandApplicationsForCampaignPage(userId: string, campaignIds: string[], params: URLSearchParams) {
  const listing = parseListingParams(params, {
    prefix: "application",
    defaultLimit: 10,
    defaultSort: "newest",
    allowedSorts: APPLICATION_SORTS,
  });
  const status = parseEnumParam(params, "status", APPLICATION_STATUSES, { prefix: "application" });
  const keys = applicationSortKeys(listing.sort);
  const applicationCountsByCampaign: Record<string, number> = Object.fromEntries(campaignIds.map((id) => [id, 0]));
  const applicationPaginationByCampaign: Record<string, PaginationMeta> = {};
  if (campaignIds.length === 0) {
    return { applications: [], applicationCountsByCampaign, applicationPaginationByCampaign };
  }

  const search = searchCondition(brandApplicationSearch(), listing.q);
  const baseWhere = allConditions([
    eq(campaigns.ownerId, userId),
    inArray(applications.campaignId, campaignIds),
    status ? eq(applications.status, status) : undefined,
    search,
  ]);

  const ranked = db
    .select({
      id: applications.id,
      campaignId: applications.campaignId,
      userId: applications.userId,
      creatorId: applications.creatorId,
      creatorName: applications.creatorName,
      creatorContact: applications.creatorContact,
      message: applications.message,
      status: applications.status,
      decisionNote: applications.decisionNote,
      decisionAt: applications.decisionAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      profileName: creators.name,
      rowNumber: sql<number>`row_number() over (partition by ${applications.campaignId} order by ${sql.join(sortOrder(keys), sql`, `)})`.as("row_number"),
    })
    .from(applications)
    .innerJoin(campaigns, eq(applications.campaignId, campaigns.id))
    .leftJoin(creators, eq(applications.creatorId, creators.id))
    .where(baseWhere)
    .as("ranked_brand_applications");

  const [countRows, rankedRows] = await Promise.all([
    db
      .select({ campaignId: applications.campaignId, count: sql<number>`count(distinct ${applications.id})::int` })
      .from(applications)
      .innerJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .leftJoin(creators, eq(applications.creatorId, creators.id))
      .where(baseWhere)
      .groupBy(applications.campaignId),
    db
      .select()
      .from(ranked)
      .where(sql`${ranked.rowNumber} <= ${listing.limit + 1}`)
      .orderBy(sql`${ranked.campaignId} asc`, sql`${ranked.rowNumber} asc`),
  ]);
  for (const row of countRows) applicationCountsByCampaign[row.campaignId] = Number(row.count ?? 0);

  const grouped = new Map<string, BrandApplicationRow[]>();
  for (const row of rankedRows) {
    const { rowNumber: _rowNumber, ...application } = row;
    const rows = grouped.get(application.campaignId) ?? [];
    rows.push(application as BrandApplicationRow);
    grouped.set(application.campaignId, rows);
  }

  const output: ReturnType<typeof outputBrandApplication>[] = [];
  for (const campaignId of campaignIds) {
    const rowsWithExtra = grouped.get(campaignId) ?? [];
    const hasMore = rowsWithExtra.length > listing.limit;
    const items = hasMore ? rowsWithExtra.slice(0, listing.limit) : rowsWithExtra;
    output.push(...items.map(outputBrandApplication));
    const last = items[items.length - 1];
    applicationPaginationByCampaign[campaignId] = {
      limit: listing.limit,
      total: applicationCountsByCampaign[campaignId] ?? 0,
      returned: items.length,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeCursor(listing.sort, brandApplicationScope(userId, campaignId, listing.q, status), keys.map((key) => key.value(last)))
          : null,
    };
  }
  return { applications: output, applicationCountsByCampaign, applicationPaginationByCampaign };
}

async function loadBrandApplicationsForCampaign(userId: string, params: URLSearchParams) {
  const listing = parseListingParams(params, {
    prefix: "application",
    defaultLimit: 10,
    defaultSort: "newest",
    allowedSorts: APPLICATION_SORTS,
  });
  const campaignId = parseUuidParam(params, "campaignId", { prefix: "application" });
  if (!campaignId) throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
  const status = parseEnumParam(params, "status", APPLICATION_STATUSES, { prefix: "application" });
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.ownerId, userId)))
    .limit(1);
  if (!campaign) return null;

  const scope = brandApplicationScope(userId, campaignId, listing.q, status);
  const keys = applicationSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(brandApplicationSearch(), listing.q);
  const baseWhere = allConditions([
    eq(campaigns.ownerId, userId),
    eq(applications.campaignId, campaignId),
    status ? eq(applications.status, status) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${applications.id})::int` })
      .from(applications)
      .innerJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .leftJoin(creators, eq(applications.creatorId, creators.id))
      .where(baseWhere),
    db
      .select({
        id: applications.id,
        campaignId: applications.campaignId,
        userId: applications.userId,
        creatorId: applications.creatorId,
        creatorName: applications.creatorName,
        creatorContact: applications.creatorContact,
        message: applications.message,
        status: applications.status,
        decisionNote: applications.decisionNote,
        decisionAt: applications.decisionAt,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
        profileName: creators.name,
      })
      .from(applications)
      .innerJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .leftJoin(creators, eq(applications.creatorId, creators.id))
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, {
    limit: listing.limit,
    total: Number(totalRow?.count ?? 0),
    sort: listing.sort,
    scope,
    keys,
  });
  return {
    campaignId,
    applications: page.items.map(outputBrandApplication),
    pagination: page.pagination,
    applicationCountsByCampaign: { [campaignId]: page.pagination.total },
    applicationPaginationByCampaign: { [campaignId]: page.pagination },
  };
}

async function loadCreatorProfiles(userId: string, params: URLSearchParams) {
  const listing = parseListingParams(params, {
    prefix: "profile",
    defaultLimit: 25,
    defaultSort: "newest",
    allowedSorts: PROFILE_SORTS,
  });
  const status = parseEnumParam(params, "status", CREATOR_REVIEW_STATUSES, { prefix: "profile" });
  const verificationStatus = parseEnumParam(params, "verificationStatus", VERIFICATION_STATUSES, { prefix: "profile" });
  const category = parseNormalizedParam(params, "category", normalizeCategory, { prefix: "profile" });
  const language = parseNormalizedParam(params, "language", normalizeLanguage, { prefix: "profile", aliases: ["lang"] });
  const platform = parseNormalizedParam(params, "platform", normalizePlatform, { prefix: "profile" });
  const contentType = parseNormalizedParam(params, "contentType", normalizeContentType, { prefix: "profile", aliases: ["format"] });
  const scope = scopeFrom({
    listing: "dashboard-creator-profiles",
    userId,
    q: listing.q,
    status,
    verificationStatus,
    category,
    language,
    platform,
    contentType,
  });
  const keys = profileSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${creators.id}`),
      textExpression(sql`${creators.name}`),
      textExpression(sql`${creators.email}`),
      textExpression(sql`${creators.phone}`),
      textExpression(sql`${creators.category}`),
      textExpression(sql`${creators.languages}`),
      textExpression(sql`${creators.location}`),
      textExpression(sql`${creators.contentTypes}`),
      textExpression(sql`${creators.bio}`),
      textExpression(sql`${creators.platform}`),
      textExpression(sql`${creators.instagram}`),
      textExpression(sql`${creators.youtube}`),
      textExpression(sql`${creators.profileUrl}`),
      textExpression(sql`${creators.status}`),
      textExpression(sql`${creators.verificationStatus}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    eq(creators.userId, userId),
    status ? eq(creators.status, status) : undefined,
    verificationStatus ? eq(creators.verificationStatus, verificationStatus) : undefined,
    category ? eq(creators.category, category) : undefined,
    language ? tokenListCondition(sql`${creators.languages}`, language) : undefined,
    platform ? eq(creators.platform, platform) : undefined,
    contentType ? tokenListCondition(sql`${creators.contentTypes}`, contentType) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(creators).where(baseWhere),
    db.select().from(creators).where(pageWhere).orderBy(...sortOrder(keys)).limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, {
    limit: listing.limit,
    total: Number(totalRow?.count ?? 0),
    sort: listing.sort,
    scope,
    keys,
  });
  return { profiles: page.items.map(canonicalProfile), pagination: page.pagination };
}

async function loadCreatorApplications(userId: string, params: URLSearchParams) {
  const listing = parseListingParams(params, {
    prefix: "application",
    defaultLimit: 25,
    defaultSort: "newest",
    allowedSorts: APPLICATION_SORTS,
  });
  const status = parseEnumParam(params, "status", APPLICATION_STATUSES, { prefix: "application" });
  const campaignId = parseUuidParam(params, "campaignId", { prefix: "application" });
  const scope = scopeFrom({ listing: "dashboard-creator-applications", userId, q: listing.q, status, campaignId });
  const keys = applicationSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${applications.id}`),
      textExpression(sql`${applications.creatorName}`),
      textExpression(sql`${applications.creatorContact}`),
      textExpression(sql`${applications.message}`),
      textExpression(sql`${applications.decisionNote}`),
      textExpression(sql`${applications.status}`),
      textExpression(sql`${campaigns.title}`),
      textExpression(sql`${campaigns.businessName}`),
      textExpression(sql`${campaigns.location}`),
      textExpression(sql`${campaigns.format}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    eq(applications.userId, userId),
    status ? eq(applications.status, status) : undefined,
    campaignId ? eq(applications.campaignId, campaignId) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${applications.id})::int` })
      .from(applications)
      .leftJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .where(baseWhere),
    db
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
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, {
    limit: listing.limit,
    total: Number(totalRow?.count ?? 0),
    sort: listing.sort,
    scope,
    keys,
  });
  return {
    applications: page.items.map((row) => ({ ...row, format: normalizeContentType(row.format) ?? row.format })),
    pagination: page.pagination,
  };
}

async function loadOpenCampaigns(userId: string, params: URLSearchParams) {
  const listing = parseListingParams(params, {
    prefix: "open",
    defaultLimit: 6,
    defaultSort: "newest",
    allowedSorts: OPEN_CAMPAIGN_SORTS,
  });
  const language = parseNormalizedParam(params, "language", normalizeLanguage, { prefix: "open", aliases: ["lang"] });
  const category = parseNormalizedParam(params, "category", normalizeCategory, { prefix: "open" });
  const promotionType = parseNormalizedParam(params, "promotionType", normalizePromotionType, { prefix: "open", aliases: ["type"] });
  const format = parseNormalizedParam(params, "format", normalizeContentType, { prefix: "open", aliases: ["contentType"] });
  const scope = scopeFrom({ listing: "dashboard-open-campaigns", userId, q: listing.q, language, category, promotionType, format });
  const keys = openCampaignSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${campaigns.title}`),
      textExpression(sql`${campaigns.businessName}`),
      textExpression(sql`${campaigns.location}`),
      textExpression(sql`${campaigns.language}`),
      textExpression(sql`${campaigns.format}`),
      textExpression(sql`${campaigns.promotionType}`),
      textExpression(sql`${campaigns.category}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    eq(campaigns.status, "open"),
    eq(campaigns.verificationStatus, "verified"),
    // A dual-purpose account cannot apply to its own campaign, so do not
    // present those campaigns as creator opportunities in this workspace.
    ne(campaigns.ownerId, userId),
    language ? eq(campaigns.language, language) : undefined,
    category ? eq(campaigns.category, category) : undefined,
    promotionType ? eq(campaigns.promotionType, promotionType) : undefined,
    format ? eq(campaigns.format, format) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(baseWhere),
    db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        businessName: campaigns.businessName,
        budget: campaigns.budget,
        status: campaigns.status,
        location: campaigns.location,
        language: campaigns.language,
        format: campaigns.format,
        promotionType: campaigns.promotionType,
        category: campaigns.category,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, {
    limit: listing.limit,
    total: Number(totalRow?.count ?? 0),
    sort: listing.sort,
    scope,
    keys,
  });
  return {
    // Keep the dashboard preview shape free of private budget/sort-only fields.
    openCampaigns: page.items.map((row) => {
      const canonical = canonicalCampaign(row);
      return {
        id: canonical.id,
        title: canonical.title,
        businessName: canonical.businessName,
        location: canonical.location,
        language: canonical.language,
        format: canonical.format,
        promotionType: canonical.promotionType,
      };
    }),
    pagination: page.pagination,
  };
}

/** Private data for the logged-in user only. */
export async function GET(req: Request) {
  if (sessionSecretProblem()) {
    return Response.json(
      { error: "Session service is temporarily unavailable", code: "service_unavailable" },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
    );
  }

  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    const params = new URL(req.url).searchParams;
    const section = parseEnumParam(params, "section", DASHBOARD_SECTIONS);
    // The stored role selects the default workspace only. Either explicit
    // view is available to the same account; section loaders stay scoped to
    // resources this user owns or submitted.
    const activeView = (parseEnumParam(params, "view", USER_ROLES) as UserRole | null) ?? user.primaryRole;
    const includeNotifications = !section || section === "notifications";
    const notificationData = await loadNotifications(user.id, params, includeNotifications);

    if (activeView === "brand") {
      if (section === "profiles" || section === "openCampaigns") {
        throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
      }
      const counts = {
        ...(await loadBrandCounts(user.id)),
        notifications: notificationData.notificationTotal,
        unreadNotifications: notificationData.unreadNotificationCount,
      };
      if (section === "notifications") {
        return Response.json(
          {
            user,
            activeView,
            counts,
            notifications: notificationData.notifications,
            unreadNotificationCount: notificationData.unreadNotificationCount,
            pagination: { notifications: notificationData.pagination },
          },
          { headers: NO_STORE },
        );
      }
      if (section === "applications") {
        const applicationPage = await loadBrandApplicationsForCampaign(user.id, params);
        if (!applicationPage) {
          return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
        }
        return Response.json(
          {
            user,
            activeView,
            counts,
            applications: applicationPage.applications,
            applicationCountsByCampaign: applicationPage.applicationCountsByCampaign,
            applicationPaginationByCampaign: applicationPage.applicationPaginationByCampaign,
            unreadNotificationCount: notificationData.unreadNotificationCount,
            pagination: { applications: applicationPage.pagination },
          },
          { headers: NO_STORE },
        );
      }

      const campaignPage = await loadBrandCampaignPage(user.id, params);
      const groupedApplications = await loadBrandApplicationsForCampaignPage(
        user.id,
        campaignPage.rawCampaigns.map((campaign) => campaign.id),
        params,
      );
      return Response.json(
        {
          user,
          activeView,
          counts,
          campaigns: campaignPage.campaigns,
          applications: groupedApplications.applications,
          applicationCountsByCampaign: groupedApplications.applicationCountsByCampaign,
          applicationPaginationByCampaign: groupedApplications.applicationPaginationByCampaign,
          ...(includeNotifications
            ? { notifications: notificationData.notifications, unreadNotificationCount: notificationData.unreadNotificationCount }
            : { unreadNotificationCount: notificationData.unreadNotificationCount }),
          pagination: {
            campaigns: campaignPage.pagination,
            ...(includeNotifications ? { notifications: notificationData.pagination } : {}),
          },
        },
        { headers: NO_STORE },
      );
    }

    if (section === "campaigns") throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
    const counts = {
      ...(await loadCreatorCounts(user.id)),
      notifications: notificationData.notificationTotal,
      unreadNotifications: notificationData.unreadNotificationCount,
    };
    const [contactProfile] = await db
      .select()
      .from(creators)
      .where(eq(creators.userId, user.id))
      .orderBy(desc(creators.createdAt), desc(creators.id))
      .limit(1);
    const response: Record<string, unknown> = {
      user,
      activeView,
      counts,
      applicationContactOptions: applicationContactOptions(user, contactProfile).map((option) => option.value),
      unreadNotificationCount: notificationData.unreadNotificationCount,
      pagination: {},
    };
    const pagination: Record<string, PaginationMeta | undefined> = {};

    if (!section || section === "profiles") {
      const profilePage = await loadCreatorProfiles(user.id, params);
      response.profiles = profilePage.profiles;
      pagination.profiles = profilePage.pagination;
    }
    if (!section || section === "applications") {
      const applicationPage = await loadCreatorApplications(user.id, params);
      response.applications = applicationPage.applications;
      pagination.applications = applicationPage.pagination;
    }
    if (!section || section === "openCampaigns") {
      const openPage = await loadOpenCampaigns(user.id, params);
      response.openCampaigns = openPage.openCampaigns;
      pagination.openCampaigns = openPage.pagination;
    }
    if (includeNotifications) {
      response.notifications = notificationData.notifications;
      pagination.notifications = notificationData.pagination;
    }
    response.pagination = pagination;
    return Response.json(response, { headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE);
    }
    if (isListingQueryError(e)) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    }
    console.error(e);
    return Response.json({ error: "Could not load dashboard", code: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}
