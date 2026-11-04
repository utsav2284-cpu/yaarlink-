import {
  isPasswordBreached,
  localPasswordPolicyProblem,
  type PasswordBreachCheckOptions,
  type PasswordPolicyContext,
} from "@/backend/password-policy";
import {
  ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH,
  isAdminPasswordCompliant,
} from "@/shared/admin-password-policy";
import { passwordLength } from "@/shared/password-policy";

export type AdminPasswordValidationResult =
  | { ok: true }
  | { ok: false; problem: "policy" | "breached" };

function compact(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function hasRepeatedPattern(value: string): boolean {
  const maxChunk = Math.min(8, Math.floor(value.length / 2));
  for (let length = 1; length <= maxChunk; length += 1) {
    const chunk = value.slice(0, length);
    if (chunk.repeat(Math.ceil(value.length / length)).slice(0, value.length) === value) return true;
  }
  return false;
}

/**
 * Full server-side administrator-password validation. Composition comes from
 * the shared administrator policy; the existing local denylist/context checks
 * and k-anonymity breach lookup are intentionally reused rather than copied.
 */
export async function validateAdminAccountPassword(
  password: string,
  context: PasswordPolicyContext = {},
  breachOptions: PasswordBreachCheckOptions = {},
): Promise<AdminPasswordValidationResult> {
  if (!isAdminPasswordCompliant(password) || passwordLength(password) > ADMIN_ACCOUNT_PASSWORD_MAX_LENGTH) {
    return { ok: false, problem: "policy" };
  }

  const chars = Array.from(password);
  if (chars.every((char) => char === chars[0]) || hasRepeatedPattern(compact(password))) {
    return { ok: false, problem: "breached" };
  }

  const localProblem = localPasswordPolicyProblem(password, context);
  if (localProblem === "breached") return { ok: false, problem: "breached" };
  if (localProblem) return { ok: false, problem: "policy" };

  if (await isPasswordBreached(password, breachOptions)) return { ok: false, problem: "breached" };
  return { ok: true };
}
