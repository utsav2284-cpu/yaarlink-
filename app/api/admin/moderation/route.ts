import { db } from "@/backend/db";
import { campaigns, creators, reports } from "@/backend/db/schema";
import { isAdmin } from "@/backend/admin";
import { logAdminAudit } from "@/backend/admin-audit";
import { createVerificationCode, isUuid, normalizeReviewStatus } from "@/backend/moderation";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function cleanNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 500) : null;
}

async function resolveOpenReports(targetType: "campaign" | "creator", targetId: string, now: Date) {
  await db
    .update(reports)
    .set({ status: "resolved", resolvedAt: now })
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, "open")));
}

export async function POST(req: Request) {
  try {
    if (!(await isAdmin())) return Response.json({ error: "Not allowed" }, { status: 401, headers: NO_STORE });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: "Invalid moderation request" }, { status: 400, headers: NO_STORE });

    const entity = body.entity;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const id = body.id;
    const note = cleanNote(body.note);
    const now = new Date();

    if (entity !== "creator" && entity !== "campaign" && entity !== "report") {
      return Response.json({ error: "Invalid moderation target" }, { status: 400, headers: NO_STORE });
    }
    if (!isUuid(id)) return Response.json({ error: "Invalid moderation target" }, { status: 400, headers: NO_STORE });

    const auditModeration = (details: Record<string, string | number | boolean | null | undefined> = {}) =>
      logAdminAudit(req, {
        action: `moderation.${entity}.${action || "unknown"}`,
        entity,
        entityId: id,
        details,
      });

    if (entity === "creator") {
      const [existing] = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Creator not found" }, { status: 404, headers: NO_STORE });

      if (action === "delete") {
        await db.delete(creators).where(eq(creators.id, id));
        await resolveOpenReports("creator", id, now);
        await auditModeration({ fromStatus: existing.status, toStatus: "deleted" });
        return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
      }

      if (normalizeReviewStatus(existing.status) === "incomplete") {
        return Response.json({ error: "This creator has not completed a profile yet." }, { status: 400, headers: NO_STORE });
      }

      if (action === "approve") {
        if (!existing.verificationCode) {
          return Response.json({ error: "Send this creator back to review first so a verification code is issued." }, { status: 400, headers: NO_STORE });
        }
        if (!existing.profileUrl && !existing.instagram && !existing.youtube) {
          return Response.json({ error: "This creator has no linked social profile to verify." }, { status: 400, headers: NO_STORE });
        }

        let verifiedFollowers = existing.followers ?? 0;
        if (body.verifiedFollowers !== undefined && body.verifiedFollowers !== null && body.verifiedFollowers !== "") {
          const parsed = Number(body.verifiedFollowers);
          if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000_000) {
            return Response.json({ error: "Please enter a valid verified follower count." }, { status: 400, headers: NO_STORE });
          }
          verifiedFollowers = parsed;
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

      return Response.json({ error: "Invalid creator action" }, { status: 400, headers: NO_STORE });
    }

    if (entity === "campaign") {
      const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (!existing) return Response.json({ error: "Campaign not found" }, { status: 404, headers: NO_STORE });

      if (action === "delete") {
        await db.delete(campaigns).where(eq(campaigns.id, id));
        await resolveOpenReports("campaign", id, now);
        await auditModeration({ fromStatus: existing.status, toStatus: "deleted" });
        return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
      }

      if (action === "approve") {
        if (!existing.verificationCode) {
          return Response.json({ error: "Send this campaign back to review first so a verification code is issued." }, { status: 400, headers: NO_STORE });
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

      if (action === "reject" || action === "close") {
        const [campaign] = await db
          .update(campaigns)
          .set({
            status: action === "reject" ? "rejected" : "closed",
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

      return Response.json({ error: "Invalid campaign action" }, { status: 400, headers: NO_STORE });
    }

    const [existingReport] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!existingReport) return Response.json({ error: "Report not found" }, { status: 404, headers: NO_STORE });

    if (action !== "resolve" && action !== "dismiss" && action !== "reopen") {
      return Response.json({ error: "Invalid report action" }, { status: 400, headers: NO_STORE });
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
    console.error(e);
    return Response.json({ error: "Could not complete moderation action" }, { status: 500, headers: NO_STORE });
  }
}
