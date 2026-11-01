/*
 * Guardrails for browser-eligible environment variable names.
 *
 * Next.js only inlines a NEXT_PUBLIC_* value when application code references
 * it, but keeping a database URL or service-role secret under that prefix is
 * still a serious configuration hazard: one future reference would publish it.
 * YaarLink therefore fails closed on names alone. This module deliberately
 * never reads, logs, or returns an environment value.
 */

export type PublicEnvironment = Record<string, string | undefined>;

const NEXT_PUBLIC_PREFIX = "NEXT_PUBLIC_";

/*
 * The application currently requires no project-defined NEXT_PUBLIC_* values.
 * These three names are tolerated only because the canonical Supabase Vercel
 * integration generates public client identifiers with exactly these names.
 * Tolerating the names does not approve using them in application code: any
 * future browser use still needs a separate security review (including
 * Supabase Row Level Security). Duplicated or re-prefixed aliases are unsafe.
 */
const APPROVED_PUBLIC_ENV_NAMES = new Set([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
]);

/*
 * Vercel generates framework-prefixed deployment metadata such as
 * NEXT_PUBLIC_VERCEL_ENV and NEXT_PUBLIC_VERCEL_URL during builds. Allow that
 * platform namespace, but still apply the secret-like name check below so a
 * manually created NEXT_PUBLIC_VERCEL_* secret cannot slip through.
 */
const APPROVED_PUBLIC_ENV_PREFIXES = ["NEXT_PUBLIC_VERCEL_"];

const SECRET_LIKE_PUBLIC_NAME =
  /(?:SECRET|PASSWORD|PASSWD|PRIVATE|SERVICE_?ROLE|JWT|TOKEN|API_?KEY|DATABASE|POSTGRES|PGHOST|PGUSER|PGPASSWORD|CONNECTION|DSN|NON_?POOLING|UNPOOLED|NEON)/;

export class UnsafePublicEnvironmentError extends Error {
  readonly names: readonly string[];

  constructor(names: string[]) {
    super(
      `Unsafe public environment variable names are configured: ${names.join(", ")}. ` +
        "Remove them or rename genuinely public values through a reviewed code change; " +
        "never place database URLs, passwords, JWT/service-role secrets, or API secrets in NEXT_PUBLIC_* variables.",
    );
    this.name = "UnsafePublicEnvironmentError";
    this.names = [...names];
  }
}

function isApprovedPublicEnvironmentName(name: string): boolean {
  return (
    APPROVED_PUBLIC_ENV_NAMES.has(name) ||
    APPROVED_PUBLIC_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/** Return only unsafe NEXT_PUBLIC_* variable names; values are never inspected. */
export function findUnsafePublicEnvironmentNames(
  env: PublicEnvironment = process.env,
): string[] {
  return Object.keys(env)
    .filter((name) => {
      if (!name.startsWith(NEXT_PUBLIC_PREFIX)) return false;
      const unprefixedName = name.slice(NEXT_PUBLIC_PREFIX.length);
      return !isApprovedPublicEnvironmentName(name) || SECRET_LIKE_PUBLIC_NAME.test(unprefixedName);
    })
    .sort();
}

export function assertPublicEnvironmentNamesSafe(env: PublicEnvironment = process.env): void {
  const unsafeNames = findUnsafePublicEnvironmentNames(env);
  if (unsafeNames.length > 0) throw new UnsafePublicEnvironmentError(unsafeNames);
}
