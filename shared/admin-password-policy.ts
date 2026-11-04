/*
 * Administrator passwords deliberately use a policy separate from public
 * marketplace accounts. The browser and server both use this module for the
 * composition rules; the server additionally applies context, denylist, and
 * breach-corpus checks before a password is accepted.
 */

export const ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH = 256;
export const ADMIN_ACCOUNT_PASSWORD_RECOMMENDED_LENGTH = 24;

function countCodePoints(password: string): number {
  // Kept local so this policy remains directly testable by Node's strip-types
  // runner, which cannot resolve the application's `@/` path alias.
  return Array.from(password).length;
}

export interface AdminPasswordRequirements {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  symbol: boolean;
}

export function checkAdminPasswordRequirements(password: string): AdminPasswordRequirements {
  return {
    minLength: countCodePoints(password) >= ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH,
    uppercase: /\p{Lu}/u.test(password),
    lowercase: /\p{Ll}/u.test(password),
    number: /\p{Nd}/u.test(password),
    symbol: /[^\p{L}\p{N}\s]/u.test(password),
  };
}

export function adminPasswordRequirementsMet(password: string): number {
  return Object.values(checkAdminPasswordRequirements(password)).filter(Boolean).length;
}

export function isAdminPasswordCompliant(password: string): boolean {
  return (
    countCodePoints(password) <= ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH &&
    adminPasswordRequirementsMet(password) === 5
  );
}

/**
 * A small, explainable 0–4 indicator for the form only. It is never treated
 * as a security proof and does not replace the server-side breach check.
 */
export function adminPasswordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const requirements = checkAdminPasswordRequirements(password);
  const classes = [requirements.uppercase, requirements.lowercase, requirements.number, requirements.symbol].filter(Boolean).length;
  const length = countCodePoints(password);
  const distinct = new Set(Array.from(password)).size;

  let score = 0;
  if (length >= ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH) score += 1;
  if (classes >= 3) score += 1;
  if (length >= 16 && classes === 4) score += 1;
  if (length >= ADMIN_ACCOUNT_PASSWORD_RECOMMENDED_LENGTH && classes === 4 && distinct >= 10) score += 1;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
