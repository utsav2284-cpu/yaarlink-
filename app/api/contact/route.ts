import { consumeBotChallenge } from "@/backend/bot-challenge";
import { db } from "@/backend/db";
import { contacts } from "@/backend/db/schema";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import {
  NO_STORE_HEADERS,
  hasField,
  parseEmailField,
  parsePhoneField,
  parseRequiredText,
  readJsonObject,
} from "@/backend/validation";

export const dynamic = "force-dynamic";

// Messages are owner-only — read them via /api/admin/data.

function errorResponse(result: { error: string; code: string; field?: string }, status = 400) {
  return Response.json(
    { error: result.error, code: result.code, ...(result.field ? { field: result.field } : {}) },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "contact"), 5, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE_HEADERS });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

    if (hasField(body, "website_url") && body.website_url != null && typeof body.website_url !== "string") {
      return errorResponse({ error: "Please check the details and try again.", code: "invalid_request", field: "website_url" });
    }
    if (typeof body.website_url === "string" && body.website_url.trim()) {
      // Honeypot: mimic a successful creation without storing anything.
      return Response.json({ ok: true }, { status: 201, headers: NO_STORE_HEADERS });
    }

    if (!(await consumeBotChallenge(body.botChallenge, "contact"))) {
      return errorResponse({ error: "Security check failed. Please try again.", code: "bot_challenge_failed" });
    }

    const name = parseRequiredText(body.name, {
      field: "name",
      maxLength: 100,
      requiredCode: "name_required",
      requiredMessage: "Name is required",
    });
    if (!name.ok) return errorResponse(name);

    const message = parseRequiredText(body.message, {
      field: "message",
      maxLength: 2000,
      multiline: true,
      requiredCode: "message_required",
      requiredMessage: "Message is required",
    });
    if (!message.ok) return errorResponse(message);

    const email = parseEmailField(body.email, { field: "email" });
    if (!email.ok) return errorResponse(email);

    const phone = parsePhoneField(body.phone, { field: "phone" });
    if (!phone.ok) return errorResponse(phone);

    let kind: "brand" | "creator" | "other" = "brand";
    if (hasField(body, "kind") && body.kind != null) {
      if (typeof body.kind !== "string") {
        return errorResponse({ error: "Please check the details and try again.", code: "invalid_request", field: "kind" });
      }
      const requestedKind = body.kind.trim().toLowerCase();
      if (requestedKind !== "brand" && requestedKind !== "creator" && requestedKind !== "other") {
        return errorResponse({ error: "Please check the details and try again.", code: "invalid_request", field: "kind" });
      }
      kind = requestedKind;
    }

    await db.insert(contacts).values({
      name: name.value,
      email: email.value,
      phone: phone.value,
      kind,
      message: message.value,
    });

    return Response.json({ ok: true }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error(error);
    return errorResponse({ error: "Could not send", code: "request_failed" }, 500);
  }
}
