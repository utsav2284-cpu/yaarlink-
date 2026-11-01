import { consumeBotChallenge } from "@/backend/bot-challenge";
import { db } from "@/backend/db";
import { campaigns, creators, reports } from "@/backend/db/schema";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionUnavailableResponse } from "@/backend/auth";
import {
  NO_STORE_HEADERS,
  hasField,
  parseOptionalText,
  parseUuid,
  readJsonObject,
  type ValidationResult,
} from "@/backend/validation";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from "@/shared/constants";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function errorResponse(result: { error: string; code: string; field?: string }, status = 400) {
  return Response.json(
    { error: result.error, code: result.code, ...(result.field ? { field: result.field } : {}) },
    { status, headers: NO_STORE_HEADERS },
  );
}

function parseOptionalReportText(
  body: Record<string, unknown>,
  field: "reporterName" | "reporterContact" | "details",
  maxLength: number,
): ValidationResult<string | null> {
  return hasField(body, field)
    ? parseOptionalText(body[field], { field, maxLength, multiline: field === "details" })
    : { ok: true, value: null };
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "report-create"), 10, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE_HEADERS });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    if (hasField(body, "website_url") && body.website_url != null && typeof body.website_url !== "string") {
      return errorResponse({ error: "Invalid report", code: "invalid_request", field: "website_url" });
    }
    if (typeof body.website_url === "string" && body.website_url.trim()) {
      return Response.json({ report: { id: crypto.randomUUID() } }, { status: 201, headers: NO_STORE_HEADERS });
    }
    if (!(await consumeBotChallenge(body.botChallenge, "report"))) {
      return Response.json(
        { error: "Security check failed. Please try again.", code: "bot_challenge_failed" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const targetType = typeof body.targetType === "string" ? body.targetType.trim() : "";
    const targetId = parseUuid(body.targetId);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (targetType !== "campaign" && targetType !== "creator") {
      return errorResponse({ error: "Invalid report target", code: "invalid_target", field: "targetType" });
    }
    if (!targetId) return errorResponse({ error: "Invalid report target", code: "invalid_target", field: "targetId" });
    if (!REPORT_REASONS.includes(reason as ReportReason)) {
      return errorResponse({ error: "Please choose a valid report reason.", code: "invalid_report_reason", field: "reason" });
    }

    const reporterName = parseOptionalReportText(body, "reporterName", 100);
    if (!reporterName.ok) return errorResponse(reporterName);
    const reporterContact = parseOptionalReportText(body, "reporterContact", 160);
    if (!reporterContact.ok) return errorResponse(reporterContact);
    const details = parseOptionalReportText(body, "details", 1000);
    if (!details.ok) return errorResponse(details);

    // Reports are accepted only for listings that are public right now.
    if (targetType === "creator") {
      const target = await db
        .select({ id: creators.id })
        .from(creators)
        .where(and(eq(creators.id, targetId), eq(creators.status, "approved"), eq(creators.verificationStatus, "verified")))
        .limit(1);
      if (!target.length) return errorResponse({ error: "This creator is not currently public.", code: "target_not_public" }, 404);
    } else {
      const target = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.id, targetId), eq(campaigns.status, "open"), eq(campaigns.verificationStatus, "verified")))
        .limit(1);
      if (!target.length) return errorResponse({ error: "This campaign is not currently public.", code: "target_not_public" }, 404);
    }

    const user = await getSessionUser();

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
        return errorResponse({ error: "You already have an open report for this listing.", code: "report_already_open" }, 409);
      }
    }

    const [report] = await db
      .insert(reports)
      .values({
        targetType,
        targetId,
        reporterUserId: user?.id ?? null,
        reporterName: reporterName.value ?? user?.name ?? null,
        // Only store a follow-up contact when the reporter explicitly provides one.
        reporterContact: reporterContact.value,
        reason: reason as ReportReason,
        details: details.value,
        status: "open",
      })
      .returning({ id: reports.id });

    return Response.json({ report }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE_HEADERS);
    }
    console.error(e);
    return errorResponse({ error: "Could not send report", code: "request_failed" }, 500);
  }
}
