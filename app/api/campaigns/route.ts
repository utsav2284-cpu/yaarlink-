import { db } from "@/backend/db";
import { brands, campaigns, type Campaign } from "@/backend/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionUnavailableResponse, type SessionUser } from "@/backend/auth";
import { createVerificationCode } from "@/backend/moderation";
import { listPublicCampaigns } from "@/backend/public-listings";
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
import { isListingQueryError } from "@/backend/pagination";
import { changedFieldNames, recordAuditEvent } from "@/backend/audit-events";
import { expireOverdueCampaigns, isCampaignPastExpiry } from "@/backend/campaign-lifecycle";
import { contactSourceFor } from "@/backend/identity-sync";
import {
  getCampaignExpiryPolicy,
  parseCampaignDeadline,
  type CampaignExpiryPolicy,
} from "@/backend/platform-settings";

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
  "deadlineAt",
  "applicationDeadline",
  "expiresAt",
] as const;

type CampaignValues = {
  businessName: string;
  contactName: string | null;
  email: string | null;
  emailSource: string;
  phone: string | null;
  phoneSource: string;
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
  deadlineAt: Date | null;
  expiresAt: Date;
};

type ParseResult =
  | { ok: true; values: CampaignValues }
  | { ok: false; error: string; code: string; field?: string };

function parseCampaign(
  body: Record<string, unknown>,
  user: SessionUser,
  current?: Campaign,
  expiryContext: { now: Date; policy: CampaignExpiryPolicy } = {
    now: new Date(),
    policy: { defaultExpiryDays: 45, maxExpiryDays: 180 },
  },
): ParseResult {
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
  } else {
    const normalized = normalizeLanguage(body.language);
    if (!normalized) return { ok: false, error: "Please choose a valid language.", code: "invalid_language", field: "language" };
    language = normalized;
  }

  let format: string;
  if (current && !supplied("format")) {
    format = current.format;
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

  const deadlineField = supplied("deadlineAt")
    ? "deadlineAt"
    : supplied("applicationDeadline")
      ? "applicationDeadline"
      : supplied("expiresAt")
        ? "expiresAt"
        : null;
  let deadlineAt: Date | null;
  let expiresAt: Date;
  if (current && !deadlineField) {
    deadlineAt = current.deadlineAt;
    expiresAt = current.expiresAt;
  } else {
    const parsedDeadline = parseCampaignDeadline(deadlineField ? body[deadlineField] : undefined, {
      now: expiryContext.now,
      policy: expiryContext.policy,
      present: Boolean(deadlineField),
    });
    if (!parsedDeadline.ok) {
      return {
        ok: false,
        error: "Please choose an application deadline within the allowed campaign window.",
        code: "invalid_campaign_deadline",
        field: "deadlineAt",
      };
    }
    deadlineAt = parsedDeadline.deadlineAt;
    expiresAt = parsedDeadline.expiresAt;
  }

  return {
    ok: true,
    values: {
      businessName: businessName.value,
      contactName: contactName.value,
      email,
      // A blank campaign email explicitly falls back to the account email
      // for reviewer contact; mark that relationship so it stays current.
      emailSource: email ? contactSourceFor(email, user.email, "campaign") : "account",
      phone,
      phoneSource: contactSourceFor(phone, user.phone, "campaign"),
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
      deadlineAt,
      expiresAt,
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
  // `expiresAt` is server-derived from the current time when the brand leaves
  // the optional deadline blank. Including it would make a legitimate retry
  // moments later look like a different submission. An explicitly submitted
  // deadline is still represented by `deadlineAt`.
  const { expiresAt: _derivedExpiresAt, ...submittedValues } = values;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(submittedValues)));
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
  brandId: campaigns.brandId,
  title: campaigns.title,
  status: campaigns.status,
  verificationCode: campaigns.verificationCode,
  verificationStatus: campaigns.verificationStatus,
  deadlineAt: campaigns.deadlineAt,
  expiresAt: campaigns.expiresAt,
  expiredAt: campaigns.expiredAt,
  updatedAt: campaigns.updatedAt,
};

async function requireCampaignManager() {
  const user = await getSessionUser();
  if (!user) return { error: Response.json({ error: "Please log in to manage campaigns.", code: "unauthorized" }, { status: 401, headers: NO_STORE }) };
  // `users.role` is only the preferred starting workspace. Every account may
  // manage its own campaigns; PATCH/DELETE remain scoped by campaign owner.
  return { user };
}

/**
 * Return the account's one-to-one brand record, creating/repairing it from
 * canonical account identity. Campaigns link to this row while retaining
 * their own submitted business/contact snapshot fields.
 */
async function ensureCampaignBrand(
  tx: Pick<typeof db, "insert" | "select" | "update">,
  user: SessionUser,
  businessName: string,
  now: Date,
): Promise<string | null> {
  const [inserted] = await tx
    .insert(brands)
    .values({
      userId: user.id,
      name: businessName,
      email: user.email,
      phone: user.phone,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: brands.userId })
    .returning({ id: brands.id });
  if (inserted) {
    await recordAuditEvent(tx, {
      actorType: "user",
      actorUserId: user.id,
      ownerUserId: user.id,
      entityType: "brand",
      entityId: inserted.id,
      action: "brand.created",
      toStatus: "active",
      changedFields: ["email", "name", "phone", "status"],
      createdAt: now,
    });
    return inserted.id;
  }

  const [existing] = await tx.select().from(brands).where(eq(brands.userId, user.id)).limit(1).for("update");
  if (!existing) return null;
  const updates: Partial<typeof existing> = {};
  // A starter brand created at signup carries the person's account name.
  // The first real campaign supplies the business name; later campaigns may
  // legitimately use a different per-campaign display name, so do not keep
  // overwriting the primary brand record after that first repair.
  if (existing.name === user.name && businessName && existing.name !== businessName) updates.name = businessName;
  if (existing.email !== user.email) updates.email = user.email;
  if (existing.phone !== user.phone) updates.phone = user.phone;
  if (Object.keys(updates).length > 0) {
    await tx.update(brands).set({ ...updates, updatedAt: now }).where(eq(brands.id, existing.id));
    await recordAuditEvent(tx, {
      actorType: "user",
      actorUserId: user.id,
      ownerUserId: user.id,
      entityType: "brand",
      entityId: existing.id,
      action: "brand.contact_synced",
      fromStatus: existing.status,
      toStatus: existing.status,
      changedFields: Object.keys(updates),
      createdAt: now,
    });
  }
  return existing.id;
}

// Public listing: budget and brand contact details are owner-only and never sent to users.
export async function GET(req: Request) {
  try {
    const result = await listPublicCampaigns(new URL(req.url).searchParams);
    // Campaign openness is application-critical state; never let a browser
    // or intermediary reuse a stale public listing after pause/close.
    return Response.json(result, { headers: NO_STORE });
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

    const now = new Date();
    const expiryPolicy = await getCampaignExpiryPolicy();
    const parsed = parseCampaign(body, auth.user, undefined, { now, policy: expiryPolicy });
    if (!parsed.ok) return validationErrorResponse(parsed);

    const submissionId = submission.value;
    const fingerprint = submissionId ? await submissionFingerprint(parsed.values) : null;
    const row = await db.transaction(async (tx) => {
      // Accounts that started in the creator workspace may not have the
      // one-to-one brand profile row yet. Create/repair it in the same
      // transaction and link the campaign structurally to that brand.
      const brandId = await ensureCampaignBrand(tx, auth.user, parsed.values.businessName, now);
      const insert = tx
        .insert(campaigns)
        .values({
          ownerId: auth.user.id,
          brandId,
          submissionId,
          submissionFingerprint: fingerprint,
          ...parsed.values,
          status: "pending",
          verificationCode: createVerificationCode(),
          verificationStatus: "pending",
          moderationNote: null,
          reviewedAt: null,
          expiredAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning(returningCampaign);
      const [created] = submissionId
        ? await insert.onConflictDoNothing({ target: [campaigns.ownerId, campaigns.submissionId] })
        : await insert;
      if (created) {
        await recordAuditEvent(tx, {
          actorType: "user",
          actorUserId: auth.user.id,
          ownerUserId: auth.user.id,
          entityType: "campaign",
          entityId: created.id,
          action: "campaign.created",
          toStatus: created.status,
          changedFields: Object.keys(parsed.values),
          metadata: { brandLinked: Boolean(brandId) },
          createdAt: now,
        });
      }
      return created ?? null;
    });

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

    const now = new Date();
    let [existing] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
      .limit(1);
    if (!existing) return Response.json({ error: "Campaign not found.", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    if (isCampaignPastExpiry(existing, now)) {
      await expireOverdueCampaigns({ campaignId: id, now });
      [existing] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
        .limit(1);
      if (!existing) return Response.json({ error: "Campaign not found.", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    }

    if (hasField(body, "action")) {
      const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
      let update: Partial<Campaign> | null = null;

      if (action === "pause") {
        if (existing.status === "expired") {
          return Response.json(
            { error: "This campaign has expired. Extend its deadline to submit it again.", code: "campaign_expired" },
            { status: 409, headers: NO_STORE },
          );
        }
        if (existing.status !== "open") return Response.json({ error: "Only an open campaign can be paused.", code: "campaign_must_be_open_to_pause" }, { status: 409, headers: NO_STORE });
        update = { status: "paused", updatedAt: now };
      } else if (action === "close") {
        if (existing.status === "closed") return Response.json({ error: "This campaign is already closed.", code: "campaign_already_closed" }, { status: 409, headers: NO_STORE });
        update = { status: "closed", updatedAt: now };
      } else if (action === "republish") {
        const expiryPolicy = await getCampaignExpiryPolicy();
        const deadlineField = hasField(body, "deadlineAt")
          ? "deadlineAt"
          : hasField(body, "applicationDeadline")
            ? "applicationDeadline"
            : hasField(body, "expiresAt")
              ? "expiresAt"
              : null;
        const parsedDeadline = parseCampaignDeadline(deadlineField ? body[deadlineField] : undefined, {
          now,
          policy: expiryPolicy,
          present: Boolean(deadlineField),
        });
        if (!parsedDeadline.ok) {
          return validationErrorResponse({
            error: "Please choose an application deadline within the allowed campaign window.",
            code: "invalid_campaign_deadline",
            field: "deadlineAt",
          });
        }
        const nextExpiry = parsedDeadline.present
          ? { deadlineAt: parsedDeadline.deadlineAt, expiresAt: parsedDeadline.expiresAt }
          : existing.expiresAt.getTime() > now.getTime()
            ? { deadlineAt: existing.deadlineAt, expiresAt: existing.expiresAt }
            : { deadlineAt: null, expiresAt: parsedDeadline.expiresAt };

        if (existing.status === "paused") {
          if (existing.verificationStatus !== "verified") {
            return Response.json({ error: "This campaign must finish verification before it can be republished.", code: "campaign_verification_required" }, { status: 409, headers: NO_STORE });
          }
          update = { status: "open", ...nextExpiry, expiredAt: null, updatedAt: now };
        } else if (existing.status === "expired") {
          // An expired brief is stale enough to require the same fresh
          // review/verification as a resubmitted campaign.
          update = {
            status: "pending",
            verificationCode: createVerificationCode(),
            verificationStatus: "pending",
            moderationNote: null,
            reviewedAt: null,
            ...nextExpiry,
            expiredAt: null,
            updatedAt: now,
          };
        } else if (existing.status === "closed" || existing.status === "rejected") {
          update = {
            status: "pending",
            moderationNote: null,
            reviewedAt: null,
            ...nextExpiry,
            expiredAt: null,
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

      const row = await db.transaction(async (tx) => {
        if (!update) return null;
        const [updated] = await tx
          .update(campaigns)
          .set(update)
          .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id), eq(campaigns.status, existing.status)))
          .returning(returningCampaign);
        if (!updated) return null;
        await recordAuditEvent(tx, {
          actorType: "user",
          actorUserId: auth.user.id,
          ownerUserId: auth.user.id,
          entityType: "campaign",
          entityId: updated.id,
          action: "campaign.status_changed",
          fromStatus: existing.status,
          toStatus: updated.status,
          changedFields: changedFieldNames(existing, update),
          metadata: { lifecycleAction: action },
          createdAt: now,
        });
        return updated;
      });
      if (!row) return Response.json({ error: "This campaign changed while you were editing it. Please refresh and try again.", code: "campaign_changed" }, { status: 409, headers: NO_STORE });
      return Response.json({ campaign: row }, { headers: NO_STORE });
    }

    if (!CAMPAIGN_FIELDS.some((field) => hasField(body, field))) {
      return Response.json({ error: "No campaign changes were provided.", code: "no_changes" }, { status: 400, headers: NO_STORE });
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(body);
    if (!expectedUpdatedAt.ok) return validationErrorResponse(expectedUpdatedAt);
    const expiryPolicy = await getCampaignExpiryPolicy();

    type EditOutcome =
      | {
          kind: "updated";
          campaign: {
            id: string;
            brandId: string | null;
            title: string;
            status: string;
            verificationCode: string | null;
            verificationStatus: string;
            deadlineAt: Date | null;
            expiresAt: Date;
            expiredAt: Date | null;
            updatedAt: Date;
          };
          reviewRequired: boolean;
        }
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

      const lockedParsed = parseCampaign(body, auth.user, locked, { now, policy: expiryPolicy });
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
        lockedParsed.values.emailSource !== locked.emailSource ||
        lockedParsed.values.phone !== locked.phone ||
        lockedParsed.values.phoneSource !== locked.phoneSource;

      const effectiveValues = { ...lockedParsed.values };
      if (effectiveValues.expiresAt.getTime() <= now.getTime() && materialChanged) {
        const fallback = parseCampaignDeadline(undefined, { now, policy: expiryPolicy, present: false });
        if (fallback.ok) {
          effectiveValues.deadlineAt = null;
          effectiveValues.expiresAt = fallback.expiresAt;
        }
      }
      const deadlineChanged =
        (effectiveValues.deadlineAt?.getTime() ?? null) !== (locked.deadlineAt?.getTime() ?? null) ||
        effectiveValues.expiresAt.getTime() !== locked.expiresAt.getTime();
      const expiredResubmission = locked.status === "expired" && deadlineChanged;
      const reviewRequired = materialChanged || expiredResubmission;

      if (!materialChanged && !contactChanged && !deadlineChanged) return { kind: "unchanged", campaign: locked } as const;

      const brandId = locked.brandId ?? (await ensureCampaignBrand(tx, auth.user, effectiveValues.businessName, now));
      const updateValues = reviewRequired
        ? {
            ...effectiveValues,
            brandId,
            updatedAt: now,
            status: "pending",
            verificationCode: createVerificationCode(),
            verificationStatus: "pending",
            moderationNote: null,
            reviewedAt: null,
            expiredAt: null,
          }
        : {
            // A private contact/deadline update should not rewrite the
            // verified public campaign representation. Extending a live
            // campaign's closing date therefore also stays live.
            brandId,
            contactName: effectiveValues.contactName,
            email: effectiveValues.email,
            emailSource: effectiveValues.emailSource,
            phone: effectiveValues.phone,
            phoneSource: effectiveValues.phoneSource,
            deadlineAt: effectiveValues.deadlineAt,
            expiresAt: effectiveValues.expiresAt,
            // A previously expired campaign may have been moved to a terminal
            // moderation status. Extending its deadline past that historical
            // expiry must clear the stale timestamp or the expiry check
            // (`expiredAt >= expiresAt`) would reject the update.
            expiredAt:
              locked.expiredAt && effectiveValues.expiresAt.getTime() > locked.expiredAt.getTime()
                ? null
                : locked.expiredAt,
            updatedAt: now,
          };
      const [row] = await tx
        .update(campaigns)
        .set(updateValues)
        .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
        .returning(returningCampaign);
      if (!row) return { kind: "not_found" } as const;
      await recordAuditEvent(tx, {
        actorType: "user",
        actorUserId: auth.user.id,
        ownerUserId: auth.user.id,
        entityType: "campaign",
        entityId: row.id,
        action: "campaign.updated",
        fromStatus: locked.status,
        toStatus: row.status,
        changedFields: changedFieldNames(locked, updateValues),
        metadata: { reviewRequired },
        createdAt: now,
      });
      return { kind: "updated", campaign: row, reviewRequired } as const;
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
            brandId: locked.brandId,
            title: locked.title,
            status: locked.status,
            verificationCode: locked.verificationCode,
            verificationStatus: locked.verificationStatus,
            deadlineAt: locked.deadlineAt,
            expiresAt: locked.expiresAt,
            expiredAt: locked.expiredAt,
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

    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: campaigns.id, status: campaigns.status })
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.ownerId, auth.user.id)))
        .limit(1)
        .for("update");
      if (!existing) return null;
      const [deleted] = await tx.delete(campaigns).where(eq(campaigns.id, existing.id)).returning({ id: campaigns.id });
      if (!deleted) return null;
      await recordAuditEvent(tx, {
        actorType: "user",
        actorUserId: auth.user.id,
        ownerUserId: auth.user.id,
        entityType: "campaign",
        entityId: deleted.id,
        action: "campaign.deleted",
        fromStatus: existing.status,
        toStatus: "deleted",
      });
      return deleted;
    });
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
