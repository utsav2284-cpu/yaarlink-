import { db } from "@/backend/db";
import { auditEvents } from "@/backend/db/schema";

type AuditExecutor = Pick<typeof db, "insert">;

export type AuditActorType = "user" | "admin" | "system";
export type AuditEntityType =
  | "user"
  | "brand"
  | "creator_profile"
  | "campaign"
  | "application"
  | "report"
  | "contact"
  | "setting";

export type AuditEventInput = {
  actorType: AuditActorType;
  actorUserId?: string | null;
  ownerUserId?: string | null;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  changedFields?: readonly string[];
  metadata?: Record<string, string | number | boolean | null | undefined>;
  createdAt?: Date;
};

const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const SAFE_METADATA_KEY = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;

function safeChangedFields(fields: readonly string[] | undefined): string[] {
  if (!fields?.length) return [];
  return [...new Set(fields.filter((field) => SAFE_FIELD.test(field)))].sort().slice(0, 50);
}

function safeMetadata(metadata: AuditEventInput["metadata"]): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  if (!metadata) return safe;
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || !SAFE_METADATA_KEY.test(key)) continue;
    safe[key] = typeof value === "string" ? value.slice(0, 200) : value;
    if (Object.keys(safe).length >= 20) break;
  }
  return safe;
}

/**
 * Record one privacy-safe marketplace history event. Call this with the
 * transaction that performs the mutation whenever possible, so a status or
 * profile/campaign/application change can never be committed without its
 * reporting history. Values themselves are never copied into the event.
 */
export async function recordAuditEvent(executor: AuditExecutor, input: AuditEventInput) {
  const [row] = await executor
    .insert(auditEvents)
    .values({
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action.slice(0, 100),
      fromStatus: input.fromStatus?.slice(0, 40) ?? null,
      toStatus: input.toStatus?.slice(0, 40) ?? null,
      changedFields: safeChangedFields(input.changedFields),
      metadata: safeMetadata(input.metadata),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .returning({ id: auditEvents.id, createdAt: auditEvents.createdAt });
  return row;
}

/** Record several independent entity events in insertion order. */
export async function recordAuditEvents(executor: AuditExecutor, inputs: readonly AuditEventInput[]) {
  const rows = [];
  for (const input of inputs) rows.push(await recordAuditEvent(executor, input));
  return rows;
}

function comparable(value: unknown): string {
  if (value instanceof Date) return `date:${value.getTime()}`;
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return `${typeof value}:${value}`;
  return JSON.stringify(value) ?? "unknown";
}

/** Names of fields whose stored value changes; audit events keep no values. */
export function changedFieldNames<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  ignored: readonly string[] = ["updatedAt"],
): string[] {
  const ignoredSet = new Set(ignored);
  return Object.entries(after)
    .filter(([field, value]) => !ignoredSet.has(field) && comparable(before[field]) !== comparable(value))
    .map(([field]) => field)
    .sort();
}
