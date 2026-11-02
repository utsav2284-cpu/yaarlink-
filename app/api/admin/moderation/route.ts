import { db } from "@/backend/db";
import { applications, brands, campaigns, contacts, creators, reports, userSessions, users } from "@/backend/db/schema";
import { adminSessionUnavailableResponse, isAdmin, isAdminSessionUnavailableError, logAdminSessionUnavailable } from "@/backend/admin";
import { logAdminAudit } from "@/backend/admin-audit";
import { createVerificationCode, normalizeReviewStatus } from "@/backend/moderation";
import { MAX_FOLLOWERS, hasField, parseIntegerField, parseOptionalText, parseUuid, readJsonObject } from "@/backend/validation";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/backend/social-url";
import { isCompletedCreatorProfile } from "@/backend/application-contact";
import { and, eq, isNull } from "drizzle-orm";
import { changedFieldNames, recordAuditEvent } from "@/backend/audit-events";
import { isCampaignPastExpiry, markCampaignExpired } from "@/backend/campaign-lifecycle";
import {
  getCampaignExpiryPolicy,
  PLATFORM_SETTINGS_ENTITY_ID,
  upsertCampaignExpiryPolicy,
  validCampaignExpiryPolicy,
} from "@/backend/platform-settings";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function invalidTarget() {
  return Response.json({ error: "Invalid moderation target", code: "invalid_target" }, { status: 400, headers: NO_STORE });
}

async function resolveOpenReports(
  executor: Pick<typeof db, "insert" | "update">,
  targetType: "campaign" | "creator",
  targetId: string,
  now: Date,
) {
  const rows = await executor
    .update(reports)
    .set({ status: "resolved", resolvedAt: now, updatedAt: now })
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, "open")))
    .returning({ id: reports.id, reporterUserId: reports.reporterUserId });
  for (const row of rows) {
    await recordAuditEvent(executor, {
      actorType: "admin",
      ownerUserId: row.reporterUserId,
      entityType: "report",
      entityId: row.id,
      action: "report.status_changed",
      fromStatus: "open",
      toStatus: "resolved",
      changedFields: ["resolvedAt", "status"],
      metadata: { targetType, targetId },
      createdAt: now,
    });
  }
  return rows.length;
}

export async function POST(req: Request) {
  try {
    if (!(await isAdmin())) return Response.json({ error: "Not allowed", code: "unauthorized" }, { status: 401, headers: NO_STORE });

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

    const entity = typeof body.entity === "string" ? body.entity.trim().toLowerCase() : "";
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const id = parseUuid(body.id);
    const parsedNote = hasField(body, "note")
      ? parseOptionalText(body.note, {
          field: "note",
          maxLength: 500,
          invalidCode: "invalid_request",
          invalidMessage: "Please enter a valid moderation note.",
        })
      : ({ ok: true, value: null } as const);
    if (!parsedNote.ok) {
      return Response.json(
        { error: parsedNote.error, code: parsedNote.code, field: parsedNote.field },
        { status: 400, headers: NO_STORE },
      );
    }
    const note = parsedNote.value;
    const now = new Date();

    if (entity !== "creator" && entity !== "campaign" && entity !== "report" && entity !== "application" && entity !== "contact" && entity !== "user" && entity !== "brand" && entity !== "setting") {
      return invalidTarget();
    }
    if (!id) return invalidTarget();

    const auditModeration = (details: Record<string, string | number | boolean | null | undefined> = {}) =>
      logAdminAudit(req, {
        action: `moderation.${entity}.${action || "unknown"}`,
        entity,
        entityId: id,
        details,
      });

    if (entity === "setting") {
      if (id !== PLATFORM_SETTINGS_ENTITY_ID || action !== "update") return invalidTarget();
      const parsedDefault = parseIntegerField(body.campaignDefaultExpiryDays, {
        field: "campaignDefaultExpiryDays",
        min: 7,
        max: 90,
        code: "invalid_platform_setting",
        error: "Please enter a valid campaign expiry setting.",
      });
      if (!parsedDefault.ok) {
        return Response.json(
          { error: parsedDefault.error, code: parsedDefault.code, field: parsedDefault.field },
          { status: 400, headers: NO_STORE },
        );
      }
      const parsedMax = parseIntegerField(body.campaignMaxExpiryDays, {
        field: "campaignMaxExpiryDays",
        min: 7,
        max: 365,
        code: "invalid_platform_setting",
        error: "Please enter a valid campaign expiry setting.",
      });
      if (!parsedMax.ok) {
        return Response.json(
          { error: parsedMax.error, code: parsedMax.code, field: parsedMax.field },
          { status: 400, headers: NO_STORE },
        );
      }
      const nextPolicy = {
        defaultExpiryDays: parsedDefault.value,
        maxExpiryDays: parsedMax.value,
      };
      if (!validCampaignExpiryPolicy(nextPolicy)) {
        return Response.json(
          { error: "Please enter a valid campaign expiry setting.", code: "invalid_platform_setting" },
          { status: 400, headers: NO_STORE },
        );
      }
      const previousPolicy = await db.transaction(async (tx) => {
        const previous = await getCampaignExpiryPolicy(tx);
        await upsertCampaignExpiryPolicy(tx, nextPolicy, now);
        await recordAuditEvent(tx, {
          actorType: "admin",
          entityType: "setting",
          entityId: PLATFORM_SETTINGS_ENTITY_ID,
          action: "setting.updated",
          changedFields: [
            ...(previous.defaultExpiryDays !== nextPolicy.defaultExpiryDays ? ["campaignDefaultExpiryDays"] : []),
            ...(previous.maxExpiryDays !== nextPolicy.maxExpiryDays ? ["campaignMaxExpiryDays"] : []),
          ],
          metadata: {
            defaultExpiryDays: nextPolicy.defaultExpiryDays,
            maxExpiryDays: nextPolicy.maxExpiryDays,
          },
          createdAt: now,
        });
        return previous;
      });
      await auditModeration({
        defaultExpiryDays: nextPolicy.defaultExpiryDays,
        maxExpiryDays: nextPolicy.maxExpiryDays,
        previousDefaultExpiryDays: previousPolicy.defaultExpiryDays,
        previousMaxExpiryDays: previousPolicy.maxExpiryDays,
      });
      return Response.json({ ok: true, settings: nextPolicy }, { headers: NO_STORE });
    }

    if (entity === "user") {
      const [existing] = await db
        .select({ id: users.id, role: users.role, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) return Response.json({ error: "User not found", code: "user_not_found" }, { status: 404, headers: NO_STORE });
      if (action !== "revoke_sessions") return Response.json({ error: "Invalid user action", code: "invalid_action" }, { status: 400, headers: NO_STORE });

      const revoked = await db.transaction(async (tx) => {
        const [user] = await tx.select({ tokenVersion: users.tokenVersion }).from(users).where(eq(users.id, id)).limit(1).for("update");
        if (!user) return null;
        await tx.update(users).set({ tokenVersion: user.tokenVersion + 1, updatedAt: now }).where(eq(users.id, id));
        const sessions = await tx
          .update(userSessions)
          .set({ revokedAt: now })
          .where(and(eq(userSessions.userId, id), isNull(userSessions.revokedAt)))
          .returning({ id: userSessions.id });
        await recordAuditEvent(tx, {
          actorType: "admin",
          ownerUserId: id,
          entityType: "user",
          entityId: id,
          action: "user.sessions_revoked",
          changedFields: ["tokenVersion"],
          metadata: { sessionsRevoked: sessions.length },
          createdAt: now,
        });
        return { count: sessions.length, tokenVersion: user.tokenVersion + 1 };
      });
      if (!revoked) return Response.json({ error: "User not found", code: "user_not_found" }, { status: 404, headers: NO_STORE });
      await auditModeration({ sessionsRevoked: revoked.count, sessionVersion: revoked.tokenVersion });
      return Response.json({ ok: true, user: { id, revokedSessions: revoked.count } }, { headers: NO_STORE });
    }

    if (entity === "brand") {
      const [existing] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Brand record not found", code: "brand_not_found" }, { status: 404, headers: NO_STORE });
      if (action !== "sync") return Response.json({ error: "Invalid brand action", code: "invalid_action" }, { status: 400, headers: NO_STORE });

      const [account] = await db
        .select({ email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id, existing.userId))
        .limit(1);
      if (!account) return Response.json({ error: "User not found", code: "user_not_found" }, { status: 404, headers: NO_STORE });

      const brand = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(brands)
          .set({ email: account.email, phone: account.phone, status: "active", updatedAt: now })
          .where(eq(brands.id, id))
          .returning({
            id: brands.id,
            userId: brands.userId,
            name: brands.name,
            email: brands.email,
            phone: brands.phone,
            status: brands.status,
            createdAt: brands.createdAt,
            updatedAt: brands.updatedAt,
          });
        if (!updated) return null;
        await recordAuditEvent(tx, {
          actorType: "admin",
          ownerUserId: existing.userId,
          entityType: "brand",
          entityId: updated.id,
          action: "brand.contact_synced",
          fromStatus: existing.status,
          toStatus: updated.status,
          changedFields: [
            ...(existing.email !== account.email ? ["email"] : []),
            ...(existing.phone !== account.phone ? ["phone"] : []),
          ],
          createdAt: now,
        });
        return updated;
      });
      await auditModeration({
        emailChanged: existing.email !== account.email,
        phoneChanged: existing.phone !== account.phone,
      });
      return Response.json({ ok: true, brand }, { headers: NO_STORE });
    }

    if (entity === "creator") {
      const [existing] = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Creator not found", code: "creator_profile_not_found" }, { status: 404, headers: NO_STORE });

      if (action === "delete") {
        await db.transaction(async (tx) => {
          await tx.delete(creators).where(eq(creators.id, id));
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.userId,
            entityType: "creator_profile",
            entityId: id,
            action: "creator_profile.deleted",
            fromStatus: existing.status,
            toStatus: "deleted",
            createdAt: now,
          });
          await resolveOpenReports(tx, "creator", id, now);
        });
        await auditModeration({ fromStatus: existing.status, toStatus: "deleted" });
        return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
      }

      if (normalizeReviewStatus(existing.status) === "incomplete") {
        return Response.json({ error: "This creator has not completed a profile yet.", code: "creator_profile_incomplete" }, { status: 409, headers: NO_STORE });
      }

      if (action === "approve") {
        if (!isCompletedCreatorProfile(existing)) {
          return Response.json({ error: "This creator profile is missing required profile information.", code: "creator_profile_incomplete" }, { status: 409, headers: NO_STORE });
        }
        if (!existing.verificationCode) {
          return Response.json({ error: "Send this creator back to review first so a verification code is issued.", code: "creator_review_required" }, { status: 409, headers: NO_STORE });
        }
        const hasLinkedProfile = Boolean(
          normalizeProfileUrl(existing.profileUrl, existing.platform) ??
            normalizeInstagramUrl(existing.instagram) ??
            normalizeYouTubeUrl(existing.youtube),
        );
        if (!hasLinkedProfile) {
          return Response.json({ error: "This creator has no linked social profile to verify.", code: "creator_no_linked_profile" }, { status: 409, headers: NO_STORE });
        }

        let verifiedFollowers = existing.followers ?? 0;
        if (hasField(body, "verifiedFollowers") && body.verifiedFollowers != null && body.verifiedFollowers !== "") {
          const parsed = parseIntegerField(body.verifiedFollowers, {
            field: "verifiedFollowers",
            min: 0,
            max: MAX_FOLLOWERS,
            code: "invalid_followers",
            error: "Please enter a valid verified follower count.",
          });
          if (!parsed.ok) {
            return Response.json(
              { error: parsed.error, code: parsed.code, field: parsed.field },
              { status: 400, headers: NO_STORE },
            );
          }
          verifiedFollowers = parsed.value;
        }

        const creator = await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(creators)
            .set({
              status: "approved",
              verificationStatus: "verified",
              verifiedFollowers,
              moderationNote: note,
              reviewedAt: now,
              // Legacy rows may not have an effective listing date yet.
              // Approval is their first public moment; an existing date is
              // retained so routine re-approval does not refresh ordering.
              listedAt: existing.listedAt ?? now,
              updatedAt: now,
            })
            .where(eq(creators.id, id))
            .returning({
              id: creators.id,
              status: creators.status,
              verificationStatus: creators.verificationStatus,
              verifiedFollowers: creators.verifiedFollowers,
              reviewedAt: creators.reviewedAt,
              listedAt: creators.listedAt,
              updatedAt: creators.updatedAt,
            });
          if (!updated) return null;
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.userId,
            entityType: "creator_profile",
            entityId: updated.id,
            action: "creator_profile.status_changed",
            fromStatus: existing.status,
            toStatus: updated.status,
            changedFields: changedFieldNames(existing, {
              status: updated.status,
              verificationStatus: updated.verificationStatus,
              verifiedFollowers: updated.verifiedFollowers,
              moderationNote: note,
              reviewedAt: updated.reviewedAt,
              listedAt: updated.listedAt,
            }),
            metadata: { notePresent: Boolean(note) },
            createdAt: now,
          });
          return updated;
        });
        await auditModeration({ fromStatus: existing.status, toStatus: creator?.status ?? "approved", verifiedFollowers, notePresent: Boolean(note) });
        return Response.json({ ok: true, creator }, { headers: NO_STORE });
      }

      if (action === "reject" || action === "suspend") {
        const creator = await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(creators)
            .set({
              status: action === "reject" ? "rejected" : "suspended",
              verificationStatus: "failed",
              verifiedFollowers: null,
              moderationNote: note,
              reviewedAt: now,
              updatedAt: now,
            })
            .where(eq(creators.id, id))
            .returning({
              id: creators.id,
              status: creators.status,
              verificationStatus: creators.verificationStatus,
              reviewedAt: creators.reviewedAt,
              updatedAt: creators.updatedAt,
            });
          if (!updated) return null;
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.userId,
            entityType: "creator_profile",
            entityId: updated.id,
            action: "creator_profile.status_changed",
            fromStatus: existing.status,
            toStatus: updated.status,
            changedFields: ["moderationNote", "reviewedAt", "status", "verificationStatus", "verifiedFollowers"],
            metadata: { notePresent: Boolean(note) },
            createdAt: now,
          });
          await resolveOpenReports(tx, "creator", id, now);
          return updated;
        });
        await auditModeration({ fromStatus: existing.status, toStatus: creator?.status ?? null, notePresent: Boolean(note) });
        return Response.json({ ok: true, creator }, { headers: NO_STORE });
      }

      if (action === "review") {
        const creator = await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(creators)
            .set({
              status: "pending",
              verificationCode: existing.verificationCode ?? createVerificationCode(),
              verificationStatus: "pending",
              verifiedFollowers: null,
              moderationNote: note,
              reviewedAt: null,
              updatedAt: now,
            })
            .where(eq(creators.id, id))
            .returning({
              id: creators.id,
              status: creators.status,
              verificationStatus: creators.verificationStatus,
              verificationCode: creators.verificationCode,
              updatedAt: creators.updatedAt,
            });
          if (!updated) return null;
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.userId,
            entityType: "creator_profile",
            entityId: updated.id,
            action: "creator_profile.status_changed",
            fromStatus: existing.status,
            toStatus: updated.status,
            changedFields: ["moderationNote", "reviewedAt", "status", "verificationCode", "verificationStatus", "verifiedFollowers"],
            metadata: { notePresent: Boolean(note), codeIssued: !existing.verificationCode },
            createdAt: now,
          });
          return updated;
        });
        await auditModeration({ fromStatus: existing.status, toStatus: creator?.status ?? "pending", codeIssued: !existing.verificationCode, notePresent: Boolean(note) });
        return Response.json({ ok: true, creator }, { headers: NO_STORE });
      }

      return Response.json({ error: "Invalid creator action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    if (entity === "campaign") {
      let [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });

      if (action === "delete") {
        await db.transaction(async (tx) => {
          await tx.delete(campaigns).where(eq(campaigns.id, id));
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.ownerId,
            entityType: "campaign",
            entityId: id,
            action: "campaign.deleted",
            fromStatus: existing.status,
            toStatus: "deleted",
            createdAt: now,
          });
          await resolveOpenReports(tx, "campaign", id, now);
        });
        await auditModeration({ fromStatus: existing.status, toStatus: "deleted" });
        return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
      }

      if (isCampaignPastExpiry(existing, now)) {
        await db.transaction(async (tx) => {
          const [locked] = await tx.select().from(campaigns).where(eq(campaigns.id, id)).limit(1).for("update");
          if (locked) await markCampaignExpired(tx, locked, now);
        });
        if (action === "approve" || action === "review") {
          return Response.json(
            { error: "This campaign has expired. The owner must extend its deadline and submit it again.", code: "campaign_expired" },
            { status: 409, headers: NO_STORE },
          );
        }
        [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
        if (!existing) return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });
      }

      if (action === "approve") {
        if (existing.status === "expired" || existing.expiresAt.getTime() <= now.getTime()) {
          return Response.json(
            { error: "This campaign has expired. The owner must extend its deadline and submit it again.", code: "campaign_expired" },
            { status: 409, headers: NO_STORE },
          );
        }
        if (!existing.verificationCode) {
          return Response.json({ error: "Send this campaign back to review first so a verification code is issued.", code: "campaign_review_required" }, { status: 409, headers: NO_STORE });
        }
        const campaign = await db.transaction(async (tx) => {
          const [brand] = existing.brandId
            ? [{ id: existing.brandId }]
            : await tx.select({ id: brands.id }).from(brands).where(eq(brands.userId, existing.ownerId)).limit(1);
          const [updated] = await tx
            .update(campaigns)
            .set({
              brandId: brand?.id ?? null,
              status: "open",
              verificationStatus: "verified",
              moderationNote: note,
              reviewedAt: now,
              expiredAt: null,
              updatedAt: now,
            })
            .where(eq(campaigns.id, id))
            .returning({
              id: campaigns.id,
              brandId: campaigns.brandId,
              status: campaigns.status,
              verificationStatus: campaigns.verificationStatus,
              reviewedAt: campaigns.reviewedAt,
              deadlineAt: campaigns.deadlineAt,
              expiresAt: campaigns.expiresAt,
              updatedAt: campaigns.updatedAt,
            });
          if (!updated) return null;
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.ownerId,
            entityType: "campaign",
            entityId: updated.id,
            action: "campaign.status_changed",
            fromStatus: existing.status,
            toStatus: updated.status,
            changedFields: changedFieldNames(existing, {
              brandId: updated.brandId,
              status: updated.status,
              verificationStatus: updated.verificationStatus,
              moderationNote: note,
              reviewedAt: updated.reviewedAt,
              expiredAt: null,
            }),
            metadata: { notePresent: Boolean(note) },
            createdAt: now,
          });
          return updated;
        });
        await auditModeration({ fromStatus: existing.status, toStatus: campaign?.status ?? "open", notePresent: Boolean(note) });
        return Response.json({ ok: true, campaign }, { headers: NO_STORE });
      }

      if (action === "reject" || action === "close" || action === "suspend") {
        const campaign = await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(campaigns)
            .set({
              status: action === "reject" ? "rejected" : action === "suspend" ? "suspended" : "closed",
              verificationStatus: action === "reject" ? "failed" : (existing.verificationStatus ?? "failed"),
              moderationNote: note,
              reviewedAt: now,
              updatedAt: now,
            })
            .where(eq(campaigns.id, id))
            .returning({
              id: campaigns.id,
              status: campaigns.status,
              verificationStatus: campaigns.verificationStatus,
              reviewedAt: campaigns.reviewedAt,
              expiresAt: campaigns.expiresAt,
              updatedAt: campaigns.updatedAt,
            });
          if (!updated) return null;
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.ownerId,
            entityType: "campaign",
            entityId: updated.id,
            action: "campaign.status_changed",
            fromStatus: existing.status,
            toStatus: updated.status,
            changedFields: ["moderationNote", "reviewedAt", "status", "verificationStatus"],
            metadata: { notePresent: Boolean(note) },
            createdAt: now,
          });
          await resolveOpenReports(tx, "campaign", id, now);
          return updated;
        });
        await auditModeration({ fromStatus: existing.status, toStatus: campaign?.status ?? null, notePresent: Boolean(note) });
        return Response.json({ ok: true, campaign }, { headers: NO_STORE });
      }

      if (action === "review") {
        if (existing.status === "expired" || existing.expiresAt.getTime() <= now.getTime()) {
          return Response.json(
            { error: "This campaign has expired. The owner must extend its deadline and submit it again.", code: "campaign_expired" },
            { status: 409, headers: NO_STORE },
          );
        }
        const campaign = await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(campaigns)
            .set({
              status: "pending",
              verificationCode: existing.verificationCode ?? createVerificationCode(),
              verificationStatus: "pending",
              moderationNote: note,
              reviewedAt: null,
              updatedAt: now,
            })
            .where(eq(campaigns.id, id))
            .returning({
              id: campaigns.id,
              status: campaigns.status,
              verificationStatus: campaigns.verificationStatus,
              verificationCode: campaigns.verificationCode,
              expiresAt: campaigns.expiresAt,
              updatedAt: campaigns.updatedAt,
            });
          if (!updated) return null;
          await recordAuditEvent(tx, {
            actorType: "admin",
            ownerUserId: existing.ownerId,
            entityType: "campaign",
            entityId: updated.id,
            action: "campaign.status_changed",
            fromStatus: existing.status,
            toStatus: updated.status,
            changedFields: ["moderationNote", "reviewedAt", "status", "verificationCode", "verificationStatus"],
            metadata: { notePresent: Boolean(note), codeIssued: !existing.verificationCode },
            createdAt: now,
          });
          return updated;
        });
        await auditModeration({ fromStatus: existing.status, toStatus: campaign?.status ?? "pending", codeIssued: !existing.verificationCode, notePresent: Boolean(note) });
        return Response.json({ ok: true, campaign }, { headers: NO_STORE });
      }

      return Response.json({ error: "Invalid campaign action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    if (entity === "application") {
      const [existing] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Application not found", code: "application_not_found" }, { status: 404, headers: NO_STORE });
      if (action !== "delete") return Response.json({ error: "Invalid application action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
      await db.transaction(async (tx) => {
        await tx.delete(applications).where(eq(applications.id, id));
        await recordAuditEvent(tx, {
          actorType: "admin",
          ownerUserId: existing.userId,
          entityType: "application",
          entityId: id,
          action: "application.deleted",
          fromStatus: existing.status,
          toStatus: "deleted",
          metadata: { campaignId: existing.campaignId, creatorId: existing.creatorId },
          createdAt: now,
        });
      });
      await auditModeration({ fromStatus: existing.status, toStatus: "deleted", campaignId: existing.campaignId });
      return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
    }

    if (entity === "contact") {
      const [existing] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Contact message not found", code: "contact_not_found" }, { status: 404, headers: NO_STORE });
      if (action !== "delete") return Response.json({ error: "Invalid contact action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
      await db.transaction(async (tx) => {
        await tx.delete(contacts).where(eq(contacts.id, id));
        await recordAuditEvent(tx, {
          actorType: "admin",
          entityType: "contact",
          entityId: id,
          action: "contact.deleted",
          fromStatus: existing.kind,
          toStatus: "deleted",
          createdAt: now,
        });
      });
      await auditModeration({ fromStatus: existing.kind, toStatus: "deleted" });
      return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
    }

    const [existingReport] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!existingReport) return Response.json({ error: "Report not found", code: "report_not_found" }, { status: 404, headers: NO_STORE });

    if (action !== "resolve" && action !== "dismiss" && action !== "reopen") {
      return Response.json({ error: "Invalid report action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    const report = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(reports)
        .set({
          status: action === "resolve" ? "resolved" : action === "dismiss" ? "dismissed" : "open",
          adminNote: note ?? existingReport.adminNote,
          resolvedAt: action === "reopen" ? null : now,
          updatedAt: now,
        })
        .where(eq(reports.id, id))
        .returning({ id: reports.id, status: reports.status, resolvedAt: reports.resolvedAt, updatedAt: reports.updatedAt });
      if (!updated) return null;
      await recordAuditEvent(tx, {
        actorType: "admin",
        ownerUserId: existingReport.reporterUserId,
        entityType: "report",
        entityId: updated.id,
        action: "report.status_changed",
        fromStatus: existingReport.status,
        toStatus: updated.status,
        changedFields: ["adminNote", "resolvedAt", "status"],
        metadata: {
          targetType: existingReport.targetType,
          targetId: existingReport.targetId,
          notePresent: Boolean(note),
        },
        createdAt: now,
      });
      return updated;
    });
    await auditModeration({
      fromStatus: existingReport.status,
      toStatus: report?.status ?? null,
      targetType: existingReport.targetType,
      targetId: existingReport.targetId,
      notePresent: Boolean(note),
    });
    return Response.json({ ok: true, report }, { headers: NO_STORE });
  } catch (e) {
    if (isAdminSessionUnavailableError(e)) {
      logAdminSessionUnavailable(e);
      return adminSessionUnavailableResponse(NO_STORE);
    }
    console.error(e);
    return Response.json({ error: "Could not complete moderation action", code: "moderation_failed" }, { status: 500, headers: NO_STORE });
  }
}
