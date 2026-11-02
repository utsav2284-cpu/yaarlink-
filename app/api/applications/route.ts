import {
  isCompletedCreatorProfile,
  resolveApplicationContact,
  sameApplicationContact,
} from "@/backend/application-contact";
import { db } from "@/backend/db";
import { applications, campaigns, creators, users } from "@/backend/db/schema";
import { adminSessionUnavailableResponse, isAdmin, isAdminSessionUnavailableError, logAdminSessionUnavailable } from "@/backend/admin";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionUnavailableResponse } from "@/backend/auth";
import { findDisallowedContent, hasSuspiciousUrl } from "@/backend/content-moderation";
import {
  hasField,
  parseOptionalText,
  parseUuid,
  readJsonObject,
  type ValidationResult,
} from "@/backend/validation";
import { createApplicationNotification, sendApplicationNotificationEmailBestEffort } from "@/backend/notifications";
import { and, desc, eq, sql } from "drizzle-orm";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { APPLICATION_STATUSES, type ApplicationStatus, type NotificationKind } from "@/shared/constants";
import {
  allConditions,
  cursorCondition,
  decodeCursor,
  isListingQueryError,
  paginateRows,
  parseEnumParam,
  parseListingParams,
  parseUuidParam,
  scopeFrom,
  searchCondition,
  sortOrder,
  textExpression,
  type SortKey,
} from "@/backend/pagination";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function validationErrorResponse(result: { error: string; code: string; field?: string }, status = 400) {
  return Response.json(
    { error: result.error, code: result.code, ...(result.field ? { field: result.field } : {}) },
    { status, headers: NO_STORE },
  );
}

function parseApplicationText(
  value: unknown,
  options: {
    field: "message" | "decisionNote";
    invalidCode: string;
    invalidMessage: string;
    allowUrls: boolean;
    allowContactDetails: boolean;
  },
): ValidationResult<string | null> {
  const parsed = parseOptionalText(value, {
    field: options.field,
    maxLength: 1000,
    multiline: true,
    invalidCode: options.invalidCode,
    invalidMessage: options.invalidMessage,
  });
  if (!parsed.ok) return parsed;
  if (
    parsed.value &&
    findDisallowedContent(parsed.value, {
      allowUrls: options.allowUrls,
      allowContactDetails: options.allowContactDetails,
    })
  ) {
    return {
      ok: false,
      error: "Please remove links, contact details, or prohibited content and try again.",
      code: "content_not_allowed",
      field: options.field,
    };
  }
  return parsed;
}

function cleanCreatorName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function contentNotAllowedResponse(field: string) {
  return validationErrorResponse({
    error: "Please remove links, contact details, or prohibited content and try again.",
    code: "content_not_allowed",
    field,
  });
}

function isOpenCampaign(campaign: { status: string; verificationStatus: string }) {
  return campaign.status === "open" && campaign.verificationStatus === "verified";
}

type EmailNotice = {
  kind: NotificationKind;
  to: string;
  recipientName: string;
  campaignTitle: string;
  actorName?: string | null;
  applicationStatus: ApplicationStatus;
  decisionNote?: string | null;
};

const ADMIN_APPLICATION_SORTS = ["newest", "oldest", "updated", "status"] as const;

type AdminApplicationSortRow = {
  application: {
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
};

function adminApplicationSortKeys(sort: string): Array<SortKey<AdminApplicationSortRow>> {
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

// Applications contain creators' contact details — owner (admin) only.
// Brands see applications for their own campaigns via /api/me/dashboard.
export async function GET(req: Request) {
  try {
    if (!(await isAdmin())) return Response.json({ error: "Not allowed", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    const params = new URL(req.url).searchParams;
    const listing = parseListingParams(params, {
      defaultLimit: 50,
      defaultSort: "newest",
      allowedSorts: ADMIN_APPLICATION_SORTS,
    });
    const status = parseEnumParam(params, "status", APPLICATION_STATUSES);
    const campaignId = parseUuidParam(params, "campaignId");
    const creatorId = parseUuidParam(params, "creatorId");
    const userId = parseUuidParam(params, "userId");
    const scope = scopeFrom({ listing: "admin-applications", q: listing.q, status, campaignId, creatorId, userId });
    const keys = adminApplicationSortKeys(listing.sort);
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
        .select({
          application: applications,
          campaignTitle: campaigns.title,
          campaignBusinessName: campaigns.businessName,
          creatorLabel: creators.name,
        })
        .from(applications)
        .leftJoin(campaigns, eq(applications.campaignId, campaigns.id))
        .leftJoin(creators, eq(applications.creatorId, creators.id))
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
    return Response.json(
      {
        applications: items.map(({ application, campaignTitle, campaignBusinessName, creatorLabel }) => ({
          ...application,
          campaignLabel: campaignTitle ? `${campaignTitle} (${campaignBusinessName ?? ""})` : null,
          campaignMissing: campaignTitle === null,
          creatorLabel: creatorLabel ?? application.creatorName,
        })),
        pagination,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (isAdminSessionUnavailableError(e)) {
      logAdminSessionUnavailable(e);
      return adminSessionUnavailableResponse(NO_STORE);
    }
    if (isListingQueryError(e)) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    }
    console.error(e);
    return Response.json({ error: "Could not load applications", code: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "application-create"), 20, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    const campaignId = parseUuid(body.campaignId);
    if (!campaignId) return Response.json({ error: "Invalid campaign", code: "invalid_target" }, { status: 400, headers: NO_STORE });

    const parsedMessage = hasField(body, "message")
      ? parseApplicationText(body.message, {
          field: "message",
          invalidCode: "invalid_application_message",
          invalidMessage: "Please enter a valid application message.",
          allowUrls: false,
          allowContactDetails: false,
        })
      : ({ ok: true, value: null } as ValidationResult<string | null>);
    if (!parsedMessage.ok) return validationErrorResponse(parsedMessage);
    const message = parsedMessage.value;

    const camp = await db
      .select({ id: campaigns.id, ownerId: campaigns.ownerId, status: campaigns.status, verificationStatus: campaigns.verificationStatus })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    if (!camp.length) return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    if (!isOpenCampaign(camp[0])) {
      return Response.json({ error: "This campaign is no longer accepting applications.", code: "campaign_closed" }, { status: 409, headers: NO_STORE });
    }

    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in before applying.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    if (camp[0].ownerId === user.id) {
      return Response.json({ error: "You cannot apply to your own campaign.", code: "own_campaign" }, { status: 403, headers: NO_STORE });
    }
    // Any account may apply once it has its own completed creator profile;
    // the profile/consent checks below remain the creator-side requirements.

    const [initialCreatorProfile] = await db
      .select()
      .from(creators)
      .where(eq(creators.userId, user.id))
      .limit(1);
    if (!isCompletedCreatorProfile(initialCreatorProfile)) {
      return Response.json({ error: "Please complete your creator profile before applying.", code: "creator_profile_incomplete" }, { status: 409, headers: NO_STORE });
    }

    // The brand-facing applicant name is always the completed creator
    // profile's name. Request-body names are deliberately ignored so an
    // applicant cannot apply under someone else's name/page name.
    let creatorName = cleanCreatorName(initialCreatorProfile.name);
    if (!creatorName || findDisallowedContent(creatorName)) return contentNotAllowedResponse("creatorName");

    // The creator chooses which already-saved account/profile contact to
    // share and explicitly confirms that choice. Formatting variations are
    // normalized to the saved canonical contact; arbitrary contacts are not
    // accepted, and account details are never substituted silently.
    if (hasField(body, "creatorContact") && body.creatorContact != null && typeof body.creatorContact !== "string") {
      return validationErrorResponse({
        error: "Please enter a valid contact for the brand.",
        code: "invalid_application_contact",
        field: "creatorContact",
      });
    }
    const contactInput = typeof body.creatorContact === "string" ? body.creatorContact.trim().replace(/\s+/g, " ") : "";
    if (contactInput.length < 3) {
      return Response.json(
        { error: "Please enter the contact you want this brand to use.", code: "contact_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (contactInput.length > 240 || findDisallowedContent(contactInput, { allowUrls: true, allowContactDetails: true })) {
      return contentNotAllowedResponse("creatorContact");
    }
    if (body.contactSharingConsent !== true) {
      return Response.json(
        { error: "Please confirm that this brand may receive your application contact.", code: "contact_sharing_consent_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    const initialContact = resolveApplicationContact(contactInput, user, initialCreatorProfile);
    if (!initialContact) {
      return Response.json(
        { error: "Use a phone, email, or social profile saved on your account or completed creator profile.", code: "application_contact_not_owned" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (hasSuspiciousUrl(initialContact.value)) return contentNotAllowedResponse("creatorContact");
    let contact = initialContact.value;

    type PostOutcome =
      | { kind: "created" | "reactivated"; application: typeof applications.$inferSelect; email: EmailNotice }
      | { kind: "replay"; application: typeof applications.$inferSelect }
      | { kind: "duplicate" | "closed" | "profile_incomplete" | "contact_not_owned" | "campaign_missing" | "content_not_allowed" | "own_campaign" };

    const outcome: PostOutcome = await db.transaction(async (tx) => {
      // Locking the campaign makes pause/close and apply/reactivate decisions
      // serialize instead of racing based on the preliminary check above.
      const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1).for("update");
      if (!campaign) return { kind: "campaign_missing" } as const;
      if (!isOpenCampaign(campaign)) return { kind: "closed" } as const;
      if (campaign.ownerId === user.id) return { kind: "own_campaign" } as const;

      const [creatorProfile] = await tx
        .select()
        .from(creators)
        .where(eq(creators.userId, user.id))
        .limit(1)
        .for("update");
      if (!isCompletedCreatorProfile(creatorProfile)) return { kind: "profile_incomplete" } as const;

      const lockedContact = resolveApplicationContact(contactInput, user, creatorProfile);
      if (!lockedContact) return { kind: "contact_not_owned" } as const;
      creatorName = cleanCreatorName(creatorProfile.name);
      if (!creatorName || findDisallowedContent(creatorName) || hasSuspiciousUrl(lockedContact.value)) {
        return { kind: "content_not_allowed" } as const;
      }
      contact = lockedContact.value;

      const [brandUser] = await tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, campaign.ownerId))
        .limit(1);
      if (!brandUser) return { kind: "campaign_missing" } as const;

      // Duplicate protection is deliberately keyed only to this signed-in
      // creator + campaign (also the DB unique constraint). Contacts are
      // never compared with other applicants, so a shared phone/handle can
      // neither block another creator nor reveal whether it was used before.
      const [existing] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.campaignId, campaignId), eq(applications.userId, user.id)))
        .limit(1)
        .for("update");
      if (existing && existing.status !== "withdrawn") {
        const isExactReplay =
          existing.creatorId === creatorProfile.id &&
          existing.creatorName === creatorName &&
          existing.creatorContact === contact &&
          existing.message === message;
        return isExactReplay ? { kind: "replay", application: existing } as const : { kind: "duplicate" } as const;
      }

      const now = new Date();
      if (existing) {
        const [application] = await tx
          .update(applications)
          .set({
            creatorId: creatorProfile.id,
            creatorName,
            creatorContact: contact || null,
            message,
            status: "applied",
            decisionNote: null,
            decisionAt: null,
            updatedAt: now,
          })
          .where(and(eq(applications.id, existing.id), eq(applications.status, "withdrawn")))
          .returning();
        if (!application) return { kind: "duplicate" } as const;
        await createApplicationNotification(tx, {
          recipientUserId: brandUser.id,
          kind: "application_received",
          campaignId,
          applicationId: application.id,
          campaignTitle: campaign.title,
          actorName: creatorName,
          applicationStatus: "applied",
        });
        return {
          kind: "reactivated",
          application,
          email: {
            kind: "application_received",
            to: brandUser.email,
            recipientName: brandUser.name,
            campaignTitle: campaign.title,
            actorName: creatorName,
            applicationStatus: "applied",
          },
        } as const;
      }

      // The (campaign_id, user_id) unique constraint remains the final arbiter
      // for parallel submissions from the same creator account.
      const [application] = await tx
        .insert(applications)
        .values({
          campaignId,
          userId: user.id,
          creatorId: creatorProfile.id,
          creatorName,
          creatorContact: contact || null,
          message,
          status: "applied",
          decisionNote: null,
          decisionAt: null,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [applications.campaignId, applications.userId] })
        .returning();
      if (!application) return { kind: "duplicate" } as const;

      await createApplicationNotification(tx, {
        recipientUserId: brandUser.id,
        kind: "application_received",
        campaignId,
        applicationId: application.id,
        campaignTitle: campaign.title,
        actorName: creatorName,
        applicationStatus: "applied",
      });
      return {
        kind: "created",
        application,
        email: {
          kind: "application_received",
          to: brandUser.email,
          recipientName: brandUser.name,
          campaignTitle: campaign.title,
          actorName: creatorName,
          applicationStatus: "applied",
        },
      } as const;
    });

    if (outcome.kind === "created" || outcome.kind === "reactivated") {
      await sendApplicationNotificationEmailBestEffort({ req, ...outcome.email });
      return Response.json(
        { application: outcome.application, reactivated: outcome.kind === "reactivated" },
        { status: outcome.kind === "created" ? 201 : 200, headers: NO_STORE },
      );
    }
    if (outcome.kind === "replay") {
      return Response.json({ application: outcome.application, reactivated: false, idempotentReplay: true }, { headers: NO_STORE });
    }
    if (outcome.kind === "own_campaign") return Response.json({ error: "You cannot apply to your own campaign.", code: "own_campaign" }, { status: 403, headers: NO_STORE });
    if (outcome.kind === "content_not_allowed") return contentNotAllowedResponse("creatorContact");
    if (outcome.kind === "duplicate") return Response.json({ error: "You have already applied to this campaign.", code: "already_applied" }, { status: 409, headers: NO_STORE });
    if (outcome.kind === "closed") return Response.json({ error: "This campaign is no longer accepting applications.", code: "campaign_closed" }, { status: 409, headers: NO_STORE });
    if (outcome.kind === "profile_incomplete") return Response.json({ error: "Please complete your creator profile before applying.", code: "creator_profile_incomplete" }, { status: 409, headers: NO_STORE });
    if (outcome.kind === "contact_not_owned") {
      return Response.json(
        { error: "Use a phone, email, or social profile saved on your account or completed creator profile.", code: "application_contact_not_owned" },
        { status: 400, headers: NO_STORE },
      );
    }
    return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE);
    }
    console.error(e);
    return Response.json({ error: "Could not apply", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

const CREATOR_ACTIONS = new Set(["edit", "withdraw", "reactivate"]);
const BRAND_ACTIONS: Record<string, ApplicationStatus> = {
  shortlist: "shortlisted",
  reject: "rejected",
  hire: "hired",
  complete: "completed",
};

export async function PATCH(req: Request) {
  const rl = await rateLimit(getClientKey(req, "application-manage"), 60, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    const id = parseUuid(body.id);
    if (!id) return Response.json({ error: "Invalid application", code: "invalid_target" }, { status: 400, headers: NO_STORE });
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    if (!CREATOR_ACTIONS.has(action) && !(action in BRAND_ACTIONS)) {
      return Response.json({ error: "Invalid application action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    const parsedMessage = hasField(body, "message")
      ? parseApplicationText(body.message, {
          field: "message",
          invalidCode: "invalid_application_message",
          invalidMessage: "Please enter a valid application message.",
          allowUrls: false,
          allowContactDetails: false,
        })
      : null;
    if (parsedMessage && !parsedMessage.ok) return validationErrorResponse(parsedMessage);
    const nextMessage = parsedMessage ? parsedMessage.value : undefined;

    let nextContact: string | undefined;
    if (hasField(body, "creatorContact")) {
      if (typeof body.creatorContact !== "string") {
        return validationErrorResponse({
          error: "Please enter a valid contact for the brand.",
          code: "invalid_application_contact",
          field: "creatorContact",
        });
      }
      nextContact = body.creatorContact.trim().replace(/\s+/g, " ");
      if (nextContact.length < 3 || nextContact.length > 240) {
        return validationErrorResponse({
          error: "Please enter a valid contact for the brand.",
          code: "invalid_application_contact",
          field: "creatorContact",
        });
      }
      if (findDisallowedContent(nextContact, { allowUrls: true, allowContactDetails: true })) {
        return contentNotAllowedResponse("creatorContact");
      }
    }

    const parsedDecisionNote = hasField(body, "decisionNote")
      ? parseApplicationText(body.decisionNote, {
          field: "decisionNote",
          invalidCode: "invalid_decision_note",
          invalidMessage: "Please enter a valid decision note.",
          allowUrls: true,
          allowContactDetails: true,
        })
      : null;
    if (parsedDecisionNote && !parsedDecisionNote.ok) return validationErrorResponse(parsedDecisionNote);
    const contactSharingConsent = body.contactSharingConsent === true;
    const decisionNote = parsedDecisionNote ? parsedDecisionNote.value : null;

    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in to manage this application.", code: "unauthorized" }, { status: 401, headers: NO_STORE });

    const [peek] = await db.select({ campaignId: applications.campaignId }).from(applications).where(eq(applications.id, id)).limit(1);
    if (!peek) return Response.json({ error: "Application not found.", code: "application_not_found" }, { status: 404, headers: NO_STORE });

    type PatchOutcome =
      | { kind: "updated"; application: typeof applications.$inferSelect; email?: EmailNotice }
      | {
          kind:
            | "forbidden"
            | "not_found"
            | "invalid_input"
            | "invalid_transition"
            | "closed"
            | "profile_incomplete"
            | "contact_not_owned"
            | "contact_required"
            | "consent_required"
            | "content_not_allowed";
          currentStatus?: string;
        };

    const outcome: PatchOutcome = await db.transaction(async (tx) => {
      const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, peek.campaignId)).limit(1).for("update");
      if (!campaign) return { kind: "not_found" } as const;
      const [application] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, id), eq(applications.campaignId, campaign.id)))
        .limit(1)
        .for("update");
      if (!application) return { kind: "not_found" } as const;

      const isApplicant = application.userId === user.id;
      // A self-application should not exist, but even for legacy data the
      // campaign owner must not use brand actions on their own application.
      const isCampaignOwner = campaign.ownerId === user.id && application.userId !== user.id;
      if (CREATOR_ACTIONS.has(action) && !isApplicant) return { kind: "forbidden" } as const;
      if (action in BRAND_ACTIONS && !isCampaignOwner) return { kind: "forbidden" } as const;

      const now = new Date();

      if (action === "edit") {
        if (nextMessage === undefined && nextContact === undefined) return { kind: "invalid_input" } as const;
        if (application.status !== "applied" && application.status !== "shortlisted") {
          return { kind: "invalid_transition", currentStatus: application.status } as const;
        }

        const [creatorProfile] = await tx
          .select()
          .from(creators)
          .where(eq(creators.id, application.creatorId))
          .limit(1)
          .for("update");

        let editedContact = application.creatorContact;
        if (nextContact !== undefined) {
          if (sameApplicationContact(nextContact, application.creatorContact)) {
            // Keeping the same normalized contact is allowed even for a
            // legacy application. If it now matches the creator's saved
            // account/profile contacts, store the canonical saved value.
            editedContact = resolveApplicationContact(nextContact, user, creatorProfile)?.value ?? application.creatorContact;
          } else {
            if (!isCompletedCreatorProfile(creatorProfile)) return { kind: "profile_incomplete" } as const;
            const resolvedContact = resolveApplicationContact(nextContact, user, creatorProfile);
            if (!resolvedContact) return { kind: "contact_not_owned" } as const;
            editedContact = resolvedContact.value;
          }
          if (hasSuspiciousUrl(editedContact)) return { kind: "content_not_allowed" } as const;
        }
        const editedCreatorName = creatorProfile?.name ? cleanCreatorName(creatorProfile.name) : "";
        if (editedCreatorName && findDisallowedContent(editedCreatorName)) return { kind: "content_not_allowed" } as const;

        const [updated] = await tx
          .update(applications)
          .set({
            ...(editedCreatorName ? { creatorName: editedCreatorName } : {}),
            ...(nextMessage !== undefined ? { message: nextMessage } : {}),
            ...(nextContact !== undefined ? { creatorContact: editedContact } : {}),
            updatedAt: now,
          })
          .where(eq(applications.id, id))
          .returning();
        return { kind: "updated", application: updated } as const;
      }

      if (action === "withdraw") {
        if (!["applied", "shortlisted", "hired"].includes(application.status)) {
          return { kind: "invalid_transition", currentStatus: application.status } as const;
        }
        const [brandUser] = await tx
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, campaign.ownerId))
          .limit(1);
        if (!brandUser) return { kind: "not_found" } as const;
        const [updated] = await tx
          .update(applications)
          .set({ status: "withdrawn", decisionAt: now, updatedAt: now })
          .where(eq(applications.id, id))
          .returning();
        await createApplicationNotification(tx, {
          recipientUserId: brandUser.id,
          kind: "application_withdrawn",
          campaignId: campaign.id,
          applicationId: updated.id,
          campaignTitle: campaign.title,
          actorName: updated.creatorName,
          applicationStatus: "withdrawn",
        });
        return {
          kind: "updated",
          application: updated,
          email: {
            kind: "application_withdrawn",
            to: brandUser.email,
            recipientName: brandUser.name,
            campaignTitle: campaign.title,
            actorName: updated.creatorName,
            applicationStatus: "withdrawn",
          },
        } as const;
      }

      if (action === "reactivate") {
        if (application.status !== "withdrawn") return { kind: "invalid_transition", currentStatus: application.status } as const;
        if (!isOpenCampaign(campaign)) return { kind: "closed" } as const;
        // Reactivation shares an application contact with the brand again,
        // including contacts created before explicit-consent UI was added.
        // Require fresh consent, a completed profile, and a contact saved on
        // that creator's own account/profile. The previous contact may be
        // reused only when it still resolves to one of those saved contacts.
        const effectiveContact = (nextContact ?? application.creatorContact ?? "").trim();
        if (effectiveContact.length < 3) return { kind: "contact_required" } as const;
        if (!contactSharingConsent) return { kind: "consent_required" } as const;

        const [creatorProfile] = await tx
          .select()
          .from(creators)
          .where(eq(creators.id, application.creatorId))
          .limit(1)
          .for("update");
        if (!isCompletedCreatorProfile(creatorProfile)) return { kind: "profile_incomplete" } as const;
        const resolvedContact = resolveApplicationContact(effectiveContact, user, creatorProfile);
        if (!resolvedContact) return { kind: "contact_not_owned" } as const;
        const reactivatedCreatorName = cleanCreatorName(creatorProfile.name);
        if (!reactivatedCreatorName || findDisallowedContent(reactivatedCreatorName) || hasSuspiciousUrl(resolvedContact.value)) {
          return { kind: "content_not_allowed" } as const;
        }

        const [brandUser] = await tx
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, campaign.ownerId))
          .limit(1);
        if (!brandUser) return { kind: "not_found" } as const;
        const [updated] = await tx
          .update(applications)
          .set({
            creatorId: creatorProfile.id,
            creatorName: reactivatedCreatorName,
            creatorContact: resolvedContact.value,
            ...(nextMessage !== undefined ? { message: nextMessage } : {}),
            status: "applied",
            decisionNote: null,
            decisionAt: null,
            updatedAt: now,
          })
          .where(eq(applications.id, id))
          .returning();
        await createApplicationNotification(tx, {
          recipientUserId: brandUser.id,
          kind: "application_received",
          campaignId: campaign.id,
          applicationId: updated.id,
          campaignTitle: campaign.title,
          actorName: updated.creatorName,
          applicationStatus: "applied",
        });
        return {
          kind: "updated",
          application: updated,
          email: {
            kind: "application_received",
            to: brandUser.email,
            recipientName: brandUser.name,
            campaignTitle: campaign.title,
            actorName: updated.creatorName,
            applicationStatus: "applied",
          },
        } as const;
      }

      const nextStatus = BRAND_ACTIONS[action];
      const allowedFrom: Record<ApplicationStatus, string[]> = {
        applied: [],
        shortlisted: ["applied"],
        rejected: ["applied", "shortlisted"],
        hired: ["applied", "shortlisted"],
        completed: ["hired"],
        withdrawn: [],
      };
      if (!allowedFrom[nextStatus].includes(application.status)) {
        return { kind: "invalid_transition", currentStatus: application.status } as const;
      }

      const [creatorUser] = await tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, application.userId))
        .limit(1);
      if (!creatorUser) return { kind: "not_found" } as const;

      const [updated] = await tx
        .update(applications)
        .set({ status: nextStatus, decisionNote, decisionAt: now, updatedAt: now })
        .where(eq(applications.id, id))
        .returning();
      await createApplicationNotification(tx, {
        recipientUserId: creatorUser.id,
        kind: "application_status",
        campaignId: campaign.id,
        applicationId: updated.id,
        campaignTitle: campaign.title,
        actorName: campaign.businessName,
        applicationStatus: nextStatus,
      });
      return {
        kind: "updated",
        application: updated,
        email: {
          kind: "application_status",
          to: creatorUser.email,
          recipientName: creatorUser.name,
          campaignTitle: campaign.title,
          actorName: campaign.businessName,
          applicationStatus: nextStatus,
          decisionNote,
        },
      } as const;
    });

    if (outcome.kind === "updated") {
      if (outcome.email) await sendApplicationNotificationEmailBestEffort({ req, ...outcome.email });
      return Response.json({ application: outcome.application }, { headers: NO_STORE });
    }
    if (outcome.kind === "forbidden") return Response.json({ error: "You cannot manage this application.", code: "forbidden" }, { status: 403, headers: NO_STORE });
    if (outcome.kind === "not_found") return Response.json({ error: "Application not found.", code: "application_not_found" }, { status: 404, headers: NO_STORE });
    if (outcome.kind === "invalid_input") return Response.json({ error: "No application changes were provided.", code: "no_changes" }, { status: 400, headers: NO_STORE });
    if (outcome.kind === "content_not_allowed") return contentNotAllowedResponse("creatorContact");
    if (outcome.kind === "profile_incomplete") {
      return Response.json({ error: "Please complete your creator profile before applying.", code: "creator_profile_incomplete" }, { status: 409, headers: NO_STORE });
    }
    if (outcome.kind === "contact_not_owned") {
      return Response.json(
        { error: "Use a phone, email, or social profile saved on your account or completed creator profile.", code: "application_contact_not_owned" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (outcome.kind === "contact_required") {
      return Response.json(
        { error: "Please enter the contact you want this brand to use.", code: "contact_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (outcome.kind === "consent_required") {
      return Response.json(
        { error: "Please confirm that this brand may receive your application contact.", code: "contact_sharing_consent_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (outcome.kind === "closed") return Response.json({ error: "This campaign is no longer accepting applications.", code: "campaign_closed" }, { status: 409, headers: NO_STORE });
    return Response.json(
      { error: `This application cannot be changed from its current status (${outcome.currentStatus ?? "unknown"}).`, code: "application_status_conflict" },
      { status: 409, headers: NO_STORE },
    );
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE);
    }
    console.error(e);
    return Response.json({ error: "Could not update application", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
