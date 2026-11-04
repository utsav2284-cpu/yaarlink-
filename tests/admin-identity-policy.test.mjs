import test from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH,
  ADMIN_ACCOUNT_PASSWORD_RECOMMENDED_LENGTH,
  adminPasswordStrength,
  checkAdminPasswordRequirements,
  isAdminPasswordCompliant,
} from "../shared/admin-password-policy.ts";
import { generateSuggestedPassword } from "../shared/password-policy.ts";
import {
  canAssignAdminRole,
  canInviteAdminRole,
  hasAdminPermission,
  isAdminRole,
  wouldRemoveLastActiveSuperAdmin,
} from "../shared/admin-rbac.ts";

test("administrator password policy is separate and stricter than the public policy", () => {
  assert.equal(ADMIN_ACCOUNT_PASSWORD_MIN_LENGTH, 12);
  assert.equal(isAdminPasswordCompliant("Aa1!bcdefg"), false);
  assert.deepEqual(checkAdminPasswordRequirements("Aa1!bcdefghij"), {
    minLength: true,
    uppercase: true,
    lowercase: true,
    number: true,
    symbol: true,
  });
  assert.equal(isAdminPasswordCompliant("Aa1!bcdefghij"), true);
  assert.equal(isAdminPasswordCompliant("aa1!bcdefghij"), false);
  assert.equal(isAdminPasswordCompliant("AA1!BCDEFGHIJ"), false);
  assert.equal(isAdminPasswordCompliant("Aa!bcdefghijk"), false);
  assert.equal(isAdminPasswordCompliant("Aa1bcdefghijk"), false);
});

test("generated administrator passwords meet the policy and receive the strongest indicator", () => {
  for (let index = 0; index < 25; index += 1) {
    const generated = generateSuggestedPassword(ADMIN_ACCOUNT_PASSWORD_RECOMMENDED_LENGTH);
    assert.equal(Array.from(generated).length, 24);
    assert.equal(isAdminPasswordCompliant(generated), true, generated);
    assert.equal(adminPasswordStrength(generated), 4, generated);
  }
});

test("fixed RBAC matrix grants least-privilege module access", () => {
  assert.equal(isAdminRole("super_admin"), true);
  assert.equal(isAdminRole("owner"), false);
  assert.equal(hasAdminPermission("super_admin", "admin_users.manage_roles"), true);
  assert.equal(hasAdminPermission("admin", "admin_users.manage_roles"), false);
  assert.equal(hasAdminPermission("verification_manager", "creators.verify"), true);
  assert.equal(hasAdminPermission("verification_manager", "settings.manage"), false);
  assert.equal(hasAdminPermission("finance_manager", "finance.approve"), true);
  assert.equal(hasAdminPermission("finance_manager", "creators.manage"), false);
  assert.equal(hasAdminPermission("analyst", "analytics.view"), true);
  assert.equal(hasAdminPermission("analyst", "creators.contact.view"), false);
});

test("role assignment and invitation cannot exceed the actor's rank", () => {
  assert.equal(canAssignAdminRole("super_admin", "admin"), true);
  assert.equal(canAssignAdminRole("admin", "analyst"), false);
  assert.equal(canInviteAdminRole("super_admin", "super_admin"), true);
  assert.equal(canInviteAdminRole("super_admin", "operations_manager"), true);
  assert.equal(canInviteAdminRole("admin", "analyst"), false);
});

test("the last active Super Admin cannot be demoted or suspended", () => {
  assert.equal(
    wouldRemoveLastActiveSuperAdmin({
      activeSuperAdminCount: 1,
      targetRole: "super_admin",
      targetStatus: "active",
      nextRole: "admin",
    }),
    true,
  );
  assert.equal(
    wouldRemoveLastActiveSuperAdmin({
      activeSuperAdminCount: 1,
      targetRole: "super_admin",
      targetStatus: "active",
      nextStatus: "suspended",
    }),
    true,
  );
  assert.equal(
    wouldRemoveLastActiveSuperAdmin({
      activeSuperAdminCount: 2,
      targetRole: "super_admin",
      targetStatus: "active",
      nextStatus: "suspended",
    }),
    false,
  );
});
