import { db } from "@/backend/db";
import { brands, campaigns, type Campaign } from "@/backend/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionUnavailableResponse, type SessionUser } from "@/backend/auth";
import { createVerificationCode } from "@/backend/moderation";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import {
  hasField,
  parseBudgetField,
  parseEmailField,
  parseExpectedUpdatedAt,
  parseOptionalText,
  parsePhoneField,
  parseRequiredText,
  parseUuid,
  readJsonObject,
  type ValidationResult,
} from "@/backend/validation";
import { hasSuspiciousUrl } from "@/backend/content-moderation";
import { MAX_WEBSITE_URL_LENGTH, normalizeProfileUrl } from "@/backend/social-url";
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

type ParseResult =
  | { ok: true; values: CampaignValues }
  | { ok: false; error: string; code: string; field?: string };

function parseCampaign(body: Record<string, unknown>, user: SessionUser, current?: Campaign): ParseResult {
  const supplied = (field: string) => hasField(body, field);

  const businessName = current && !supplied("businessName")
    ? { ok: true, value: current.businessName } as ValidationResult<string>
    : parseRequiredText(body.businessName, {
        field: "businessName",
        maxLength: 120,
        requiredCode: "campaign_required_fields",
        requiredMessage: "Business name and title required",
      });
  if (!businessName.ok) return businessName;

  const title = current && !supplied("title")
    ? { ok: true, value: current.title } as ValidationResult<string>
    : parseRequiredText(body.title, {
        field: "title",
        maxLength: 160,
        requiredCode: "campaign_required_fields",
        requiredMessage: "Business name and title required",
      });
  if (!title.ok) return title;

  let email: string | null;
  if (supplied("email")) {
    const parsedEmail = parseEmailField(body.email, { field: "email" });
    if (!parsedEmail.ok) return parsedEmail;
    email = parsedEmail.value ?? (current ? null : user.email);
  } else {
    email = current?.email ?? user.email;
  }

  let phone: string | null;
  if (supplied("phone")) {
    const parsedPhone = parsePhoneField(body.phone, { field: "phone" });
    if (!parsedPhone.ok) return parsedPhone;
    phone = parsedPhone.value;
  } else {
    phone = current?.phone ?? null;
  }

  let website: string | null;
  if (supplied("website")) {
    const rawWebsite = body.website;
    if (rawWebsite == null || (typeof rawWebsite === "string" && !rawWebsite.trim())) {
      website = null;
    } else if (typeof rawWebsite !== "string") {
      return { ok: false, error: "Please enter a valid website or Instagram URL.", code: "invalid_website", field: "website" };
    } else {
      website = normalizeProfileUrl(rawWebsite, "Instagram");
      if (!website || website.length > MAX_WEBSITE_URL_LENGTH) {
        return { ok: false, error: "Please enter a valid website or Instagram URL.", code: "invalid_website", field: "website" };
      }
      if (hasSuspiciousUrl(website)) {
        return {
          ok: false,
          error: "Please remove links, contact details, or prohibited content and try again.",
          code: "content_not_allowed",
          field: "website",
        };
      }
    }
  } else {
    website = current?.website ?? null;
  }

  let budget: number;
  if (current && !supplied("budget")) {
    budget = current.budget;
  } else {
    const parsedBudget = parseBudgetField(body.budget);
    if (!parsedBudget.ok) return parsedBudget;
    budget = parsedBudget.value;
  }

  let promotionType: string;
  if (current && !supplied("promotionType")) {
    promotionType = current.promotionType;
  } else if (!supplied("promotionType")) {
    promotionType = "Product";
  } else {
    const normalized = normalizePromotionType(body.promotionType);
    if (!normalized) {
      return { ok: false, error: "Please choose a valid promotion type.", code: "invalid_promotion_type", field: "promotionType" };
    }
    promotionType = normalized;
  }

  let category: string | null;
  if (!supplied("category")) {
    category = current?.category ?? null;
  } else if (body.category == null || (typeof body.category === "string" && !body.category.trim())) {
    category = null;
  } else {
    const normalized = normalizeCategory(body.category);
    if (!normalized) return { ok: false, error: "Please choose a valid category.", code: "invalid_category", field: "category" };
    category = normalized;
  }

  let language: string;
  if (current && !supplied("language")) {
    language = current.language;
  } else if (!supplied("language")) {
    language = "English";
  } else {
    const normalized = normalizeLanguage(body.language);
    if (!normalized) return { ok: false, error: "Please choose a valid language.", code: "invalid_language", field: "language" };
    language = normalized;
  }

  let format: string;
  if (current && !supplied("format")) {
    format = current.format;
  } else if (!supplied("format")) {
    format = "Story";
  } else {
    const normalized = normalizeContentType(body.format);
    if (!normalized) return { ok: false, error: "Please choose a valid format.", code: "invalid_format", field: "format" };
    format = normalized;
  }

  const optionalField = (
    field: "contactName" | "description" | "location" | "targetAudience",
    maxLength: number,
    multiline = false,
  ): ValidationResult<string | null> =>
    current && !supplied(field)
      ? { ok: true, value: current[field] }
      : parseOptionalText(body[field], { field, maxLength, multiline });

  const contactName = optionalField("contactName", 100);
  if (!contactName.ok) return contactName;
  const description = optionalField("description", 2000, true);
  if (!description.ok) return description;
  const location = optionalField("location", 100);
  if (!location.ok) return location;
  const targetAudience = optionalField("targetAudience", 300);
  if (!targetAudience.ok) return targetAudience;

  return {
    ok: true,
    values: {
      businessName: businessName.value,
      contactName: contactName.value,
      email,
      phone,
      title: title.value,
      promotionType,
      category,
      description: description.value,
      budget,
      location: location.value,
      language,
      targetAudience: targetAudience.value,
      format,
      website,
    },
  };
}

function parseSubmissionId(req: Request, body: Record<string, unknown>): ValidationResult<string | null> {
  const headerValue = req.headers.get("idempotency-key");
  const headerId = headerValue == null ? null : parseUuid(headerValue);
  if (headerValue != null && !headerId) {
    return { ok: false, error: "Please send a valid submission ID.", code: "invalid_request", field: "clientRequestId" };
  }

  const bodyId = hasField(body, "clientRequestId") && body.clientRequestId != null ? parseUuid(body.clientRequestId) : null;
  if (hasField(body, "clientRequestId") && body.clientRequestId != null && !bodyId) {
    return { ok: false, error: "Please send a valid submission ID.", code: "invalid_request", field: "clientRequestId" };
  }
  if (headerId && bodyId && headerId !== bodyId) {
    return { ok: false, error: "Please send one valid submission ID.", code: "invalid_request", field: "clientRequestId" };
  }
  return { ok: true, value: headerId ?? bodyId };
}

async function submissionFingerprint(values: CampaignValues): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validationErrorResponse(result: { error: string; code: string; field?: string }, status = 400) {
  return Response.json(
    { error: result.error, code: result.code, ...(result.field ? { field: result.field } : {}) },
    { status, headers: NO_STORE },
  );
}

const returningCampaign = {
  id: campaigns.id,
  title: campaigns.title,
  status: campaigns.status,
  verificationCode: campaigns.verificationCode,
  verificationStatus: campaigns.verificationStatus,
  updatedAt: campaigns.updatedAt,
};

async function requireCampaignManager() {
  const user = await getSessionUser();
  if (!user) return { error: Response.json({ error: "Please log in to manage campaigns.", code: "unauthorized" }, { status: 401, headers: NO_STORE }) };
  // `users.role` is only the preferred starting workspace. Every account may
  // manage its own campaigns; PATCH/DELETE remain scoped by campaign owner.
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
      // Apply the write-time public-host/profile rules again on read so a
      // legacy private or non-profile destination is not republished.
      website: normalizeProfileUrl(row.website, "Instagram"),
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
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

    const auth = await requireCampaignManager();
    if (auth.error) return auth.error;

    const submission = parseSubmissionId(req, body);
    if (!submission.ok) return validationErrorResponse(submission);

    const parsed = parseCampaign(body, auth.user);
    if (!parsed.ok) return validationErrorResponse(parsed);

    // Accounts that started in the creator workspace may not have the legacy
    // one-to-one brand profile row yet. Create it idempotently the first
    // time they post a campaign so exports/account data can represent both
    // sides of the same account.
    await db
      .insert(brands)
      .values({
        userId: auth.user.id,
        name: parsed.values.businessName,
        email: parsed.values.email ?? auth.user.email,
        phone: parsed.values.phone ?? auth.user.phone,
        status: "active",
      })
      .onConflictDoNothing({ target: brands.userId });

    const submissionId = submission.value;
    const fingerprint = submissionId ? await submissionFingerprint(parsed.values) : null;
    const insert = db
      .insert(campaigns)
      .values({
        ownerId: auth.user.id,
        submissionId,
        submissionFingerprint: fingerprint,
        ...parsed.values,
        status: "pending",
        verificationCode: createVerificationCode(),
        verificationStatus: "pending",
        moderationNote: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .returning(returningCampaign);
    const [row] = submissionId
      ? await insert.onConflictDoNothing({ target: [campaigns.ownerId, campaigns.submissionId] })
      : await insert;

    if (row) return Response.json({ campaign: row }, { status: 201, headers: NO_STORE });
    if (!submissionId) throw new Error("campaign insert returned no row");

    const [existing] = await db
      .select({ ...returningCampaign, submissionFingerprint: campaigns.submissionFingerprint })
      .from(campaigns)
      .where(and(eq(campaigns.ownerId, auth.user.id), eq(campaigns.submissionId, submissionId)))
      .limit(1);
    if (!existing) throw new Error("idempotent campaign lookup returned no row");
    if (existing.submissionFingerprint !== fingerprint) {
      return Response.json(
        { error: "This submission ID was already used for a different campaign.", code: "idempotency_key_reused" },
        { status: 409, headers: NO_STORE },
      );
    }

    const { submissionFingerprint: _fingerprint, ...campaign } = existing;
    return Response.json({ campaign, idempotentReplay: true }, { headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE);
    }
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
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    const id = parseUuid(body.id);
    if (!id) return Response.json({ error: "Invalid campaign", code: "invalid_target" }, { status: 400, headers: NO_STORE });

    const auth = await requireCampaignManager();
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

    const expectedUpdatedAt = parseExpectedUpdatedAt(body);
    if (!expectedUpdatedAt.ok) return validationErrorResponse(expectedUpdatedAt);

    type EditOutcome =
      | { kind: "updated"; campaign: typeof returningCampaign extends never ? never : { id: string; title: string; status: string; verificationCode: string | null; verificationStatus: string; updatedAt: Date }; reviewRequired: boolean }
      | { kind: "unchanged"; campaign: Campaign }
      | { kind: "not_found" }
      | { kind: "changed" }
      | { kind: "invalid"; result: Extract<ParseResult, { ok: false }> };

    const outcome: EditOutcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
        .limit(1)
        .for("update");
      if (!locked) return { kind: "not_found" } as const;
      if (expectedUpdatedAt.value && locked.updatedAt.getTime() !== expectedUpdatedAt.value.getTime()) {
        return { kind: "changed" } as const;
      }

      const lockedParsed = parseCampaign(body, auth.user, locked);
      if (!lockedParsed.ok) return { kind: "invalid", result: lockedParsed } as const;

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
      const materialChanged = materialFields.some(
        (field) => hasField(body, field) && lockedParsed.values[field] !== locked[field],
      );
      const contactChanged =
        lockedParsed.values.contactName !== locked.contactName ||
        lockedParsed.values.email !== locked.email ||
        lockedParsed.values.phone !== locked.phone;

      if (!materialChanged && !contactChanged) return { kind: "unchanged", campaign: locked } as const;

      const [row] = await tx
        .update(campaigns)
        .set(
          materialChanged
            ? {
                ...lockedParsed.values,
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
                contactName: lockedParsed.values.contactName,
                email: lockedParsed.values.email,
                phone: lockedParsed.values.phone,
                updatedAt: now,
              },
        )
        .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
        .returning(returningCampaign);
      if (!row) return { kind: "not_found" } as const;
      return { kind: "updated", campaign: row, reviewRequired: materialChanged } as const;
    });

    if (outcome.kind === "invalid") return validationErrorResponse(outcome.result);
    if (outcome.kind === "not_found") {
      return Response.json({ error: "Campaign not found.", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    }
    if (outcome.kind === "changed") {
      return Response.json(
        { error: "This campaign changed while you were editing it. Please refresh and try again.", code: "campaign_changed" },
        { status: 409, headers: NO_STORE },
      );
    }
    if (outcome.kind === "unchanged") {
      const locked = outcome.campaign;
      return Response.json(
        {
          campaign: {
            id: locked.id,
            title: locked.title,
            status: locked.status,
            verificationCode: locked.verificationCode,
            verificationStatus: locked.verificationStatus,
            updatedAt: locked.updatedAt,
          },
          unchanged: true,
        },
        { headers: NO_STORE },
      );
    }
    return Response.json({ campaign: outcome.campaign, reviewRequired: outcome.reviewRequired }, { headers: NO_STORE });

  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE);
    }
    console.error(e);
    return Response.json({ error: "Could not update campaign", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  const rl = await rateLimit(getClientKey(req, "campaign-manage"), 30, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const parsedBody = await readJsonObject(req, { allowEmpty: true, headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const queryId = new URL(req.url).searchParams.get("id");
    const id = parseUuid(parsedBody.body.id ?? queryId);
    if (!id) return Response.json({ error: "Invalid campaign", code: "invalid_target" }, { status: 400, headers: NO_STORE });

    const auth = await requireCampaignManager();
    if (auth.error) return auth.error;

    const [row] = await db
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
      .returning({ id: campaigns.id });
    if (!row) return Response.json({ error: "Campaign not found.", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE);
    }
    console.error(e);
    return Response.json({ error: "Could not delete campaign", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
