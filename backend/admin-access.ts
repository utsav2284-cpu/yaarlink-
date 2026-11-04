import { setAdminAuditActor } from "@/backend/admin-audit";
import {
  getAdminAccountSession,
  type AdminAccountSessionContext,
} from "@/backend/admin-identity";
import { hasAdminPermission, type AdminPermission } from "@/shared/admin-rbac";

export type AdminAccess = {
  kind: "identity";
  adminId: string;
  context: AdminAccountSessionContext;
};

/**
 * Database-backed administrator authorization boundary.
 *
 * The retired shared-password owner cookie is deliberately not consulted.
 * Every successful access requires an individual administrator session whose
 * MFA requirement has been satisfied, plus the exact fixed RBAC permission
 * for the route being accessed.
 */
export async function requireAdminAccess(
  permission: AdminPermission,
  req?: Request,
): Promise<AdminAccess | null> {
  const context = await getAdminAccountSession();
  if (!context || !context.mfaSatisfied || !hasAdminPermission(context.admin.role, permission)) return null;
  if (req) setAdminAuditActor(req, context.admin.id);
  return { kind: "identity", adminId: context.admin.id, context };
}

/**
 * The current marketplace moderation/data endpoints are still owner-level
 * monoliths: one response/action set spans contacts, exports, sessions, and
 * settings. Until those endpoints are split by module, only an MFA-satisfied
 * database Super Admin may use them. Lower roles fail closed rather than
 * receiving unrelated private data through a broad route.
 */
export async function requireMonolithAdminAccess(req?: Request): Promise<AdminAccess | null> {
  const context = await getAdminAccountSession();
  if (!context || !context.mfaSatisfied || context.admin.role !== "super_admin") return null;
  if (req) setAdminAuditActor(req, context.admin.id);
  return { kind: "identity", adminId: context.admin.id, context };
}

export async function hasAdminAccess(permission: AdminPermission, req?: Request): Promise<boolean> {
  return Boolean(await requireAdminAccess(permission, req));
}
