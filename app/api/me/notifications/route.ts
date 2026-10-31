import { db } from "@/backend/db";
import { notifications } from "@/backend/db/schema";
import { getSessionUser } from "@/backend/auth";
import { isUuid } from "@/backend/moderation";
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
    if (!user) return Response.json({ error: "Please log in" }, { status: 401, headers: NO_STORE });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: "Invalid notification request" }, { status: 400, headers: NO_STORE });
    const now = new Date();

    if (body.all === true) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
      return Response.json({ ok: true, unreadNotificationCount: 0 }, { headers: NO_STORE });
    }

    if (!isUuid(body.id)) return Response.json({ error: "Invalid notification" }, { status: 400, headers: NO_STORE });
    const [existing] = await db
      .select({ id: notifications.id, readAt: notifications.readAt })
      .from(notifications)
      .where(and(eq(notifications.id, body.id), eq(notifications.userId, user.id)))
      .limit(1);
    if (!existing) return Response.json({ error: "Notification not found." }, { status: 404, headers: NO_STORE });

    if (!existing.readAt) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.id, body.id), eq(notifications.userId, user.id), isNull(notifications.readAt)));
    }
    return Response.json({ ok: true, unreadNotificationCount: await unreadCount(user.id) }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not update notifications" }, { status: 500, headers: NO_STORE });
  }
}
