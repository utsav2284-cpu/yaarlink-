import { asc, inArray } from "drizzle-orm";
import { db } from "@/backend/db";
import { notifications } from "@/backend/db/schema";

export type ApplicationStatusHistoryEvent = {
  status: string;
  at: Date;
  actorName: string | null;
};

type ApplicationHistorySource = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  decisionAt?: Date | null;
  creatorName?: string | null;
};

function eventTime(value: Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function buildHistory(
  application: ApplicationHistorySource,
  notificationEvents: ApplicationStatusHistoryEvent[],
): ApplicationStatusHistoryEvent[] {
  const candidates: ApplicationStatusHistoryEvent[] = [
    { status: "applied", at: application.createdAt, actorName: application.creatorName ?? null },
    ...notificationEvents,
  ];

  candidates.sort((a, b) => eventTime(a.at) - eventTime(b.at));

  const history: ApplicationStatusHistoryEvent[] = [];
  for (const event of candidates) {
    if (!event.status || Number.isNaN(eventTime(event.at))) continue;
    const previous = history[history.length - 1];
    // The application row itself supplies the initial "applied" event and the
    // brand also received an application_received notification at the same
    // moment. Consecutive duplicates are one transition, not two.
    if (previous?.status === event.status) continue;
    history.push(event);
  }

  const last = history[history.length - 1];
  if (!last || last.status !== application.status) {
    const fallbackAt = application.decisionAt ?? application.updatedAt ?? application.createdAt;
    const at = last && eventTime(fallbackAt) < eventTime(last.at) ? last.at : fallbackAt;
    history.push({ status: application.status, at, actorName: null });
  }

  return history;
}

/**
 * Attach a chronological status timeline to already-authorized application
 * rows.
 *
 * Notifications are the existing append-only record of marketplace status
 * transitions: submission/reactivation and withdrawal notify the brand, while
 * every brand decision notifies the creator. Reading both recipients' rows for
 * an application reconstructs the transition sequence without inventing dates
 * for intermediate states. The application row supplies the initial applied
 * event and a current-status fallback for any legacy row whose notification is
 * unavailable.
 */
export async function attachApplicationStatusHistory<T extends ApplicationHistorySource>(
  rows: T[],
): Promise<Array<T & { statusHistory: ApplicationStatusHistoryEvent[] }>> {
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((row) => row.id))];
  const notificationRows = await db
    .select({
      applicationId: notifications.applicationId,
      kind: notifications.kind,
      applicationStatus: notifications.applicationStatus,
      actorName: notifications.actorName,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(inArray(notifications.applicationId, ids))
    .orderBy(asc(notifications.createdAt), asc(notifications.id));

  const eventsByApplication = new Map<string, ApplicationStatusHistoryEvent[]>();
  for (const row of notificationRows) {
    if (!row.applicationId) continue;
    const status =
      row.applicationStatus ??
      (row.kind === "application_withdrawn" ? "withdrawn" : row.kind === "application_received" ? "applied" : null);
    if (!status) continue;
    const events = eventsByApplication.get(row.applicationId) ?? [];
    events.push({ status, at: row.createdAt, actorName: row.actorName });
    eventsByApplication.set(row.applicationId, events);
  }

  return rows.map((row) => ({
    ...row,
    statusHistory: buildHistory(row, eventsByApplication.get(row.id) ?? []),
  }));
}
