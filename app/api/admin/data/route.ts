import { logRouteError } from "@/backend/observability";
import { db } from "@/backend/db";
import { adminAuditLogs, applications, auditEvents, brands, campaigns, contacts, creators, reports, userSessions, users } from "@/backend/db/schema";
import { requireMonolithAdminAccess } from "@/backend/admin-access";
import {
  adminIdentityUnavailableResponse,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { logAdminAudit } from "@/backend/admin-audit";
import { attachApplicationStatusHistory } from "@/backend/application-history";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  APPLICATION_STATUSES,
  CAMPAIGN_REVIEW_STATUSES,
  CREATOR_REVIEW_STATUSES,
  REPORT_REASONS,
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
import { USER_ROLES } from "@/shared/user-roles";
import { alias } from "drizzle-orm/pg-core";
import { parseCreatorProfileSnapshot } from "@/backend/application-snapshot";
import { expireOverdueCampaigns } from "@/backend/campaign-lifecycle";
import { getCampaignExpiryPolicy } from "@/backend/platform-settings";
import { getSiteAvailabilitySettings } from "@/backend/site-availability";
import { effectiveSiteAvailability } from "@/shared/site-availability";
import { isCampaignPubliclyLive, isCreatorPubliclyLive } from "@/backend/public-listings";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const ADMIN_ENTITIES = ["campaigns", "creators", "applications", "contacts", "reports", "auditLogs", "activity", "users", "brands"] as const;
type AdminEntity = (typeof ADMIN_ENTITIES)[number];

const CAMPAIGN_SORTS = ["review", "newest", "oldest", "title", "budget_desc", "budget_asc", "status"] as const;
const CREATOR_SORTS = ["review", "newest", "oldest", "name", "followers_desc", "followers_asc", "status"] as const;
const APPLICATION_SORTS = ["newest", "oldest", "updated", "status"] as const;
const CONTACT_SORTS = ["newest", "oldest", "name", "kind"] as const;
const REPORT_SORTS = ["triage", "newest", "oldest", "status"] as const;
const AUDIT_SORTS = ["newest", "oldest", "action", "outcome"] as const;
const ACTIVITY_SORTS = ["newest", "oldest", "action"] as const;
const ACTIVITY_ENTITY_TYPES = ["user", "brand", "creator_profile", "campaign", "application", "report", "contact", "setting"] as const;
const ACTIVITY_ACTOR_TYPES = ["user", "admin", "system"] as const;
const USER_SORTS = ["newest", "oldest", "name", "email", "role"] as const;
const BRAND_SORTS = ["newest", "oldest", "name", "status"] as const;
const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
const REPORT_TARGET_TYPES = ["campaign", "creator"] as const;
const CONTACT_KINDS = ["brand", "creator", "other"] as const;
const AUDIT_OUTCOMES = ["success", "failure"] as const;

type CampaignSortRow = { id: string; title: string; budget: number; status: string; createdAt: Date };
type CreatorSortRow = { id: string; name: string; followers: number; status: string; listedAt: Date | null; createdAt: Date };
type ApplicationSortRow = { application: { id: string; status: string; createdAt: Date; updatedAt: Date } };
type ContactSortRow = { id: string; name: string; kind: string; createdAt: Date };
type ReportSortRow = { report: { id: string; status: string; createdAt: Date } };
type AuditSortRow = { id: string; action: string; outcome: string; createdAt: Date };
type ActivitySortRow = { event: { id: string; action: string; createdAt: Date } };

const activityActorUsers = alias(users, "activity_actor_users");
const activityOwnerUsers = alias(users, "activity_owner_users");
type UserSortRow = { id: string; name: string; email: string; role: string; createdAt: Date };
type BrandSortRow = { brand: { id: string; name: string; status: string; createdAt: Date } };

function canonicalCampaign<T extends { promotionType: string; category: string | null; language: string; format: string }>(row: T) {
  return {
    ...row,
    promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
    category: normalizeCategory(row.category) ?? row.category,
    language: normalizeLanguage(row.language) ?? row.language,
    format: normalizeContentType(row.format) ?? row.format,
  };
}

function canonicalCreator<T extends { platform: string; category: string | null; languages: string; contentTypes: string }>(row: T) {
  return {
    ...row,
    platform: normalizePlatform(row.platform) ?? row.platform,
    category: normalizeCategory(row.category) ?? row.category,
    languages: row.languages ? (normalizeLanguageList(row.languages, true) ?? []).join(", ") : row.languages,
    contentTypes: row.contentTypes ? (normalizeContentTypeList(row.contentTypes, true) ?? []).join(", ") : row.contentTypes,
  };
}

async function loadAdminCounts() {
  const [
    [campaignsRow],
    [creatorsRow],
    [applicationsRow],
    [contactsRow],
    [reportsRow],
    [auditLogsRow],
    [activityRow],
    [expiredCampaignsRow],
    [usersRow],
    [brandsRow],
    [pendingCampaignsRow],
    [pendingCreatorsRow],
    [openReportsRow],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns),
    db.select({ count: sql<number>`count(*)::int` }).from(creators),
    db.select({ count: sql<number>`count(*)::int` }).from(applications),
    db.select({ count: sql<number>`count(*)::int` }).from(contacts),
    db.select({ count: sql<number>`count(*)::int` }).from(reports),
    db.select({ count: sql<number>`count(*)::int` }).from(adminAuditLogs),
    db.select({ count: sql<number>`count(*)::int` }).from(auditEvents),
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(eq(campaigns.status, "expired")),
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(brands),
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(eq(campaigns.status, "pending")),
    db.select({ count: sql<number>`count(*)::int` }).from(creators).where(eq(creators.status, "pending")),
    db.select({ count: sql<number>`count(*)::int` }).from(reports).where(eq(reports.status, "open")),
  ]);
  const pendingCampaigns = Number(pendingCampaignsRow?.count ?? 0);
  const pendingCreators = Number(pendingCreatorsRow?.count ?? 0);
  return {
    campaigns: Number(campaignsRow?.count ?? 0),
    creators: Number(creatorsRow?.count ?? 0),
    applications: Number(applicationsRow?.count ?? 0),
    contacts: Number(contactsRow?.count ?? 0),
    reports: Number(reportsRow?.count ?? 0),
    auditLogs: Number(auditLogsRow?.count ?? 0),
    activity: Number(activityRow?.count ?? 0),
    activityEvents: Number(activityRow?.count ?? 0),
    expiredCampaigns: Number(expiredCampaignsRow?.count ?? 0),
    users: Number(usersRow?.count ?? 0),
    brands: Number(brandsRow?.count ?? 0),
    pendingCampaigns,
    pendingCreators,
    pendingReviews: pendingCampaigns + pendingCreators,
    openReports: Number(openReportsRow?.count ?? 0),
  };
}

function campaignSortKeys(sort: string): Array<SortKey<CampaignSortRow>> {
  switch (sort) {
    case "newest":
      return [
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
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
        {
          expression: sql`case when ${campaigns.status} = 'pending' then 0 else 1 end`,
          direction: "asc",
          kind: "number",
          value: (row) => (row.status === "pending" ? 0 : 1),
        },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

async function loadCampaigns(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "review", allowedSorts: CAMPAIGN_SORTS });
  const status = parseEnumParam(params, "status", CAMPAIGN_REVIEW_STATUSES);
  const verificationStatus = parseEnumParam(params, "verificationStatus", VERIFICATION_STATUSES);
  const language = parseNormalizedParam(params, "language", normalizeLanguage, { aliases: ["lang"] });
  const category = parseNormalizedParam(params, "category", normalizeCategory);
  const promotionType = parseNormalizedParam(params, "promotionType", normalizePromotionType, { aliases: ["type"] });
  const format = parseNormalizedParam(params, "format", normalizeContentType, { aliases: ["contentType"] });
  const scope = scopeFrom({ listing: "admin-campaigns", q: listing.q, status, verificationStatus, language, category, promotionType, format });
  const keys = campaignSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${campaigns.id}`),
      textExpression(sql`${campaigns.ownerId}`),
      textExpression(sql`${campaigns.brandId}`),
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
      textExpression(sql`${campaigns.verificationCode}`),
      textExpression(sql`${campaigns.moderationNote}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
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
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  return {
    rows: page.items.map((row) => ({ ...canonicalCampaign(row), publicLive: isCampaignPubliclyLive(row) })),
    pagination: page.pagination,
  };
}

function creatorSortKeys(sort: string): Array<SortKey<CreatorSortRow>> {
  switch (sort) {
    case "newest":
      return [
        { expression: sql`coalesce(${creators.listedAt}, ${creators.createdAt})`, direction: "desc", kind: "date", value: (row) => row.listedAt ?? row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "oldest":
      return [
        { expression: sql`coalesce(${creators.listedAt}, ${creators.createdAt})`, direction: "asc", kind: "date", value: (row) => row.listedAt ?? row.createdAt },
        { expression: sql`${creators.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "name":
      return [
        { expression: sql`lower(${creators.name})`, direction: "asc", kind: "string", value: (row) => row.name.toLocaleLowerCase("en-US") },
        { expression: sql`coalesce(${creators.listedAt}, ${creators.createdAt})`, direction: "desc", kind: "date", value: (row) => row.listedAt ?? row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "followers_desc":
      return [
        { expression: sql`${creators.followers}`, direction: "desc", kind: "number", value: (row) => row.followers },
        { expression: sql`coalesce(${creators.listedAt}, ${creators.createdAt})`, direction: "desc", kind: "date", value: (row) => row.listedAt ?? row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "followers_asc":
      return [
        { expression: sql`${creators.followers}`, direction: "asc", kind: "number", value: (row) => row.followers },
        { expression: sql`coalesce(${creators.listedAt}, ${creators.createdAt})`, direction: "asc", kind: "date", value: (row) => row.listedAt ?? row.createdAt },
        { expression: sql`${creators.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "status":
      return [
        { expression: sql`${creators.status}`, direction: "asc", kind: "string", value: (row) => row.status },
        { expression: sql`coalesce(${creators.listedAt}, ${creators.createdAt})`, direction: "desc", kind: "date", value: (row) => row.listedAt ?? row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        {
          expression: sql`case when ${creators.status} = 'pending' then 0 else 1 end`,
          direction: "asc",
          kind: "number",
          value: (row) => (row.status === "pending" ? 0 : 1),
        },
        { expression: sql`coalesce(${creators.listedAt}, ${creators.createdAt})`, direction: "desc", kind: "date", value: (row) => row.listedAt ?? row.createdAt },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

async function loadCreators(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "review", allowedSorts: CREATOR_SORTS });
  const status = parseEnumParam(params, "status", CREATOR_REVIEW_STATUSES);
  const verificationStatus = parseEnumParam(params, "verificationStatus", VERIFICATION_STATUSES);
  const category = parseNormalizedParam(params, "category", normalizeCategory);
  const language = parseNormalizedParam(params, "language", normalizeLanguage, { aliases: ["lang"] });
  const platform = parseNormalizedParam(params, "platform", normalizePlatform);
  const contentType = parseNormalizedParam(params, "contentType", normalizeContentType, { aliases: ["format"] });
  const scope = scopeFrom({ listing: "admin-creators", q: listing.q, status, verificationStatus, category, language, platform, contentType });
  const keys = creatorSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${creators.id}`),
      textExpression(sql`${creators.userId}`),
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
      textExpression(sql`${creators.verificationCode}`),
      textExpression(sql`${creators.moderationNote}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
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
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  return {
    rows: page.items.map((row) => ({ ...canonicalCreator(row), publicLive: isCreatorPubliclyLive(row) })),
    pagination: page.pagination,
  };
}

function applicationSortKeys(sort: string): Array<SortKey<ApplicationSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${applications.createdAt}`, direction: "asc", kind: "date", value: (row) => row.application.createdAt },
        { expression: sql`${applications.id}`, direction: "asc", kind: "uuid", value: (row) => row.application.id },
      ];
    case "updated":
      return [
        { expression: sql`${applications.updatedAt}`, direction: "desc", kind: "date", value: (row) => row.application.updatedAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.application.id },
      ];
    case "status":
      return [
        { expression: sql`${applications.status}`, direction: "asc", kind: "string", value: (row) => row.application.status },
        { expression: sql`${applications.createdAt}`, direction: "desc", kind: "date", value: (row) => row.application.createdAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.application.id },
      ];
    default:
      return [
        { expression: sql`${applications.createdAt}`, direction: "desc", kind: "date", value: (row) => row.application.createdAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.application.id },
      ];
  }
}

async function loadApplications(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "newest", allowedSorts: APPLICATION_SORTS });
  const status = parseEnumParam(params, "status", APPLICATION_STATUSES);
  const campaignId = parseUuidParam(params, "campaignId");
  const creatorId = parseUuidParam(params, "creatorId");
  const userId = parseUuidParam(params, "userId");
  const scope = scopeFrom({ listing: "admin-applications", q: listing.q, status, campaignId, creatorId, userId });
  const keys = applicationSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${applications.id}`),
      textExpression(sql`${applications.campaignId}`),
      textExpression(sql`${applications.userId}`),
      textExpression(sql`${applications.creatorId}`),
      textExpression(sql`${applications.creatorName}`),
      textExpression(sql`${applications.creatorContact}`),
      textExpression(sql`${applications.message}`),
      textExpression(sql`${applications.proposedTimeline}`),
      textExpression(sql`${applications.quoteAmount}`),
      textExpression(sql`${applications.decisionNote}`),
      textExpression(sql`${applications.status}`),
      textExpression(sql`${campaigns.title}`),
      textExpression(sql`${campaigns.businessName}`),
      textExpression(sql`${creators.name}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    status ? eq(applications.status, status) : undefined,
    campaignId ? eq(applications.campaignId, campaignId) : undefined,
    creatorId ? eq(applications.creatorId, creatorId) : undefined,
    userId ? eq(applications.userId, userId) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${applications.id})::int` })
      .from(applications)
      .leftJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .leftJoin(creators, eq(applications.creatorId, creators.id))
      .where(baseWhere),
    db
      .select({ application: applications, campaignTitle: campaigns.title, campaignBusinessName: campaigns.businessName, creatorLabel: creators.name })
      .from(applications)
      .leftJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .leftJoin(creators, eq(applications.creatorId, creators.id))
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  return {
    rows: await attachApplicationStatusHistory(
      page.items.map(({ application, campaignTitle, campaignBusinessName, creatorLabel }) => ({
        ...application,
        creatorProfileSnapshot: parseCreatorProfileSnapshot(application.creatorProfileSnapshot),
        campaignLabel: campaignTitle ? `${campaignTitle} (${campaignBusinessName ?? ""})` : null,
        campaignMissing: campaignTitle === null,
        creatorLabel: creatorLabel ?? application.creatorName,
        currentCreatorProfile: creatorLabel
          ? { id: application.creatorId, name: creatorLabel }
          : null,
      })),
    ),
    pagination: page.pagination,
  };
}

function contactSortKeys(sort: string): Array<SortKey<ContactSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${contacts.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${contacts.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "name":
      return [
        { expression: sql`lower(${contacts.name})`, direction: "asc", kind: "string", value: (row) => row.name.toLocaleLowerCase("en-US") },
        { expression: sql`${contacts.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${contacts.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "kind":
      return [
        { expression: sql`${contacts.kind}`, direction: "asc", kind: "string", value: (row) => row.kind },
        { expression: sql`${contacts.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${contacts.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${contacts.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${contacts.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

async function loadContacts(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "newest", allowedSorts: CONTACT_SORTS });
  const kind = parseEnumParam(params, "kind", CONTACT_KINDS, { aliases: ["status"] });
  const scope = scopeFrom({ listing: "admin-contacts", q: listing.q, kind });
  const keys = contactSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${contacts.id}`),
      textExpression(sql`${contacts.name}`),
      textExpression(sql`${contacts.email}`),
      textExpression(sql`${contacts.phone}`),
      textExpression(sql`${contacts.kind}`),
      textExpression(sql`${contacts.message}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([kind ? eq(contacts.kind, kind) : undefined, search]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(baseWhere),
    db.select().from(contacts).where(pageWhere).orderBy(...sortOrder(keys)).limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  return { rows: page.items, pagination: page.pagination };
}

function reportSortKeys(sort: string): Array<SortKey<ReportSortRow>> {
  switch (sort) {
    case "newest":
      return [
        { expression: sql`${reports.createdAt}`, direction: "desc", kind: "date", value: (row) => row.report.createdAt },
        { expression: sql`${reports.id}`, direction: "desc", kind: "uuid", value: (row) => row.report.id },
      ];
    case "oldest":
      return [
        { expression: sql`${reports.createdAt}`, direction: "asc", kind: "date", value: (row) => row.report.createdAt },
        { expression: sql`${reports.id}`, direction: "asc", kind: "uuid", value: (row) => row.report.id },
      ];
    case "status":
      return [
        { expression: sql`${reports.status}`, direction: "asc", kind: "string", value: (row) => row.report.status },
        { expression: sql`${reports.createdAt}`, direction: "desc", kind: "date", value: (row) => row.report.createdAt },
        { expression: sql`${reports.id}`, direction: "desc", kind: "uuid", value: (row) => row.report.id },
      ];
    default:
      return [
        {
          expression: sql`case when ${reports.status} = 'open' then 0 else 1 end`,
          direction: "asc",
          kind: "number",
          value: (row) => (row.report.status === "open" ? 0 : 1),
        },
        { expression: sql`${reports.createdAt}`, direction: "desc", kind: "date", value: (row) => row.report.createdAt },
        { expression: sql`${reports.id}`, direction: "desc", kind: "uuid", value: (row) => row.report.id },
      ];
  }
}

async function loadReports(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "triage", allowedSorts: REPORT_SORTS });
  const status = parseEnumParam(params, "status", REPORT_STATUSES);
  const targetType = parseEnumParam(params, "targetType", REPORT_TARGET_TYPES);
  const reason = parseEnumParam(params, "reason", REPORT_REASONS);
  const scope = scopeFrom({ listing: "admin-reports", q: listing.q, status, targetType, reason });
  const keys = reportSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${reports.id}`),
      textExpression(sql`${reports.targetType}`),
      textExpression(sql`${reports.targetId}`),
      textExpression(sql`${reports.reporterUserId}`),
      textExpression(sql`${reports.reporterName}`),
      textExpression(sql`${reports.reporterContact}`),
      textExpression(sql`${reports.reason}`),
      textExpression(sql`${reports.details}`),
      textExpression(sql`${reports.status}`),
      textExpression(sql`${reports.adminNote}`),
      textExpression(sql`${campaigns.title}`),
      textExpression(sql`${campaigns.businessName}`),
      textExpression(sql`${creators.name}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    status ? eq(reports.status, status) : undefined,
    targetType ? eq(reports.targetType, targetType) : undefined,
    reason ? eq(reports.reason, reason) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const campaignJoin = and(eq(reports.targetType, "campaign"), eq(reports.targetId, campaigns.id));
  const creatorJoin = and(eq(reports.targetType, "creator"), eq(reports.targetId, creators.id));
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${reports.id})::int` })
      .from(reports)
      .leftJoin(campaigns, campaignJoin)
      .leftJoin(creators, creatorJoin)
      .where(baseWhere),
    db
      .select({
        report: reports,
        campaignTitle: campaigns.title,
        campaignBusinessName: campaigns.businessName,
        creatorName: creators.name,
      })
      .from(reports)
      .leftJoin(campaigns, campaignJoin)
      .leftJoin(creators, creatorJoin)
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  return {
    rows: page.items.map(({ report, campaignTitle, campaignBusinessName, creatorName }) => {
      const targetLabel =
        report.targetType === "campaign"
          ? campaignTitle
            ? `${campaignTitle} (${campaignBusinessName ?? ""})`
            : null
          : creatorName;
      return { ...report, targetLabel, targetMissing: targetLabel === null };
    }),
    pagination: page.pagination,
  };
}

function auditSortKeys(sort: string): Array<SortKey<AuditSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${adminAuditLogs.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${adminAuditLogs.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "action":
      return [
        { expression: sql`lower(${adminAuditLogs.action})`, direction: "asc", kind: "string", value: (row) => row.action.toLocaleLowerCase("en-US") },
        { expression: sql`${adminAuditLogs.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${adminAuditLogs.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "outcome":
      return [
        { expression: sql`${adminAuditLogs.outcome}`, direction: "asc", kind: "string", value: (row) => row.outcome },
        { expression: sql`${adminAuditLogs.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${adminAuditLogs.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${adminAuditLogs.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${adminAuditLogs.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

async function loadAuditLogs(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "newest", allowedSorts: AUDIT_SORTS });
  const outcome = parseEnumParam(params, "outcome", AUDIT_OUTCOMES, { aliases: ["status"] });
  const entityRaw = params.get("entityFilter") ?? params.get("targetEntity");
  const entityFilter = entityRaw?.trim() ? entityRaw.trim().slice(0, 60) : null;
  const scope = scopeFrom({ listing: "admin-audit-logs", q: listing.q, outcome, entityFilter });
  const keys = auditSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${adminAuditLogs.id}`),
      textExpression(sql`${adminAuditLogs.action}`),
      textExpression(sql`${adminAuditLogs.outcome}`),
      textExpression(sql`${adminAuditLogs.entity}`),
      textExpression(sql`${adminAuditLogs.entityId}`),
      textExpression(sql`${adminAuditLogs.details}`),
      textExpression(sql`${adminAuditLogs.ipAddress}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    outcome ? eq(adminAuditLogs.outcome, outcome) : undefined,
    entityFilter ? eq(adminAuditLogs.entity, entityFilter) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(adminAuditLogs).where(baseWhere),
    db.select().from(adminAuditLogs).where(pageWhere).orderBy(...sortOrder(keys)).limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  return { rows: page.items, pagination: page.pagination };
}

function activitySortKeys(sort: string): Array<SortKey<ActivitySortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${auditEvents.createdAt}`, direction: "asc", kind: "date", value: (row) => row.event.createdAt },
        { expression: sql`${auditEvents.id}`, direction: "asc", kind: "uuid", value: (row) => row.event.id },
      ];
    case "action":
      return [
        { expression: sql`lower(${auditEvents.action})`, direction: "asc", kind: "string", value: (row) => row.event.action.toLocaleLowerCase("en-US") },
        { expression: sql`${auditEvents.createdAt}`, direction: "desc", kind: "date", value: (row) => row.event.createdAt },
        { expression: sql`${auditEvents.id}`, direction: "desc", kind: "uuid", value: (row) => row.event.id },
      ];
    default:
      return [
        { expression: sql`${auditEvents.createdAt}`, direction: "desc", kind: "date", value: (row) => row.event.createdAt },
        { expression: sql`${auditEvents.id}`, direction: "desc", kind: "uuid", value: (row) => row.event.id },
      ];
  }
}

async function loadActivity(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "newest", allowedSorts: ACTIVITY_SORTS });
  const entityType = parseEnumParam(params, "entityType", ACTIVITY_ENTITY_TYPES, { aliases: ["status", "filter"] });
  const actorType = parseEnumParam(params, "actorType", ACTIVITY_ACTOR_TYPES, { aliases: ["verificationStatus"] });
  const entityId = parseUuidParam(params, "entityId");
  const actorUserId = parseUuidParam(params, "actorUserId");
  const ownerUserId = parseUuidParam(params, "ownerUserId");
  const scope = scopeFrom({ listing: "admin-activity", q: listing.q, entityType, actorType, entityId, actorUserId, ownerUserId });
  const keys = activitySortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${auditEvents.id}`),
      textExpression(sql`${auditEvents.actorType}`),
      textExpression(sql`${auditEvents.actorUserId}`),
      textExpression(sql`${auditEvents.ownerUserId}`),
      textExpression(sql`${auditEvents.entityType}`),
      textExpression(sql`${auditEvents.entityId}`),
      textExpression(sql`${auditEvents.action}`),
      textExpression(sql`${auditEvents.fromStatus}`),
      textExpression(sql`${auditEvents.toStatus}`),
      textExpression(sql`${auditEvents.changedFields}`),
      textExpression(sql`${auditEvents.metadata}`),
      textExpression(sql`${activityActorUsers.name}`),
      textExpression(sql`${activityActorUsers.email}`),
      textExpression(sql`${activityOwnerUsers.name}`),
      textExpression(sql`${activityOwnerUsers.email}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    entityType ? eq(auditEvents.entityType, entityType) : undefined,
    actorType ? eq(auditEvents.actorType, actorType) : undefined,
    entityId ? eq(auditEvents.entityId, entityId) : undefined,
    actorUserId ? eq(auditEvents.actorUserId, actorUserId) : undefined,
    ownerUserId ? eq(auditEvents.ownerUserId, ownerUserId) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${auditEvents.id})::int` })
      .from(auditEvents)
      .leftJoin(activityActorUsers, eq(auditEvents.actorUserId, activityActorUsers.id))
      .leftJoin(activityOwnerUsers, eq(auditEvents.ownerUserId, activityOwnerUsers.id))
      .where(baseWhere),
    db
      .select({
        event: auditEvents,
        actorName: activityActorUsers.name,
        actorEmail: activityActorUsers.email,
        ownerName: activityOwnerUsers.name,
        ownerEmail: activityOwnerUsers.email,
      })
      .from(auditEvents)
      .leftJoin(activityActorUsers, eq(auditEvents.actorUserId, activityActorUsers.id))
      .leftJoin(activityOwnerUsers, eq(auditEvents.ownerUserId, activityOwnerUsers.id))
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  return {
    rows: page.items.map(({ event, actorName, actorEmail, ownerName, ownerEmail }) => ({
      ...event,
      actorName,
      actorEmail,
      ownerName,
      ownerEmail,
    })),
    pagination: page.pagination,
  };
}

function userSortKeys(sort: string): Array<SortKey<UserSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${users.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${users.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "name":
      return [
        { expression: sql`lower(${users.name})`, direction: "asc", kind: "string", value: (row) => row.name.toLocaleLowerCase("en-US") },
        { expression: sql`${users.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${users.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "email":
      return [
        { expression: sql`lower(${users.email})`, direction: "asc", kind: "string", value: (row) => row.email.toLocaleLowerCase("en-US") },
        { expression: sql`${users.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${users.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "role":
      return [
        { expression: sql`${users.role}`, direction: "asc", kind: "string", value: (row) => row.role },
        { expression: sql`${users.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${users.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${users.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${users.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

async function loadUsers(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "newest", allowedSorts: USER_SORTS });
  const role = parseEnumParam(params, "role", USER_ROLES, { aliases: ["filter"] });
  const emailVerification = parseEnumParam(params, "verificationStatus", ["verified", "unverified"], { aliases: ["emailVerified"] });
  const scope = scopeFrom({ listing: "admin-users", q: listing.q, role, emailVerification });
  const keys = userSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${users.id}`),
      textExpression(sql`${users.name}`),
      textExpression(sql`${users.email}`),
      textExpression(sql`${users.phone}`),
      textExpression(sql`${users.role}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([
    role ? eq(users.role, role) : undefined,
    emailVerification === "verified" ? sql`${users.emailVerifiedAt} is not null` : undefined,
    emailVerification === "unverified" ? isNull(users.emailVerifiedAt) : undefined,
    search,
  ]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(baseWhere),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  const ids = page.items.map((row) => row.id);
  if (ids.length === 0) return { rows: [], pagination: page.pagination };

  const now = new Date();
  const [campaignCounts, applicationCounts, sessionCounts, brandRows, creatorRows] = await Promise.all([
    db.select({ userId: campaigns.ownerId, count: sql<number>`count(*)::int` }).from(campaigns).where(inArray(campaigns.ownerId, ids)).groupBy(campaigns.ownerId),
    db.select({ userId: applications.userId, count: sql<number>`count(*)::int` }).from(applications).where(inArray(applications.userId, ids)).groupBy(applications.userId),
    db
      .select({ userId: userSessions.userId, count: sql<number>`count(*)::int` })
      .from(userSessions)
      .where(and(inArray(userSessions.userId, ids), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)))
      .groupBy(userSessions.userId),
    db.select({ id: brands.id, userId: brands.userId, status: brands.status }).from(brands).where(inArray(brands.userId, ids)),
    db
      .select({ id: creators.id, userId: creators.userId, status: creators.status, verificationStatus: creators.verificationStatus })
      .from(creators)
      .where(inArray(creators.userId, ids)),
  ]);
  const campaignCountByUser = new Map(campaignCounts.map((row) => [row.userId, Number(row.count ?? 0)]));
  const applicationCountByUser = new Map(applicationCounts.map((row) => [row.userId, Number(row.count ?? 0)]));
  const sessionCountByUser = new Map(sessionCounts.map((row) => [row.userId, Number(row.count ?? 0)]));
  const brandByUser = new Map(brandRows.map((row) => [row.userId, row]));
  const creatorByUser = new Map(creatorRows.map((row) => [row.userId, row]));

  return {
    rows: page.items.map((row) => {
      const brand = brandByUser.get(row.id);
      const creator = creatorByUser.get(row.id);
      return {
        ...row,
        campaignCount: campaignCountByUser.get(row.id) ?? 0,
        applicationCount: applicationCountByUser.get(row.id) ?? 0,
        activeSessionCount: sessionCountByUser.get(row.id) ?? 0,
        hasBrandProfile: Boolean(brand),
        brandProfileId: brand?.id ?? null,
        brandStatus: brand?.status ?? null,
        creatorProfile: creator ? { id: creator.id, status: creator.status, verificationStatus: creator.verificationStatus } : null,
      };
    }),
    pagination: page.pagination,
  };
}

function brandSortKeys(sort: string): Array<SortKey<BrandSortRow>> {
  switch (sort) {
    case "oldest":
      return [
        { expression: sql`${brands.createdAt}`, direction: "asc", kind: "date", value: (row) => row.brand.createdAt },
        { expression: sql`${brands.id}`, direction: "asc", kind: "uuid", value: (row) => row.brand.id },
      ];
    case "name":
      return [
        { expression: sql`lower(${brands.name})`, direction: "asc", kind: "string", value: (row) => row.brand.name.toLocaleLowerCase("en-US") },
        { expression: sql`${brands.createdAt}`, direction: "desc", kind: "date", value: (row) => row.brand.createdAt },
        { expression: sql`${brands.id}`, direction: "desc", kind: "uuid", value: (row) => row.brand.id },
      ];
    case "status":
      return [
        { expression: sql`${brands.status}`, direction: "asc", kind: "string", value: (row) => row.brand.status },
        { expression: sql`${brands.createdAt}`, direction: "desc", kind: "date", value: (row) => row.brand.createdAt },
        { expression: sql`${brands.id}`, direction: "desc", kind: "uuid", value: (row) => row.brand.id },
      ];
    default:
      return [
        { expression: sql`${brands.createdAt}`, direction: "desc", kind: "date", value: (row) => row.brand.createdAt },
        { expression: sql`${brands.id}`, direction: "desc", kind: "uuid", value: (row) => row.brand.id },
      ];
  }
}

async function loadBrands(params: URLSearchParams) {
  const listing = parseListingParams(params, { defaultLimit: 50, defaultSort: "newest", allowedSorts: BRAND_SORTS });
  const status = parseEnumParam(params, "status", ["active"]);
  const scope = scopeFrom({ listing: "admin-brands", q: listing.q, status });
  const keys = brandSortKeys(listing.sort);
  const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
  const search = searchCondition(
    [
      textExpression(sql`${brands.id}`),
      textExpression(sql`${brands.userId}`),
      textExpression(sql`${brands.name}`),
      textExpression(sql`${brands.email}`),
      textExpression(sql`${brands.phone}`),
      textExpression(sql`${brands.status}`),
      textExpression(sql`${users.name}`),
      textExpression(sql`${users.email}`),
      textExpression(sql`${users.phone}`),
      textExpression(sql`${users.role}`),
    ],
    listing.q,
  );
  const baseWhere = allConditions([status ? eq(brands.status, status) : undefined, search]);
  const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);
  const [[totalRow], rowsWithExtra] = await Promise.all([
    db.select({ count: sql<number>`count(distinct ${brands.id})::int` }).from(brands).innerJoin(users, eq(brands.userId, users.id)).where(baseWhere),
    db
      .select({
        brand: brands,
        accountName: users.name,
        accountEmail: users.email,
        accountPhone: users.phone,
        accountRole: users.role,
        accountEmailVerifiedAt: users.emailVerifiedAt,
        accountCreatedAt: users.createdAt,
      })
      .from(brands)
      .innerJoin(users, eq(brands.userId, users.id))
      .where(pageWhere)
      .orderBy(...sortOrder(keys))
      .limit(listing.limit + 1),
  ]);
  const page = paginateRows(rowsWithExtra, { limit: listing.limit, total: Number(totalRow?.count ?? 0), sort: listing.sort, scope, keys });
  const userIds = [...new Set(page.items.map((row) => row.brand.userId))];
  if (userIds.length === 0) return { rows: [], pagination: page.pagination };

  const [campaignCounts, receivedCounts] = await Promise.all([
    db.select({ userId: campaigns.ownerId, count: sql<number>`count(*)::int` }).from(campaigns).where(inArray(campaigns.ownerId, userIds)).groupBy(campaigns.ownerId),
    db
      .select({ userId: campaigns.ownerId, count: sql<number>`count(distinct ${applications.id})::int` })
      .from(applications)
      .innerJoin(campaigns, eq(applications.campaignId, campaigns.id))
      .where(inArray(campaigns.ownerId, userIds))
      .groupBy(campaigns.ownerId),
  ]);
  const campaignCountByUser = new Map(campaignCounts.map((row) => [row.userId, Number(row.count ?? 0)]));
  const receivedCountByUser = new Map(receivedCounts.map((row) => [row.userId, Number(row.count ?? 0)]));

  return {
    rows: page.items.map(({ brand, ...account }) => ({
      ...brand,
      // The brand row's copied contacts are a legacy mirror; the linked
      // account is canonical for admin/display and future account edits.
      email: account.accountEmail,
      phone: account.accountPhone,
      ...account,
      campaignCount: campaignCountByUser.get(brand.userId) ?? 0,
      applicationsReceivedCount: receivedCountByUser.get(brand.userId) ?? 0,
    })),
    pagination: page.pagination,
  };
}

type AdminPage = { rows: Array<Record<string, unknown>>; pagination: PaginationMeta };

async function loadAdminEntity(entity: AdminEntity, params: URLSearchParams): Promise<AdminPage> {
  const page =
    entity === "campaigns"
      ? await loadCampaigns(params)
      : entity === "creators"
        ? await loadCreators(params)
        : entity === "applications"
          ? await loadApplications(params)
          : entity === "contacts"
            ? await loadContacts(params)
            : entity === "reports"
              ? await loadReports(params)
              : entity === "users"
                ? await loadUsers(params)
                  : entity === "brands"
                  ? await loadBrands(params)
                  : entity === "activity"
                    ? await loadActivity(params)
                    : await loadAuditLogs(params);
  return page as AdminPage;
}

const EXPORT_MAX_ROWS = 10_000;
const EXPORT_PAGE_SIZE = 100;

function csvValue(value: unknown): string {
  let text: string;
  if (value == null) text = "";
  else if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") text = String(value);
  else text = JSON.stringify(value) ?? "";
  // Neutralize spreadsheet formulas in user-controlled text. A leading
  // apostrophe is visible in the CSV but keeps Excel/Sheets from executing
  // the cell as a formula when an admin opens the export.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  if (columns.length === 0) return "\uFEFF";
  const lines = [columns.map(csvValue).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvValue(row[column])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

async function exportAdminEntity(req: Request, entity: AdminEntity, params: URLSearchParams): Promise<Response> {
  const pageParams = new URLSearchParams(params);
  pageParams.delete("format");
  pageParams.set("limit", String(EXPORT_PAGE_SIZE));
  pageParams.delete("cursor");

  const rows: Array<Record<string, unknown>> = [];
  let total = 0;
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < EXPORT_MAX_ROWS / EXPORT_PAGE_SIZE; pageIndex += 1) {
    if (cursor) pageParams.set("cursor", cursor);
    else pageParams.delete("cursor");
    const page = await loadAdminEntity(entity, pageParams);
    total = page.pagination.total;
    if (total > EXPORT_MAX_ROWS) {
      return Response.json(
        { error: "This export is too large. Narrow the search or filters and try again.", code: "export_too_large" },
        { status: 413, headers: NO_STORE },
      );
    }
    rows.push(...page.rows);
    if (!page.pagination.hasMore || !page.pagination.nextCursor) break;
    cursor = page.pagination.nextCursor;
  }
  if (rows.length < total) {
    return Response.json(
      { error: "This export is too large. Narrow the search or filters and try again.", code: "export_too_large" },
      { status: 413, headers: NO_STORE },
    );
  }

  await logAdminAudit(req, {
    action: "admin.export",
    entity,
    details: { rows: rows.length, total, format: "csv" },
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(rowsToCsv(rows), {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="yaarlink-admin-${entity}-${date}.csv"`,
    },
  });
}

// Owner-only: one bounded, searchable admin collection per request plus exact
// aggregate counts for every collection. Full rows include budgets/contacts.
export async function GET(req: Request) {
  try {
    if (!(await requireMonolithAdminAccess(req))) return Response.json({ error: "Not allowed", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    const params = new URL(req.url).searchParams;
    const rawEntity = params.get("entity")?.trim() || "campaigns";
    const entity = (rawEntity === "audit" ? "auditLogs" : rawEntity) as AdminEntity;
    if (!ADMIN_ENTITIES.includes(entity)) throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");

    await expireOverdueCampaigns();

    const format = params.get("format")?.trim().toLowerCase();
    if (format) {
      if (format !== "csv") throw new ListingQueryError("invalid_filter", "Please choose a valid filter.");
      return await exportAdminEntity(req, entity, params);
    }

    const page = await loadAdminEntity(entity, params);
    const [counts, platformSettings, siteAvailabilitySettings] = await Promise.all([
      loadAdminCounts(),
      getCampaignExpiryPolicy(),
      getSiteAvailabilitySettings(),
    ]);
    return Response.json(
      {
        entity,
        [entity]: page.rows,
        pagination: page.pagination,
        counts,
        platformSettings,
        siteAvailability: effectiveSiteAvailability(siteAvailabilitySettings),
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (isAdminIdentityUnavailableError(e)) {
      logAdminIdentityUnavailable(e, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    if (isListingQueryError(e)) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    }
    logRouteError(req, e);
    return Response.json({ error: "Could not load data", code: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}
