/*
 * Fixed administrator roles and permission matrix.
 *
 * The matrix lives in reviewed source code rather than in editable database
 * rows: a compromised lower-privilege session must not be able to invent a
 * more powerful role. Custom roles can be considered only after the same
 * server-side rank, audit, and last-Super-Admin protections cover them.
 */

export const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "operations_manager",
  "verification_manager",
  "support_manager",
  "finance_manager",
  "content_manager",
  "analyst",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_RANK: Readonly<Record<AdminRole, number>> = {
  super_admin: 100,
  admin: 80,
  operations_manager: 50,
  verification_manager: 45,
  support_manager: 40,
  finance_manager: 40,
  content_manager: 35,
  analyst: 20,
};

export const ADMIN_PERMISSIONS = [
  "dashboard.view",
  "creators.view",
  "creators.contact.view",
  "creators.verify",
  "creators.manage",
  "creators.export",
  "campaigns.view",
  "campaigns.contact.view",
  "campaigns.manage",
  "campaigns.approve",
  "campaigns.publish",
  "campaigns.feature",
  "campaigns.export",
  "reports.view",
  "reports.manage",
  "users.view",
  "users.manage",
  "users.suspend",
  "users.export",
  "content.view",
  "content.manage",
  "content.publish",
  "settings.view",
  "settings.manage",
  "website.availability",
  "website.emergency",
  "analytics.view",
  "analytics.export",
  "crm.view",
  "crm.manage",
  "support.view",
  "support.manage",
  "finance.view",
  "finance.manage",
  "finance.approve",
  "communications.view",
  "communications.send",
  "admin_users.view",
  "admin_users.invite",
  "admin_users.manage_roles",
  "admin_users.suspend",
  "admin_users.sessions.manage",
  "audit.view",
  "security.view",
  "security.manage",
  "security.incidents.manage",
  "system.health.view",
  "backups.view",
  "data.export",
  "data.import",
  "data.delete",
  "privacy.view",
  "privacy.manage",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const READ_ONLY_MARKETPLACE: readonly AdminPermission[] = [
  "dashboard.view",
  "creators.view",
  "campaigns.view",
  "reports.view",
  "users.view",
  "analytics.view",
];

export const ADMIN_ROLE_PERMISSIONS: Readonly<Record<Exclude<AdminRole, "super_admin">, readonly AdminPermission[]>> = {
  admin: [
    "dashboard.view",
    "creators.view",
    "creators.contact.view",
    "creators.verify",
    "creators.manage",
    "creators.export",
    "campaigns.view",
    "campaigns.contact.view",
    "campaigns.manage",
    "campaigns.approve",
    "campaigns.publish",
    "campaigns.feature",
    "campaigns.export",
    "reports.view",
    "reports.manage",
    "users.view",
    "users.manage",
    "users.suspend",
    "users.export",
    "content.view",
    "content.manage",
    "content.publish",
    "settings.view",
    "settings.manage",
    "website.availability",
    "analytics.view",
    "analytics.export",
    "crm.view",
    "crm.manage",
    "support.view",
    "support.manage",
    "finance.view",
    "finance.manage",
    "communications.view",
    "communications.send",
    "audit.view",
    "security.view",
    "security.incidents.manage",
    "system.health.view",
    "backups.view",
    "data.export",
    "privacy.view",
    "privacy.manage",
  ],
  operations_manager: [
    "dashboard.view",
    "creators.view",
    "creators.contact.view",
    "creators.manage",
    "campaigns.view",
    "campaigns.contact.view",
    "campaigns.manage",
    "reports.view",
    "reports.manage",
    "users.view",
    "analytics.view",
    "crm.view",
    "crm.manage",
    "support.view",
    "support.manage",
    "communications.view",
    "communications.send",
    "privacy.view",
  ],
  verification_manager: [
    "dashboard.view",
    "creators.view",
    "creators.contact.view",
    "creators.verify",
    "campaigns.view",
    "campaigns.contact.view",
    "campaigns.approve",
    "reports.view",
    "reports.manage",
    "support.view",
    "communications.view",
    "communications.send",
  ],
  support_manager: [
    "dashboard.view",
    "creators.view",
    "creators.contact.view",
    "campaigns.view",
    "campaigns.contact.view",
    "reports.view",
    "reports.manage",
    "users.view",
    "crm.view",
    "support.view",
    "support.manage",
    "communications.view",
    "communications.send",
    "privacy.view",
  ],
  finance_manager: [
    "dashboard.view",
    "creators.view",
    "campaigns.view",
    "users.view",
    "analytics.view",
    "analytics.export",
    "finance.view",
    "finance.manage",
    "finance.approve",
    "communications.view",
    "data.export",
  ],
  content_manager: [
    "dashboard.view",
    "creators.view",
    "campaigns.view",
    "content.view",
    "content.manage",
    "content.publish",
    "analytics.view",
    "communications.view",
    "communications.send",
  ],
  analyst: [...READ_ONLY_MARKETPLACE, "analytics.export", "data.export"],
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function permissionsForAdminRole(role: AdminRole): readonly AdminPermission[] {
  return role === "super_admin" ? ADMIN_PERMISSIONS : ADMIN_ROLE_PERMISSIONS[role];
}

export function hasAdminPermission(role: AdminRole, permission: AdminPermission): boolean {
  return permissionsForAdminRole(role).includes(permission);
}

/**
 * Only an actor with the explicit role-management permission may assign a
 * role, and never one ranked above their own. In the fixed matrix that
 * permission belongs to Super Admin alone.
 */
export function canAssignAdminRole(actorRole: AdminRole, targetRole: AdminRole): boolean {
  return (
    hasAdminPermission(actorRole, "admin_users.manage_roles") &&
    ADMIN_ROLE_RANK[targetRole] <= ADMIN_ROLE_RANK[actorRole]
  );
}

/** Invitations follow the same ceiling even when the inviter cannot edit roles later. */
export function canInviteAdminRole(actorRole: AdminRole, targetRole: AdminRole): boolean {
  return (
    hasAdminPermission(actorRole, "admin_users.invite") &&
    ADMIN_ROLE_RANK[targetRole] <= ADMIN_ROLE_RANK[actorRole] &&
    (targetRole !== "super_admin" || actorRole === "super_admin")
  );
}

/**
 * Pure last-owner guard used before demotion, suspension, or revocation. The
 * database service still performs the count inside its transaction.
 */
export function wouldRemoveLastActiveSuperAdmin({
  activeSuperAdminCount,
  targetRole,
  targetStatus,
  nextRole,
  nextStatus,
}: {
  activeSuperAdminCount: number;
  targetRole: AdminRole;
  targetStatus: string;
  nextRole?: AdminRole;
  nextStatus?: string;
}): boolean {
  if (targetRole !== "super_admin" || targetStatus !== "active") return false;
  const remainsActiveSuperAdmin =
    (nextRole ?? targetRole) === "super_admin" && (nextStatus ?? targetStatus) === "active";
  return !remainsActiveSuperAdmin && activeSuperAdminCount <= 1;
}
