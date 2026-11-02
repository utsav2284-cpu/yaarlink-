import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/backend/db";
import { auditEvents, notifications } from "@/backend/db/schema";

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
    // moment. Consecutive duplicates are one transition, not two. A
    // notification duplicate may still supply the display actor (the
    // submitted creator name or campaign business name) for a persisted
    // audit event, whose actor is intentionally not copied into history as
    // the underlying account holder's personal name.
    if (previous?.status === event.status) {
      if (!previous.actorName && event.actorName) previous.actorName = event.actorName;
      continue;
    }
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
 * New transitions are first-class rows in `audit_events`, written in the
 * same transaction as the application update. Notification rows are still
 * merged as a legacy fallback for applications created before that table
 * existed; consecutive duplicates collapse into one transition. The
 * application row supplies the initial applied event and a current-status
 * fallback if neither history source is available.
 */
export async function attachApplicationStatusHistory<T extends ApplicationHistorySource>(
  rows: T[],
): Promise<Array<T & { statusHistory: ApplicationStatusHistoryEvent[] }>> {
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((row) => row.id))];
  const persistedRows = await db
    .select({
      applicationId: auditEvents.entityId,
      status: auditEvents.toStatus,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityType, "application"),
        inArray(auditEvents.entityId, ids),
        inArray(auditEvents.action, ["application.created", "application.status_changed"]),
        isNotNull(auditEvents.toStatus),
      ),
    )
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));

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
  for (const row of persistedRows) {
    if (!row.status) continue;
    const events = eventsByApplication.get(row.applicationId) ?? [];
    events.push({ status: row.status, at: row.createdAt, actorName: null });
    eventsByApplication.set(row.applicationId, events);
  }
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
