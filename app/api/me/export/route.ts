import { buildAccountExport, verifyUserPassword } from "@/backend/account";
import { getSessionContext } from "@/backend/auth";
import { hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

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

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const currentPassword = String(body?.currentPassword || "");
    if (!currentPassword || currentPassword.length > 256) {
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
    console.error(error);
    return jsonError(500, "Could not export account data.", "request_failed");
  }
}
