import { db } from "@/backend/db";
import { adminAuditLogs } from "@/backend/db/schema";
import { getClientIp } from "@/backend/rate-limit";

export type AdminAuditOutcome = "success" | "failure";

export type AdminAuditInput = {
  action: string;
  outcome?: AdminAuditOutcome;
  entity?: string | null;
  entityId?: string | null;
  details?: Record<string, string | number | boolean | null | undefined>;
};

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const ip = getClientIp(req);
  return ip === "unknown" ? null : ip.slice(0, 120);
}

function serializeDetails(details?: AdminAuditInput["details"]): string | null {
  if (!details) return null;
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;
    safe[key.slice(0, 60)] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  const serialized = JSON.stringify(safe);
  return serialized === "{}" ? null : serialized.slice(0, 1000);
}

/**
 * Audit writes must never turn an otherwise completed admin action into a
 * false failure. Errors are logged server-side; the DB table is append-only
 * for the application role.
 */
export async function logAdminAudit(req: Request | undefined, input: AdminAuditInput): Promise<void> {
  try {
    await db.insert(adminAuditLogs).values({
      action: input.action.slice(0, 100),
      outcome: input.outcome ?? "success",
      entity: input.entity?.slice(0, 60) ?? null,
      entityId: input.entityId && /^[0-9a-f-]{36}$/i.test(input.entityId) ? input.entityId : null,
      details: serializeDetails(input.details),
      ipAddress: clientIp(req),
    });
  } catch (error) {
    console.error("[admin-audit] could not write audit log", error);
  }
}
