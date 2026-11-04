import { cache } from "react";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { campaigns, creators } from "@/backend/db/schema";
import { parseUuid } from "@/backend/validation";
import {
  allConditions,
  cursorCondition,
  cursorKeysForResponse,
  decodeCursor,
  paginateRows,
  parseListingParams,
  parseNormalizedParam,
  resolveCursorValues,
  scopeFrom,
  searchCondition,
  sortOrder,
  textExpression,
  tokenListCondition,
  type PaginationMeta,
  type SortKey,
} from "@/backend/pagination";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/backend/social-url";
import {
  normalizeCategory,
  normalizeContentType,
  normalizeContentTypeList,
  normalizeLanguage,
  normalizeLanguageList,
  normalizePlatform,
  normalizePromotionType,
} from "@/shared/constants";

export type PublicCampaignDetail = {
  id: string;
  businessName: string;
  title: string;
  promotionType: string;
  category: string | null;
  description: string | null;
  location: string | null;
  language: string;
  targetAudience: string | null;
  format: string;
  website: string | null;
  status: string;
  verificationStatus: string;
  deadlineAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export type PublicCreatorDetail = {
  id: string;
  name: string;
  instagram: string | null;
  youtube: string | null;
  profileUrl: string | null;
  platform: string;
  followers: number;
  category: string;
  languages: string;
  location: string | null;
  contentTypes: string;
  bio: string | null;
  status: string;
  verificationStatus: string;
  listedAt: string;
  createdAt: string;
};

export type PublicCampaignListItem = PublicCampaignDetail;

export type PublicCreatorListItem = PublicCreatorDetail & {
  verifiedFollowers: number | null;
};

function serializeDate(value: Date | string): string {
  return new Date(value).toISOString();
}

type PublicCreatorRow = {
  id: string;
  name: string;
  instagram: string | null;
  youtube: string | null;
  profileUrl: string | null;
  platform: string;
  followers: number;
  verifiedFollowers: number | null;
  category: string | null;
  languages: string;
  location: string | null;
  contentTypes: string;
  bio: string | null;
  status: string;
  verificationStatus: string;
  listedAt: Date | null;
  createdAt: Date;
};

/**
 * Canonicalize and fail closed on one creator row before it is exposed
 * publicly. The SQL queries already require approved + verified + category,
 * but a legacy row can still carry a display taxonomy value, an out-of-range
 * follower count, or only profile links that no longer pass the write-time
 * public-host rules. Detail, list, and homepage reads share this gate so a
 * card never links to a creator detail page that correctly returns 404.
 */
function toPublicCreator(row: PublicCreatorRow): PublicCreatorDetail | null {
  const category = normalizeCategory(row.category);
  const languages = normalizeLanguageList(row.languages) ?? [];
  const contentTypes = normalizeContentTypeList(row.contentTypes) ?? [];
  const platform = normalizePlatform(row.platform);
  const followers = row.verifiedFollowers ?? row.followers;
  if (
    !category ||
    !platform ||
    languages.length === 0 ||
    contentTypes.length === 0 ||
    !Number.isSafeInteger(followers) ||
    followers < 0 ||
    followers > 100_000_000
  ) {
    return null;
  }

  const instagram = normalizeInstagramUrl(row.instagram);
  const youtube = normalizeYouTubeUrl(row.youtube);
  const profileUrl = normalizeProfileUrl(row.profileUrl, platform);
  if (!(profileUrl ?? instagram ?? youtube)) return null;

  return {
    id: row.id,
    name: row.name,
    instagram,
    youtube,
    profileUrl,
    platform,
    // Public cards show the count checked during review, not the raw claim.
    followers,
    category,
    languages: languages.join(", "),
    location: row.location,
    contentTypes: contentTypes.join(", "),
    bio: row.bio,
    status: row.status,
    verificationStatus: row.verificationStatus,
    listedAt: serializeDate(row.listedAt ?? row.createdAt),
    createdAt: serializeDate(row.createdAt),
  };
}

/** Exact public-detail eligibility for an already-loaded campaign row. */
export function isCampaignPubliclyLive(
  row: { status: string; verificationStatus: string; expiresAt: Date | string },
  now: Date = new Date(),
): boolean {
  return row.status === "open" && row.verificationStatus === "verified" && new Date(row.expiresAt).getTime() > now.getTime();
}

/** Exact public-detail eligibility for an already-loaded creator row. */
export function isCreatorPubliclyLive(row: PublicCreatorRow): boolean {
  return row.status === "approved" && row.verificationStatus === "verified" && row.category !== null && toPublicCreator(row) !== null;
}

/**
 * Load one campaign for its public detail page. The query deliberately
 * selects only public fields and fails closed unless the campaign is both
 * open and verified. Budget and brand contact details are never selected.
 */
export const getPublicCampaignDetail = cache(async (rawId: string): Promise<PublicCampaignDetail | null> => {
  const id = parseUuid(rawId);
  if (!id) return null;

  const [row] = await db
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
      deadlineAt: campaigns.deadlineAt,
      expiresAt: campaigns.expiresAt,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, id),
        eq(campaigns.status, "open"),
        eq(campaigns.verificationStatus, "verified"),
        gt(campaigns.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;

  return {
    ...row,
    website: normalizeProfileUrl(row.website, "Instagram"),
    promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
    category: normalizeCategory(row.category) ?? row.category,
    language: normalizeLanguage(row.language) ?? row.language,
    format: normalizeContentType(row.format) ?? row.format,
    deadlineAt: row.deadlineAt ? serializeDate(row.deadlineAt) : null,
    expiresAt: serializeDate(row.expiresAt),
    createdAt: serializeDate(row.createdAt),
  };
});

/**
 * Load one creator for its public detail page. As with the list endpoint,
 * only an approved, verified and complete profile is public, and private
 * email/phone fields are never selected.
 */
export const getPublicCreatorDetail = cache(async (rawId: string): Promise<PublicCreatorDetail | null> => {
  const id = parseUuid(rawId);
  if (!id) return null;

  const [row] = await db
    .select({
      id: creators.id,
      name: creators.name,
      instagram: creators.instagram,
      youtube: creators.youtube,
      profileUrl: creators.profileUrl,
      platform: creators.platform,
      followers: creators.followers,
      verifiedFollowers: creators.verifiedFollowers,
      category: creators.category,
      languages: creators.languages,
      location: creators.location,
      contentTypes: creators.contentTypes,
      bio: creators.bio,
      status: creators.status,
      verificationStatus: creators.verificationStatus,
      listedAt: creators.listedAt,
      createdAt: creators.createdAt,
    })
    .from(creators)
    .where(
      and(
        eq(creators.id, id),
        eq(creators.status, "approved"),
        eq(creators.verificationStatus, "verified"),
        isNotNull(creators.category),
      ),
    )
    .limit(1);
  if (!row) return null;

  return toPublicCreator(row);
});

const PUBLIC_CAMPAIGN_SORTS = [
  "newest",
  "oldest",
  "title",
  "business",
  "budget_desc",
  "budget_asc",
  "city",
  "language",
] as const;

type PublicCampaignSortRow = {
  id: string;
  title: string;
  businessName: string;
  budget: number;
  location: string | null;
  language: string;
  createdAt: Date;
};

function publicCampaignSortKeys(sort: string): Array<SortKey<PublicCampaignSortRow>> {
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
    case "budget_desc":
      return [
        { expression: sql`${campaigns.budget}`, direction: "desc", kind: "number", value: (row) => row.budget, sensitive: true },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "budget_asc":
      return [
        { expression: sql`${campaigns.budget}`, direction: "asc", kind: "number", value: (row) => row.budget, sensitive: true },
        { expression: sql`${campaigns.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "city":
      return [
        { expression: sql`lower(coalesce(${campaigns.location}, ''))`, direction: "asc", kind: "string", value: (row) => (row.location ?? "").toLocaleLowerCase("en-US") },
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "language":
      return [
        { expression: sql`lower(${campaigns.language})`, direction: "asc", kind: "string", value: (row) => row.language.toLocaleLowerCase("en-US") },
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

/**
 * Public campaign listing used by both the JSON API and server-rendered
 * pages. Budget and brand contact details are owner-only and never returned.
 */
export async function listPublicCampaigns(
  params: URLSearchParams,
): Promise<{ campaigns: PublicCampaignListItem[]; pagination: PaginationMeta }> {
    const listing = parseListingParams(params, {
      defaultLimit: 50,
      defaultSort: "newest",
      allowedSorts: PUBLIC_CAMPAIGN_SORTS,
    });
    const language = parseNormalizedParam(params, "language", normalizeLanguage, { aliases: ["lang"] });
    const category = parseNormalizedParam(params, "category", normalizeCategory);
    const promotionType = parseNormalizedParam(params, "promotionType", normalizePromotionType, { aliases: ["type"] });
    const format = parseNormalizedParam(params, "format", normalizeContentType, { aliases: ["contentType"] });

    const textSearch = searchCondition(
      [
        textExpression(sql`${campaigns.title}`),
        textExpression(sql`${campaigns.businessName}`),
        textExpression(sql`${campaigns.description}`),
        textExpression(sql`${campaigns.location}`),
        textExpression(sql`${campaigns.targetAudience}`),
        textExpression(sql`${campaigns.promotionType}`),
        textExpression(sql`${campaigns.category}`),
        textExpression(sql`${campaigns.language}`),
        textExpression(sql`${campaigns.format}`),
        textExpression(sql`${campaigns.website}`),
      ],
      listing.q,
    );
    const aliasSearch = [
      normalizePromotionType(listing.q) ? eq(campaigns.promotionType, normalizePromotionType(listing.q)!) : undefined,
      normalizeCategory(listing.q) ? eq(campaigns.category, normalizeCategory(listing.q)!) : undefined,
      normalizeLanguage(listing.q) ? eq(campaigns.language, normalizeLanguage(listing.q)!) : undefined,
      normalizeContentType(listing.q) ? eq(campaigns.format, normalizeContentType(listing.q)!) : undefined,
    ].filter(Boolean);
    const search = textSearch && aliasSearch.length
      ? sql`(${textSearch} or ${sql.join(aliasSearch.map((condition) => sql`${condition}`), sql` or `)})`
      : textSearch;

    const scope = scopeFrom({
      listing: "public-campaigns",
      q: listing.q,
      language,
      category,
      promotionType,
      format,
    });
    const keys = publicCampaignSortKeys(listing.sort);
    const now = new Date();
    const baseWhere = allConditions([
      // Fail closed: pending, paused, rejected, suspended, closed, expired
      // and unverified campaigns stay private. The expiry predicate also
      // hides a stale "open" row before its lazy status transition runs.
      eq(campaigns.status, "open"),
      eq(campaigns.verificationStatus, "verified"),
      gt(campaigns.expiresAt, now),
      language ? eq(campaigns.language, language) : undefined,
      category ? eq(campaigns.category, category) : undefined,
      promotionType ? eq(campaigns.promotionType, promotionType) : undefined,
      format ? eq(campaigns.format, format) : undefined,
      search,
    ]);
    // Budget ordering must not put the exact private budget in the opaque
    // cursor. Sensitive budget sorts return only the boundary campaign ID;
    // resolve its sort tuple server-side inside this same public scope.
    const cursorIdKey: SortKey<PublicCampaignSortRow> = {
      expression: sql`${campaigns.id}`,
      direction: listing.sort === "budget_asc" ? "asc" : "desc",
      kind: "uuid",
      value: (row) => row.id,
    };
    const cursorValues = await resolveCursorValues(listing.cursor, {
      sort: listing.sort,
      scope,
      keys,
      idKey: cursorIdKey,
      loadBoundary: async (id) => {
        const [row] = await db
          .select({
            id: campaigns.id,
            title: campaigns.title,
            businessName: campaigns.businessName,
            budget: campaigns.budget,
            location: campaigns.location,
            language: campaigns.language,
            createdAt: campaigns.createdAt,
          })
          .from(campaigns)
          .where(allConditions([baseWhere, eq(campaigns.id, id)]))
          .limit(1);
        return row;
      },
    });
    const responseKeys = cursorKeysForResponse(keys, cursorIdKey);
    const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);

    const [[totalRow], rowsWithExtra] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(baseWhere),
      db
        .select({
          id: campaigns.id,
          businessName: campaigns.businessName,
          title: campaigns.title,
          promotionType: campaigns.promotionType,
          category: campaigns.category,
          description: campaigns.description,
          budget: campaigns.budget,
          location: campaigns.location,
          language: campaigns.language,
          targetAudience: campaigns.targetAudience,
          format: campaigns.format,
          website: campaigns.website,
          status: campaigns.status,
          verificationStatus: campaigns.verificationStatus,
          deadlineAt: campaigns.deadlineAt,
          expiresAt: campaigns.expiresAt,
          createdAt: campaigns.createdAt,
        })
        .from(campaigns)
        .where(pageWhere)
        .orderBy(...sortOrder(keys))
        .limit(listing.limit + 1),
    ]);
    const { items, pagination } = paginateRows(rowsWithExtra, {
      limit: listing.limit,
      total: Number(totalRow?.count ?? 0),
      sort: listing.sort,
      scope,
      keys: responseKeys,
    });
    const canonicalRows = items.map((row) => {
      // Budget is selected only so the server can offer budget ordering; the
      // exact owner-only amount must never be serialized in a public row.
      const { budget: _budget, ...publicRow } = row;
      return {
        ...publicRow,
        // Apply the write-time public-host/profile rules again on read so a
        // legacy private or non-profile destination is not republished.
        website: normalizeProfileUrl(row.website, "Instagram"),
        promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
        category: normalizeCategory(row.category) ?? row.category,
        language: normalizeLanguage(row.language) ?? row.language,
        format: normalizeContentType(row.format) ?? row.format,
        deadlineAt: row.deadlineAt ? serializeDate(row.deadlineAt) : null,
        expiresAt: serializeDate(row.expiresAt),
        createdAt: serializeDate(row.createdAt),
      };
    });
    return { campaigns: canonicalRows, pagination };
}

const PUBLIC_CREATOR_SORTS = [
  "newest",
  "oldest",
  "name",
  "followers_desc",
  "followers_asc",
  "city",
  "language",
] as const;

type PublicCreatorSortRow = {
  id: string;
  name: string;
  followers: number;
  verifiedFollowers: number | null;
  location: string | null;
  languages: string;
  listedAt: Date | null;
  createdAt: Date;
};

function publicCreatorSortKeys(sort: string): Array<SortKey<PublicCreatorSortRow>> {
  const effectiveFollowers = sql`coalesce(${creators.verifiedFollowers}, ${creators.followers})`;
  const effectiveListedAt = sql`coalesce(${creators.listedAt}, ${creators.createdAt})`;
  const listedValue = (row: PublicCreatorSortRow) => row.listedAt ?? row.createdAt;
  switch (sort) {
    case "oldest":
      return [
        { expression: effectiveListedAt, direction: "asc", kind: "date", value: listedValue },
        { expression: sql`${creators.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "name":
      return [
        { expression: sql`lower(${creators.name})`, direction: "asc", kind: "string", value: (row) => row.name.toLocaleLowerCase("en-US") },
        { expression: effectiveListedAt, direction: "desc", kind: "date", value: listedValue },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "followers_desc":
      return [
        { expression: effectiveFollowers, direction: "desc", kind: "number", value: (row) => row.verifiedFollowers ?? row.followers },
        { expression: effectiveListedAt, direction: "desc", kind: "date", value: listedValue },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "followers_asc":
      return [
        { expression: effectiveFollowers, direction: "asc", kind: "number", value: (row) => row.verifiedFollowers ?? row.followers },
        { expression: effectiveListedAt, direction: "asc", kind: "date", value: listedValue },
        { expression: sql`${creators.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "city":
      return [
        { expression: sql`lower(coalesce(${creators.location}, ''))`, direction: "asc", kind: "string", value: (row) => (row.location ?? "").toLocaleLowerCase("en-US") },
        { expression: effectiveListedAt, direction: "desc", kind: "date", value: listedValue },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "language":
      return [
        { expression: sql`lower(${creators.languages})`, direction: "asc", kind: "string", value: (row) => row.languages.toLocaleLowerCase("en-US") },
        { expression: effectiveListedAt, direction: "desc", kind: "date", value: listedValue },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: effectiveListedAt, direction: "desc", kind: "date", value: listedValue },
        { expression: sql`${creators.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

/**
 * Public creator listing used by both the JSON API and server-rendered
 * pages. Private creator email/phone fields are never selected.
 */
export async function listPublicCreators(
  params: URLSearchParams,
): Promise<{ creators: PublicCreatorListItem[]; pagination: PaginationMeta }> {
    const listing = parseListingParams(params, {
      defaultLimit: 50,
      defaultSort: "newest",
      allowedSorts: PUBLIC_CREATOR_SORTS,
    });
    const language = parseNormalizedParam(params, "language", normalizeLanguage, { aliases: ["lang"] });
    const category = parseNormalizedParam(params, "category", normalizeCategory);
    const platform = parseNormalizedParam(params, "platform", normalizePlatform);
    const contentType = parseNormalizedParam(params, "contentType", normalizeContentType, { aliases: ["format"] });

    const textSearch = searchCondition(
      [
        textExpression(sql`${creators.name}`),
        textExpression(sql`${creators.category}`),
        textExpression(sql`${creators.languages}`),
        textExpression(sql`${creators.location}`),
        textExpression(sql`${creators.contentTypes}`),
        textExpression(sql`${creators.bio}`),
        textExpression(sql`${creators.platform}`),
        textExpression(sql`${creators.instagram}`),
        textExpression(sql`${creators.youtube}`),
        textExpression(sql`${creators.profileUrl}`),
      ],
      listing.q,
    );
    const aliasSearch = [
      normalizeCategory(listing.q) ? eq(creators.category, normalizeCategory(listing.q)!) : undefined,
      normalizePlatform(listing.q) ? eq(creators.platform, normalizePlatform(listing.q)!) : undefined,
      normalizeLanguage(listing.q)
        ? tokenListCondition(sql`${creators.languages}`, normalizeLanguage(listing.q)!)
        : undefined,
      normalizeContentType(listing.q)
        ? tokenListCondition(sql`${creators.contentTypes}`, normalizeContentType(listing.q)!)
        : undefined,
    ].filter(Boolean);
    const search = textSearch && aliasSearch.length
      ? sql`(${textSearch} or ${sql.join(aliasSearch.map((condition) => sql`${condition}`), sql` or `)})`
      : textSearch;

    const scope = scopeFrom({
      listing: "public-creators",
      q: listing.q,
      language,
      category,
      platform,
      contentType,
    });
    const keys = publicCreatorSortKeys(listing.sort);
    const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
    const baseWhere = allConditions([
      // Fail closed: a profile is public only after an admin has approved it
      // and verified ownership of the linked social account.
      eq(creators.status, "approved"),
      eq(creators.verificationStatus, "verified"),
      // Category is required profile information; do not republish a legacy
      // low-information row that predates that completion rule.
      isNotNull(creators.category),
      language ? tokenListCondition(sql`${creators.languages}`, language) : undefined,
      category ? eq(creators.category, category) : undefined,
      platform ? eq(creators.platform, platform) : undefined,
      contentType ? tokenListCondition(sql`${creators.contentTypes}`, contentType) : undefined,
      search,
    ]);
    const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);

    const [[totalRow], rowsWithExtra] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(creators).where(baseWhere),
      db
        .select({
          id: creators.id,
          name: creators.name,
          instagram: creators.instagram,
          youtube: creators.youtube,
          profileUrl: creators.profileUrl,
          platform: creators.platform,
          followers: creators.followers,
          verifiedFollowers: creators.verifiedFollowers,
          category: creators.category,
          languages: creators.languages,
          location: creators.location,
          contentTypes: creators.contentTypes,
          bio: creators.bio,
          status: creators.status,
          verificationStatus: creators.verificationStatus,
          listedAt: creators.listedAt,
          createdAt: creators.createdAt,
        })
        .from(creators)
        .where(pageWhere)
        .orderBy(...sortOrder(keys))
        .limit(listing.limit + 1),
    ]);
    const { items, pagination } = paginateRows(rowsWithExtra, {
      limit: listing.limit,
      total: Number(totalRow?.count ?? 0),
      sort: listing.sort,
      scope,
      keys,
    });
    const canonicalRows = items.flatMap((row) => {
      const creator = toPublicCreator(row);
      return creator ? [{ ...creator, verifiedFollowers: row.verifiedFollowers }] : [];
    });
    return {
      creators: canonicalRows,
      // `total` still comes from the SQL publication predicates. The JS
      // fail-closed gate above can hide a rare legacy row whose links or
      // taxonomy no longer validate, so report the number actually returned
      // while keeping the cursor based on the last SQL row in this page.
      pagination: { ...pagination, returned: canonicalRows.length },
    };
}

export interface PublicSitemapEntry {
  id: string;
  lastModified: Date;
}

/**
 * IDs and update times for the XML sitemap. This repeats the detail-page
 * fail-closed publication gates; a URL is never advertised merely because a
 * row exists. The limits keep one sitemap below the 50,000-URL protocol cap.
 */
export async function listPublicSitemapEntries(): Promise<{
  campaigns: PublicSitemapEntry[];
  creators: PublicSitemapEntry[];
}> {
  const [campaignRows, creatorRows] = await Promise.all([
    db
      .select({ id: campaigns.id, lastModified: campaigns.updatedAt })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, "open"),
          eq(campaigns.verificationStatus, "verified"),
          gt(campaigns.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(campaigns.updatedAt))
      .limit(20_000),
    db
      .select({
        id: creators.id,
        instagram: creators.instagram,
        youtube: creators.youtube,
        profileUrl: creators.profileUrl,
        platform: creators.platform,
        followers: creators.followers,
        verifiedFollowers: creators.verifiedFollowers,
        category: creators.category,
        languages: creators.languages,
        contentTypes: creators.contentTypes,
        lastModified: creators.updatedAt,
      })
      .from(creators)
      .where(
        and(
          eq(creators.status, "approved"),
          eq(creators.verificationStatus, "verified"),
          isNotNull(creators.category),
        ),
      )
      .orderBy(desc(creators.updatedAt))
      .limit(20_000),
  ]);

  const publicCreators = creatorRows.filter((row) => {
    const category = normalizeCategory(row.category);
    const languages = normalizeLanguageList(row.languages) ?? [];
    const contentTypes = normalizeContentTypeList(row.contentTypes) ?? [];
    const platform = normalizePlatform(row.platform);
    const followers = row.verifiedFollowers ?? row.followers;
    if (
      !category ||
      !platform ||
      languages.length === 0 ||
      contentTypes.length === 0 ||
      !Number.isSafeInteger(followers) ||
      followers < 0 ||
      followers > 100_000_000
    ) {
      return false;
    }

    return Boolean(
      normalizeProfileUrl(row.profileUrl, platform) ??
        normalizeInstagramUrl(row.instagram) ??
        normalizeYouTubeUrl(row.youtube),
    );
  });

  return {
    campaigns: campaignRows,
    creators: publicCreators.map(({ id, lastModified }) => ({ id, lastModified })),
  };
}
