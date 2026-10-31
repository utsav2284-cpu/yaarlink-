import { db } from "@/backend/db";
import { campaigns, creators, reports } from "@/backend/db/schema";
import { getSessionUser } from "@/backend/auth";
import { isUuid } from "@/backend/moderation";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from "@/shared/constants";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "report-create"), 10, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: "Invalid report" }, { status: 400 });

    const targetType = body.targetType as ReportTargetType;
    const targetId = body.targetId;
    const reason = body.reason as ReportReason;

    if (targetType !== "campaign" && targetType !== "creator") {
      return Response.json({ error: "Invalid report target" }, { status: 400 });
    }
    if (!isUuid(targetId)) return Response.json({ error: "Invalid report target" }, { status: 400 });
    if (!REPORT_REASONS.includes(reason)) {
      return Response.json({ error: "Please choose a valid report reason." }, { status: 400 });
    }

    // Reports are accepted only for listings that are public right now.
    if (targetType === "creator") {
      const target = await db
        .select({ id: creators.id })
        .from(creators)
        .where(and(eq(creators.id, targetId), eq(creators.status, "approved"), eq(creators.verificationStatus, "verified")))
        .limit(1);
      if (!target.length) return Response.json({ error: "This creator is not currently public." }, { status: 404 });
    } else {
      const target = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.id, targetId), eq(campaigns.status, "open"), eq(campaigns.verificationStatus, "verified")))
        .limit(1);
      if (!target.length) return Response.json({ error: "This campaign is not currently public." }, { status: 404 });
    }

    const user = await getSessionUser().catch(() => null);

    if (user) {
      const existing = await db
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            eq(reports.targetType, targetType),
            eq(reports.targetId, targetId),
            eq(reports.reporterUserId, user.id),
            eq(reports.status, "open"),
          ),
        )
        .limit(1);
      if (existing.length) {
        return Response.json({ error: "You already have an open report for this listing." }, { status: 409 });
      }
    }

    const [report] = await db
      .insert(reports)
      .values({
        targetType,
        targetId,
        reporterUserId: user?.id ?? null,
        reporterName: cleanText(body.reporterName, 100) ?? user?.name ?? null,
        // Only store a follow-up contact when the reporter explicitly provides one.
        reporterContact: cleanText(body.reporterContact, 160),
        reason,
        details: cleanText(body.details, 1000),
        status: "open",
      })
      .returning({ id: reports.id });

    return Response.json({ report }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not send report" }, { status: 500 });
  }
}
