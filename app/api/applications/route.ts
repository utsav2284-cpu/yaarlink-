import { db } from "@/backend/db";
import { applications, campaigns, creators, users } from "@/backend/db/schema";
import { isAdmin } from "@/backend/admin";
import { getSessionUser } from "@/backend/auth";
import { isUuid } from "@/backend/moderation";
import { createApplicationNotification, sendApplicationNotificationEmailBestEffort } from "@/backend/notifications";
import { and, desc, eq, ne } from "drizzle-orm";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import type { ApplicationStatus, NotificationKind } from "@/shared/constants";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function bodyRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasField(body: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function cleanText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
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

// Applications contain creators' contact details — owner (admin) only.
// Brands see applications for their own campaigns via /api/me/dashboard.
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Not allowed", code: "unauthorized" }, { status: 401, headers: NO_STORE });
  try {
    const rows = await db.select().from(applications).orderBy(desc(applications.createdAt)).limit(200);
    return Response.json({ applications: rows }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ applications: [] }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "application-create"), 20, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const body = bodyRecord(await req.json().catch(() => null));
    if (!body || !isUuid(body.campaignId)) return Response.json({ error: "Invalid campaign", code: "invalid_target" }, { status: 400, headers: NO_STORE });
    const campaignId = body.campaignId;

    const camp = await db
      .select({ id: campaigns.id, status: campaigns.status, verificationStatus: campaigns.verificationStatus })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    if (!camp.length) return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
    if (camp[0].status !== "open" || camp[0].verificationStatus !== "verified") {
      return Response.json({ error: "This campaign is no longer accepting applications.", code: "campaign_closed" }, { status: 400, headers: NO_STORE });
    }

    const user = await getSessionUser().catch(() => null);
    if (!user) return Response.json({ error: "Please log in as a creator before applying.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    if (user.role !== "creator") return Response.json({ error: "Only creator accounts can apply to campaigns.", code: "forbidden" }, { status: 403, headers: NO_STORE });

    const [initialCreatorProfile] = await db
      .select({ id: creators.id, name: creators.name })
      .from(creators)
      .where(eq(creators.userId, user.id))
      .limit(1);
    if (!initialCreatorProfile) return Response.json({ error: "Please complete your creator profile before applying.", code: "creator_profile_incomplete" }, { status: 400, headers: NO_STORE });

    const creatorName = typeof body.creatorName === "string" ? body.creatorName.trim().slice(0, 100) : "";
    if (!creatorName) return Response.json({ error: "Please add your name / page name", code: "name_required" }, { status: 400, headers: NO_STORE });

    // Never reuse the account phone/email as the brand-facing contact. The
    // creator must enter the exact contact for this application and confirm
    // that YaarLink may share it with this campaign's brand.
    const contact = typeof body.creatorContact === "string" ? body.creatorContact.trim().slice(0, 120) : "";
    if (contact.length < 3) {
      return Response.json(
        { error: "Please enter the contact you want this brand to use.", code: "contact_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (body.contactSharingConsent !== true) {
      return Response.json(
        { error: "Please confirm that this brand may receive your application contact.", code: "contact_sharing_consent_required" },
        { status: 400, headers: NO_STORE },
      );
    }
    const message = cleanText(body.message, 1000) ?? null;

    type PostOutcome =
      | { kind: "created" | "reactivated"; application: typeof applications.$inferSelect; email: EmailNotice }
      | { kind: "duplicate" | "closed" | "profile_missing" | "campaign_missing" };

    const outcome: PostOutcome = await db.transaction(async (tx) => {
      // Locking the campaign makes pause/close and apply/reactivate decisions
      // serialize instead of racing based on the preliminary check above.
      const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1).for("update");
      if (!campaign) return { kind: "campaign_missing" } as const;
      if (campaign.status !== "open" || campaign.verificationStatus !== "verified") return { kind: "closed" } as const;

      const [creatorProfile] = await tx
        .select({ id: creators.id, name: creators.name })
        .from(creators)
        .where(eq(creators.userId, user.id))
        .limit(1);
      if (!creatorProfile) return { kind: "profile_missing" } as const;

      const [brandUser] = await tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, campaign.ownerId))
        .limit(1);
      if (!brandUser) return { kind: "campaign_missing" } as const;

      const [existing] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.campaignId, campaignId), eq(applications.userId, user.id)))
        .limit(1)
        .for("update");
      if (existing && existing.status !== "withdrawn") return { kind: "duplicate" } as const;

      if (contact) {
        const [duplicateContact] = await tx
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.campaignId, campaignId),
              eq(applications.creatorContact, contact),
              ne(applications.status, "withdrawn"),
              ...(existing ? [ne(applications.id, existing.id)] : []),
            ),
          )
          .limit(1);
        if (duplicateContact) return { kind: "duplicate" } as const;
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
      return Response.json({ application: outcome.application, reactivated: outcome.kind === "reactivated" }, { headers: NO_STORE });
    }
    if (outcome.kind === "duplicate") return Response.json({ error: "You have already applied to this campaign.", code: "already_applied" }, { status: 400, headers: NO_STORE });
    if (outcome.kind === "closed") return Response.json({ error: "This campaign is no longer accepting applications.", code: "campaign_closed" }, { status: 400, headers: NO_STORE });
    if (outcome.kind === "profile_missing") return Response.json({ error: "Please complete your creator profile before applying.", code: "creator_profile_incomplete" }, { status: 400, headers: NO_STORE });
    return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
  } catch (e) {
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
  const rl = rateLimit(getClientKey(req, "application-manage"), 60, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const body = bodyRecord(await req.json().catch(() => null));
    if (!body || !isUuid(body.id)) return Response.json({ error: "Invalid application", code: "invalid_target" }, { status: 400, headers: NO_STORE });
    const id = body.id;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    if (!CREATOR_ACTIONS.has(action) && !(action in BRAND_ACTIONS)) {
      return Response.json({ error: "Invalid application action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    if (hasField(body, "message") && body.message !== null && typeof body.message !== "string") {
      return Response.json({ error: "Please enter a valid application message.", code: "invalid_application_message" }, { status: 400, headers: NO_STORE });
    }
    if (hasField(body, "creatorContact") && typeof body.creatorContact !== "string") {
      return Response.json({ error: "Please enter a valid contact for the brand.", code: "invalid_application_contact" }, { status: 400, headers: NO_STORE });
    }
    if (hasField(body, "decisionNote") && body.decisionNote !== null && typeof body.decisionNote !== "string") {
      return Response.json({ error: "Please enter a valid decision note.", code: "invalid_decision_note" }, { status: 400, headers: NO_STORE });
    }

    const nextMessage = hasField(body, "message") ? cleanText(body.message, 1000) ?? null : undefined;
    const nextContact = hasField(body, "creatorContact") ? String(body.creatorContact).trim().slice(0, 120) : undefined;
    if (nextContact !== undefined && nextContact.length < 3) {
      return Response.json({ error: "Please enter a valid contact for the brand.", code: "invalid_application_contact" }, { status: 400, headers: NO_STORE });
    }
    const contactSharingConsent = body.contactSharingConsent === true;
    const decisionNote = hasField(body, "decisionNote") ? cleanText(body.decisionNote, 1000) ?? null : null;

    const user = await getSessionUser().catch(() => null);
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
            | "duplicate_contact"
            | "contact_required"
            | "consent_required";
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

      const isApplicant = user.role === "creator" && application.userId === user.id;
      const isCampaignOwner = user.role === "brand" && campaign.ownerId === user.id;
      if (CREATOR_ACTIONS.has(action) && !isApplicant) return { kind: "forbidden" } as const;
      if (action in BRAND_ACTIONS && !isCampaignOwner) return { kind: "forbidden" } as const;

      const now = new Date();
      const ensureContactIsFree = async () => {
        if (!nextContact) return true;
        const [duplicate] = await tx
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.campaignId, campaign.id),
              eq(applications.creatorContact, nextContact),
              ne(applications.status, "withdrawn"),
              ne(applications.id, application.id),
            ),
          )
          .limit(1);
        return !duplicate;
      };

      if (action === "edit") {
        if (nextMessage === undefined && nextContact === undefined) return { kind: "invalid_input" } as const;
        if (application.status !== "applied" && application.status !== "shortlisted") {
          return { kind: "invalid_transition", currentStatus: application.status } as const;
        }
        if (!(await ensureContactIsFree())) return { kind: "duplicate_contact" } as const;
        const [updated] = await tx
          .update(applications)
          .set({
            ...(nextMessage !== undefined ? { message: nextMessage } : {}),
            ...(nextContact !== undefined ? { creatorContact: nextContact } : {}),
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
        if (campaign.status !== "open" || campaign.verificationStatus !== "verified") return { kind: "closed" } as const;
        // Reactivation shares the saved application contact with the brand
        // again, including contacts created before explicit-consent UI was
        // added. Require a fresh confirmation and a usable contact.
        const effectiveContact = (nextContact ?? application.creatorContact ?? "").trim();
        if (effectiveContact.length < 3) return { kind: "contact_required" } as const;
        if (!contactSharingConsent) return { kind: "consent_required" } as const;
        if (!(await ensureContactIsFree())) return { kind: "duplicate_contact" } as const;
        const [brandUser] = await tx
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, campaign.ownerId))
          .limit(1);
        if (!brandUser) return { kind: "not_found" } as const;
        const [updated] = await tx
          .update(applications)
          .set({
            ...(nextMessage !== undefined ? { message: nextMessage } : {}),
            ...(nextContact !== undefined ? { creatorContact: nextContact } : {}),
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
    if (outcome.kind === "duplicate_contact") {
      return Response.json({ error: "That contact is already used by another application for this campaign.", code: "application_contact_conflict" }, { status: 409, headers: NO_STORE });
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
    console.error(e);
    return Response.json({ error: "Could not update application", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
