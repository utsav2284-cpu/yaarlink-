import { db } from "@/backend/db";
import { applications, campaigns, contacts, creators, reports } from "@/backend/db/schema";
import { adminSessionUnavailableResponse, isAdmin, isAdminSessionUnavailableError, logAdminSessionUnavailable } from "@/backend/admin";
import { logAdminAudit } from "@/backend/admin-audit";
import { createVerificationCode, normalizeReviewStatus } from "@/backend/moderation";
import { MAX_FOLLOWERS, hasField, parseIntegerField, parseOptionalText, parseUuid, readJsonObject } from "@/backend/validation";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function invalidTarget() {
  return Response.json({ error: "Invalid moderation target", code: "invalid_target" }, { status: 400, headers: NO_STORE });
}

async function resolveOpenReports(targetType: "campaign" | "creator", targetId: string, now: Date) {
  await db
    .update(reports)
    .set({ status: "resolved", resolvedAt: now })
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, "open")));
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

    if (entity !== "creator" && entity !== "campaign" && entity !== "report" && entity !== "application" && entity !== "contact") {
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

    if (entity === "creator") {
      const [existing] = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Creator not found", code: "creator_profile_not_found" }, { status: 404, headers: NO_STORE });

      if (action === "delete") {
        await db.delete(creators).where(eq(creators.id, id));
        await resolveOpenReports("creator", id, now);
        await auditModeration({ fromStatus: existing.status, toStatus: "deleted" });
        return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
      }

      if (normalizeReviewStatus(existing.status) === "incomplete") {
        return Response.json({ error: "This creator has not completed a profile yet.", code: "creator_profile_incomplete" }, { status: 409, headers: NO_STORE });
      }

      if (action === "approve") {
        if (!existing.verificationCode) {
          return Response.json({ error: "Send this creator back to review first so a verification code is issued.", code: "creator_review_required" }, { status: 409, headers: NO_STORE });
        }
        if (!existing.profileUrl && !existing.instagram && !existing.youtube) {
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

        const [creator] = await db
          .update(creators)
          .set({
            status: "approved",
            verificationStatus: "verified",
            verifiedFollowers,
            moderationNote: note,
            reviewedAt: now,
          })
          .where(eq(creators.id, id))
          .returning({ id: creators.id, status: creators.status, verificationStatus: creators.verificationStatus, verifiedFollowers: creators.verifiedFollowers, reviewedAt: creators.reviewedAt });
        await auditModeration({ fromStatus: existing.status, toStatus: creator?.status ?? "approved", verifiedFollowers, notePresent: Boolean(note) });
        return Response.json({ ok: true, creator }, { headers: NO_STORE });
      }

      if (action === "reject" || action === "suspend") {
        const [creator] = await db
          .update(creators)
          .set({
            status: action === "reject" ? "rejected" : "suspended",
            verificationStatus: "failed",
            verifiedFollowers: null,
            moderationNote: note,
            reviewedAt: now,
          })
          .where(eq(creators.id, id))
          .returning({ id: creators.id, status: creators.status, verificationStatus: creators.verificationStatus, reviewedAt: creators.reviewedAt });
        await resolveOpenReports("creator", id, now);
        await auditModeration({ fromStatus: existing.status, toStatus: creator?.status ?? null, notePresent: Boolean(note) });
        return Response.json({ ok: true, creator }, { headers: NO_STORE });
      }

      if (action === "review") {
        const [creator] = await db
          .update(creators)
          .set({
            status: "pending",
            verificationCode: existing.verificationCode ?? createVerificationCode(),
            verificationStatus: "pending",
            verifiedFollowers: null,
            moderationNote: note,
            reviewedAt: null,
          })
          .where(eq(creators.id, id))
          .returning({ id: creators.id, status: creators.status, verificationStatus: creators.verificationStatus, verificationCode: creators.verificationCode });
        await auditModeration({ fromStatus: existing.status, toStatus: creator?.status ?? "pending", codeIssued: !existing.verificationCode, notePresent: Boolean(note) });
        return Response.json({ ok: true, creator }, { headers: NO_STORE });
      }

      return Response.json({ error: "Invalid creator action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    if (entity === "campaign") {
      const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Campaign not found", code: "campaign_not_found" }, { status: 404, headers: NO_STORE });

      if (action === "delete") {
        await db.delete(campaigns).where(eq(campaigns.id, id));
        await resolveOpenReports("campaign", id, now);
        await auditModeration({ fromStatus: existing.status, toStatus: "deleted" });
        return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
      }

      if (action === "approve") {
        if (!existing.verificationCode) {
          return Response.json({ error: "Send this campaign back to review first so a verification code is issued.", code: "campaign_review_required" }, { status: 409, headers: NO_STORE });
        }
        const [campaign] = await db
          .update(campaigns)
          .set({
            status: "open",
            verificationStatus: "verified",
            moderationNote: note,
            reviewedAt: now,
          })
          .where(eq(campaigns.id, id))
          .returning({ id: campaigns.id, status: campaigns.status, verificationStatus: campaigns.verificationStatus, reviewedAt: campaigns.reviewedAt });
        await auditModeration({ fromStatus: existing.status, toStatus: campaign?.status ?? "open", notePresent: Boolean(note) });
        return Response.json({ ok: true, campaign }, { headers: NO_STORE });
      }

      if (action === "reject" || action === "close" || action === "suspend") {
        const [campaign] = await db
          .update(campaigns)
          .set({
            status: action === "reject" ? "rejected" : action === "suspend" ? "suspended" : "closed",
            verificationStatus: action === "reject" ? "failed" : (existing.verificationStatus ?? "failed"),
            moderationNote: note,
            reviewedAt: now,
          })
          .where(eq(campaigns.id, id))
          .returning({ id: campaigns.id, status: campaigns.status, verificationStatus: campaigns.verificationStatus, reviewedAt: campaigns.reviewedAt });
        await resolveOpenReports("campaign", id, now);
        await auditModeration({ fromStatus: existing.status, toStatus: campaign?.status ?? null, notePresent: Boolean(note) });
        return Response.json({ ok: true, campaign }, { headers: NO_STORE });
      }

      if (action === "review") {
        const [campaign] = await db
          .update(campaigns)
          .set({
            status: "pending",
            verificationCode: existing.verificationCode ?? createVerificationCode(),
            verificationStatus: "pending",
            moderationNote: note,
            reviewedAt: null,
          })
          .where(eq(campaigns.id, id))
          .returning({ id: campaigns.id, status: campaigns.status, verificationStatus: campaigns.verificationStatus, verificationCode: campaigns.verificationCode });
        await auditModeration({ fromStatus: existing.status, toStatus: campaign?.status ?? "pending", codeIssued: !existing.verificationCode, notePresent: Boolean(note) });
        return Response.json({ ok: true, campaign }, { headers: NO_STORE });
      }

      return Response.json({ error: "Invalid campaign action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    if (entity === "application") {
      const [existing] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Application not found", code: "application_not_found" }, { status: 404, headers: NO_STORE });
      if (action !== "delete") return Response.json({ error: "Invalid application action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
      await db.delete(applications).where(eq(applications.id, id));
      await auditModeration({ fromStatus: existing.status, toStatus: "deleted", campaignId: existing.campaignId });
      return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
    }

    if (entity === "contact") {
      const [existing] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Contact message not found", code: "contact_not_found" }, { status: 404, headers: NO_STORE });
      if (action !== "delete") return Response.json({ error: "Invalid contact action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
      await db.delete(contacts).where(eq(contacts.id, id));
      await auditModeration({ fromStatus: existing.kind, toStatus: "deleted" });
      return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
    }

    const [existingReport] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!existingReport) return Response.json({ error: "Report not found", code: "report_not_found" }, { status: 404, headers: NO_STORE });

    if (action !== "resolve" && action !== "dismiss" && action !== "reopen") {
      return Response.json({ error: "Invalid report action", code: "invalid_action" }, { status: 400, headers: NO_STORE });
    }

    const [report] = await db
      .update(reports)
      .set({
        status: action === "resolve" ? "resolved" : action === "dismiss" ? "dismissed" : "open",
        adminNote: note ?? existingReport.adminNote,
        resolvedAt: action === "reopen" ? null : now,
      })
      .where(eq(reports.id, id))
      .returning({ id: reports.id, status: reports.status, resolvedAt: reports.resolvedAt });
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
