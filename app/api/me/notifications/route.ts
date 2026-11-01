import { db } from "@/backend/db";
import { notifications } from "@/backend/db/schema";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionUnavailableResponse } from "@/backend/auth";
import { parseUuid, readJsonObject } from "@/backend/validation";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.count ?? 0);
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in", code: "unauthorized" }, { status: 401, headers: NO_STORE });

    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    const now = new Date();

    if (body.all === true) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
      return Response.json({ ok: true, unreadNotificationCount: 0 }, { headers: NO_STORE });
    }

    const notificationId = parseUuid(body.id);
    if (!notificationId) return Response.json({ error: "Invalid notification", code: "invalid_target" }, { status: 400, headers: NO_STORE });
    const [existing] = await db
      .select({ id: notifications.id, readAt: notifications.readAt })
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)))
      .limit(1);
    if (!existing) return Response.json({ error: "Notification not found.", code: "notification_not_found" }, { status: 404, headers: NO_STORE });

    if (!existing.readAt) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id), isNull(notifications.readAt)));
    }
    return Response.json({ ok: true, unreadNotificationCount: await unreadCount(user.id) }, { headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e);
      return sessionUnavailableResponse(NO_STORE);
    }
    console.error(e);
    return Response.json({ error: "Could not update notifications", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
