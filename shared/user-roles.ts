export const USER_ROLES = ["brand", "creator"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * The database's singular `users.role` value is the account's preferred
 * starting workspace, not an exclusive capability. Every signed-in account
 * may use both workspaces; resource routes still enforce authentication,
 * ownership, and feature-specific requirements such as a completed creator
 * profile before applying to a campaign.
 */
export const AVAILABLE_USER_ROLES: readonly UserRole[] = USER_ROLES;

export function normalizeUserRole(value: unknown): UserRole | null {
  return value === "brand" || value === "creator" ? value : null;
}

export function primaryUserRole(value: unknown, fallback: UserRole = "brand"): UserRole {
  return normalizeUserRole(value) ?? fallback;
}

export function availableUserRoles(): UserRole[] {
  return [...AVAILABLE_USER_ROLES];
}
