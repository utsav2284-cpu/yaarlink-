import {
  adminIdentityUnavailableResponse,
  inspectAdminAuthToken,
  isAdminAuthToken,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { logRouteError } from "@/backend/observability";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function invalidResponse() {
  return Response.json({ error: "This administrator password reset link is not valid.", code: "invalid_token" }, { status: 400, headers: NO_STORE });
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "admin-reset-inspect"), 20, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);

  try {
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const token = parsedBody.body.token;
    if (!isAdminAuthToken(token)) return invalidResponse();

    const tokenRl = await rateLimit(`admin-reset-inspect-token:${await hashKey(token)}`, 20, 15 * 60_000);
    if (!tokenRl.ok) return limitedResponse(tokenRl.retryAfter);

    const inspection = await inspectAdminAuthToken(token, "password_reset");
    if (!inspection) return invalidResponse();
    return Response.json({ ok: true, inspection }, { headers: NO_STORE });
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) {
      logAdminIdentityUnavailable(error, req);
      return adminIdentityUnavailableResponse(NO_STORE);
    }
    logRouteError(req, error, { component: "admin-identity", operation: "password_reset_inspect" });
    return Response.json({ error: "Could not check this reset link.", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
