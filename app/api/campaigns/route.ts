import { db } from "@/backend/db";
import { campaigns, type Campaign } from "@/backend/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSessionUser, type SessionUser } from "@/backend/auth";
import { createVerificationCode, isUuid } from "@/backend/moderation";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { normalizeProfileUrl } from "@/backend/social-url";
import { normalizeCategory, normalizeContentType, normalizeLanguage, normalizePromotionType } from "@/shared/constants";
import {
  allConditions,
  cursorCondition,
  decodeCursor,
  isListingQueryError,
  paginateRows,
  parseListingParams,
  parseNormalizedParam,
  scopeFrom,
  searchCondition,
  sortOrder,
  textExpression,
  type SortKey,
} from "@/backend/pagination";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const CAMPAIGN_FIELDS = [
  "businessName",
  "contactName",
  "email",
  "phone",
  "title",
  "promotionType",
  "category",
  "description",
  "budget",
  "location",
  "language",
  "targetAudience",
  "format",
  "website",
] as const;

type CampaignValues = {
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  title: string;
  promotionType: string;
  category: string | null;
  description: string | null;
  budget: number;
  location: string | null;
  language: string;
  targetAudience: string | null;
  format: string;
  website: string | null;
};

type ParseResult = { ok: true; values: CampaignValues } | { ok: false; error: string; code: string };

function bodyRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasField(body: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function parseCampaign(body: Record<string, unknown>, user: SessionUser, current?: Campaign): ParseResult {
  const businessName = optionalText(hasField(body, "businessName") ? body.businessName : current?.businessName, 120);
  const title = optionalText(hasField(body, "title") ? body.title : current?.title, 160);
  if (!businessName || !title) return { ok: false, error: "Business name and title required", code: "campaign_required_fields" };

  const rawEmail = hasField(body, "email") ? body.email : current?.email;
  const emailInput = rawEmail == null ? "" : String(rawEmail).toLowerCase().trim();
  const email = emailInput || (current && hasField(body, "email") ? null : user.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email.", code: "invalid_email" };

  const rawWebsite = hasField(body, "website") ? body.website : current?.website;
  let website: string | null = null;
  if (rawWebsite) {
    website = normalizeProfileUrl(rawWebsite, "Instagram");
    if (!website) return { ok: false, error: "Please enter a valid website or Instagram URL.", code: "invalid_website" };
    website = website.slice(0, 200);
  }

  const rawBudget = hasField(body, "budget") ? body.budget : current?.budget;
  const budget = Math.round(Number(rawBudget));
  if (!Number.isFinite(budget) || budget < 500 || budget > 10_000_000) {
    return { ok: false, error: "Please enter a budget between ₹500 and ₹1,00,00,000.", code: "invalid_budget" };
  }

  const rawPromotionType = hasField(body, "promotionType") ? body.promotionType : current?.promotionType;
  const hasPromotionType = !(rawPromotionType == null || (typeof rawPromotionType === "string" && !rawPromotionType.trim()));
  const promotionType = hasPromotionType ? normalizePromotionType(rawPromotionType) : "Product";
  if (!promotionType) return { ok: false, error: "Please choose a valid promotion type.", code: "invalid_promotion_type" };

  const rawCategory = hasField(body, "category") ? body.category : current?.category;
  const hasCategory = !(rawCategory == null || (typeof rawCategory === "string" && !rawCategory.trim()));
  const category = hasCategory ? normalizeCategory(rawCategory) : null;
  if (hasCategory && !category) return { ok: false, error: "Please choose a valid category.", code: "invalid_category" };

  const rawLanguage = hasField(body, "language") ? body.language : current?.language;
  const hasLanguage = !(rawLanguage == null || (typeof rawLanguage === "string" && !rawLanguage.trim()));
  const language = hasLanguage ? normalizeLanguage(rawLanguage) : "English";
  if (!language) return { ok: false, error: "Please choose a valid language.", code: "invalid_language" };

  const rawFormat = hasField(body, "format") ? body.format : current?.format;
  const hasFormat = !(rawFormat == null || (typeof rawFormat === "string" && !rawFormat.trim()));
  const format = hasFormat ? normalizeContentType(rawFormat) : "Story";
  if (!format) return { ok: false, error: "Please choose a valid format.", code: "invalid_format" };

  return {
    ok: true,
    values: {
      businessName,
      contactName: optionalText(hasField(body, "contactName") ? body.contactName : current?.contactName, 100),
      email: email ? email.slice(0, 120) : null,
      phone: optionalText(hasField(body, "phone") ? body.phone : current?.phone, 20),
      title,
      promotionType,
      category,
      description: optionalText(hasField(body, "description") ? body.description : current?.description, 2000),
      budget,
      location: optionalText(hasField(body, "location") ? body.location : current?.location, 100),
      language,
      targetAudience: optionalText(hasField(body, "targetAudience") ? body.targetAudience : current?.targetAudience, 300),
      format,
      website,
    },
  };
}

const returningCampaign = {
  id: campaigns.id,
  title: campaigns.title,
  status: campaigns.status,
  verificationCode: campaigns.verificationCode,
  verificationStatus: campaigns.verificationStatus,
  updatedAt: campaigns.updatedAt,
};

async function requireBrand() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return { error: Response.json({ error: "Please log in as a brand to manage campaigns.", code: "unauthorized" }, { status: 401, headers: NO_STORE }) };
  if (user.role !== "brand") return { error: Response.json({ error: "Only brand accounts can manage campaigns.", code: "forbidden" }, { status: 403, headers: NO_STORE }) };
  return { user };
}

const PUBLIC_CAMPAIGN_SORTS = ["newest", "oldest", "title", "business"] as const;

type PublicCampaignSortRow = {
  id: string;
  title: string;
  businessName: string;
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
    default:
      return [
        { expression: sql`${campaigns.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${campaigns.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

// Public listing: budget and brand contact details are owner-only and never sent to users.
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
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
    const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
    const baseWhere = allConditions([
      // Fail closed: pending, paused, rejected, suspended, closed, and
      // unverified campaigns stay private.
      eq(campaigns.status, "open"),
      eq(campaigns.verificationStatus, "verified"),
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
    const canonicalRows = items.map((row) => ({
      ...row,
      promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
      category: normalizeCategory(row.category) ?? row.category,
      language: normalizeLanguage(row.language) ?? row.language,
      format: normalizeContentType(row.format) ?? row.format,
    }));
    // Campaign openness is application-critical state; never let a browser
    // or intermediary reuse a stale public listing after pause/close.
    return Response.json({ campaigns: canonicalRows, pagination }, { headers: NO_STORE });
  } catch (e) {
    if (isListingQueryError(e)) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    }
    console.error(e);
    return Response.json(
      { error: "Could not load campaigns", code: "load_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "campaign-create"), 5, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const body = bodyRecord(await req.json().catch(() => null));
    if (!body) return Response.json({ error: "Invalid campaign", code: "invalid_request" }, { status: 400, headers: NO_STORE });
    const auth = await requireBrand();
    if (auth.error) return auth.error;

    const parsed = parseCampaign(body, auth.user);
    if (!parsed.ok) return Response.json({ error: parsed.error, code: parsed.code }, { status: 400, headers: NO_STORE });

    const [row] = await db
      .insert(campaigns)
      .values({
        ownerId: auth.user.id,
        ...parsed.values,
        status: "pending",
        verificationCode: createVerificationCode(),
        verificationStatus: "pending",
        moderationNote: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .returning(returningCampaign);
    return Response.json({ campaign: row }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not create campaign", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

/**
 * Owner campaign edit and lifecycle transitions. Material public-content
 * edits return the campaign to review; pausing is the reversible owner-only
 * state that preserves an already completed verification.
 */
export async function PATCH(req: Request) {
  const rl = await rateLimit(getClientKey(req, "campaign-manage"), 30, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const body = bodyRecord(await req.json().catch(() => null));
    if (!body || !isUuid(body.id)) return Response.json({ error: "Invalid campaign", code: "invalid_target" }, { status: 400, headers: NO_STORE });
    const id = body.id;

    const auth = await requireBrand();
    if (auth.error) return auth.error;

    const [existing] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
      .limit(1);
    if (!existing) return Response.json({ error: "Campaign not found.", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    const now = new Date();

    if (hasField(body, "action")) {
      const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
      let update: Partial<Campaign> | null = null;

      if (action === "pause") {
        if (existing.status !== "open") return Response.json({ error: "Only an open campaign can be paused.", code: "campaign_must_be_open_to_pause" }, { status: 409, headers: NO_STORE });
        update = { status: "paused", updatedAt: now };
      } else if (action === "close") {
        if (existing.status === "closed") return Response.json({ error: "This campaign is already closed.", code: "campaign_already_closed" }, { status: 409, headers: NO_STORE });
        update = { status: "closed", updatedAt: now };
      } else if (action === "republish") {
        if (existing.status === "paused") {
          if (existing.verificationStatus !== "verified") {
            return Response.json({ error: "This campaign must finish verification before it can be republished.", code: "campaign_verification_required" }, { status: 409, headers: NO_STORE });
          }
          update = { status: "open", updatedAt: now };
        } else if (existing.status === "closed" || existing.status === "rejected") {
          update = {
            status: "pending",
            moderationNote: null,
            reviewedAt: null,
            updatedAt: now,
            ...(existing.verificationStatus === "verified"
              ? {}
              : {
                  verificationCode: existing.verificationCode ?? createVerificationCode(),
                  verificationStatus: "pending",
                }),
          };
        } else {
          return Response.json({ error: "This campaign cannot be republished from its current status.", code: "campaign_cannot_republish" }, { status: 409, headers: NO_STORE });
        }
      } else {
        return Response.json({ error: "Invalid campaign action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
      }

      const [row] = await db
        .update(campaigns)
        .set(update)
        .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id), eq(campaigns.status, existing.status)))
        .returning(returningCampaign);
      if (!row) return Response.json({ error: "This campaign changed while you were editing it. Please refresh and try again.", code: "campaign_changed" }, { status: 409, headers: NO_STORE });
      return Response.json({ campaign: row }, { headers: NO_STORE });
    }

    if (!CAMPAIGN_FIELDS.some((field) => hasField(body, field))) {
      return Response.json({ error: "No campaign changes were provided.", code: "no_changes" }, { status: 400, headers: NO_STORE });
    }

    const parsed = parseCampaign(body, auth.user, existing);
    if (!parsed.ok) return Response.json({ error: parsed.error, code: parsed.code }, { status: 400, headers: NO_STORE });

    const materialFields: Array<keyof CampaignValues> = [
      "businessName",
      "title",
      "promotionType",
      "category",
      "description",
      "budget",
      "location",
      "language",
      "targetAudience",
      "format",
      "website",
    ];
    // Only submitted public fields can force another review; canonicalizing
    // an untouched legacy value during parsing is not an owner edit.
    const materialChanged = materialFields.some((field) => hasField(body, field) && parsed.values[field] !== existing[field]);
    const contactChanged =
      parsed.values.contactName !== existing.contactName || parsed.values.email !== existing.email || parsed.values.phone !== existing.phone;

    if (!materialChanged && !contactChanged) {
      return Response.json(
        {
          campaign: {
            id: existing.id,
            title: existing.title,
            status: existing.status,
            verificationCode: existing.verificationCode,
            verificationStatus: existing.verificationStatus,
            updatedAt: existing.updatedAt,
          },
          unchanged: true,
        },
        { headers: NO_STORE },
      );
    }

    const [row] = await db
      .update(campaigns)
      .set(
        materialChanged
          ? {
              ...parsed.values,
              updatedAt: now,
              status: "pending",
              verificationCode: createVerificationCode(),
              verificationStatus: "pending",
              moderationNote: null,
              reviewedAt: null,
            }
          : {
              // A private contact update should not rewrite the verified
              // public campaign representation.
              contactName: parsed.values.contactName,
              email: parsed.values.email,
              phone: parsed.values.phone,
              updatedAt: now,
            },
      )
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
      .returning(returningCampaign);
    if (!row) return Response.json({ error: "Campaign not found.", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ campaign: row, reviewRequired: materialChanged }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not update campaign", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  const rl = await rateLimit(getClientKey(req, "campaign-manage"), 30, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const body = bodyRecord(await req.json().catch(() => null));
    const queryId = new URL(req.url).searchParams.get("id");
    const id = body?.id ?? queryId;
    if (!isUuid(id)) return Response.json({ error: "Invalid campaign", code: "invalid_target" }, { status: 400, headers: NO_STORE });

    const auth = await requireBrand();
    if (auth.error) return auth.error;

    const [row] = await db
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
      .returning({ id: campaigns.id });
    if (!row) return Response.json({ error: "Campaign not found.", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not delete campaign", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
