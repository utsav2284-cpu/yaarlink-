import { buildAccountExport, verifyUserPassword } from "@/backend/account";
import { getSessionContext, isSessionUnavailableError, logSessionUnavailable, sessionUnavailableResponse } from "@/backend/auth";
import { PASSWORD_MAX_LENGTH, passwordLength } from "@/backend/password-policy";
import { hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { readJsonObject } from "@/backend/validation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function jsonError(status: number, error: string, code: string) {
  return Response.json({ error, code }, { status, headers: NO_STORE });
}

export async function POST(req: Request) {
  try {
    const context = await getSessionContext();
    if (!context) return jsonError(401, "Please log in", "unauthorized");

    const rl = await rateLimit(`account-export:${await hashKey(context.user.id)}`, 5, 15 * 60_000);
    if (!rl.ok) return limitedResponse(rl.retryAfter);

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const currentPassword = typeof parsedBody.body.currentPassword === "string" ? parsedBody.body.currentPassword : "";
    if (!currentPassword || passwordLength(currentPassword) > PASSWORD_MAX_LENGTH) {
      return jsonError(400, "Current password is required.", "current_password_required");
    }
    if (!(await verifyUserPassword(context.user.id, currentPassword))) {
      return jsonError(400, "Current password is incorrect.", "wrong_password");
    }

    const data = await buildAccountExport(context.user.id);
    if (!data) return jsonError(401, "Please log in again", "unauthorized");

    const date = new Date().toISOString().slice(0, 10);
    return new Response(`${JSON.stringify(data, null, 2)}\n`, {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="yaarlink-data-${date}.json"`,
      },
    });
  } catch (error) {
    if (isSessionUnavailableError(error)) {
      logSessionUnavailable(error);
      return sessionUnavailableResponse(NO_STORE);
    }
    console.error(error);
    return jsonError(500, "Could not export account data.", "request_failed");
  }
}
