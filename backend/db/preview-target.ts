/**
 * Preview runtime database target enforcement.
 *
 * The marketplace application resolves every table through the active
 * `search_path` (backend/db/schema.ts uses unqualified names). In the hosted
 * Preview project the application schema is `app_preview`, not `public`, so a
 * connection that loses its `search_path` does not fail loudly - it silently
 * resolves to `public` and starts reading and writing the wrong schema.
 *
 * This module makes that failure mode impossible to reach silently. It is
 * deliberately environment-scoped:
 *
 *   VERCEL_ENV=production  -> no enforcement, production configuration is
 *                             untouched and never requires app_preview.
 *   VERCEL_ENV=preview     -> enforcement is mandatory and fails closed.
 *   anything else (dev/test) -> inactive, so local work is unaffected.
 */

export const PREVIEW_PROJECT_REF = "qwngmsedyepghskoagaj";
export const PRODUCTION_PROJECT_REF = "dqhxgwzjwzvpqiilteld";
export const PREVIEW_SCHEMA = "app_preview";

/**
 * Transport types that preserve PostgreSQL session state.
 *
 * `direct`         db.<ref>.supabase.co:5432. IPv6-only unless the project has
 *                  the IPv4 add-on; Vercel cannot open outbound IPv6.
 * `session-pooler` aws-<n>-<region>.pooler.supabase.com:5432 (Supavisor session
 *                  mode). IPv4-reachable on every plan and keeps a dedicated
 *                  server connection, so session state such as search_path
 *                  survives.
 *
 * Transaction mode (port 6543) is NOT supported: Supavisor multiplexes each
 * transaction onto a different server connection, so session-level settings are
 * lost between transactions. That is exactly the silent-public-fallback risk.
 */
export type PreviewTransport = "direct" | "session-pooler";

export type PreviewTarget = {
  transport: PreviewTransport;
  host: string;
  port: string;
  schema: string;
};

export type RuntimeEnvironment = Record<string, string | undefined>;

const POOLER_HOST = /^[a-z0-9-]+\.pooler\.supabase\.com$/;

/** True when this deployment must enforce the Preview target. */
export function isPreviewRuntime(env: RuntimeEnvironment): boolean {
  return env.VERCEL_ENV === "preview";
}

function fail(message: string): never {
  throw new Error(`Preview database target rejected: ${message}`);
}

/**
 * Validate a Preview connection string.
 *
 * Throws (fails closed) rather than returning a partial result, so a caller can
 * never accidentally proceed with an unchecked connection.
 */
export function assertPreviewDatabaseTarget(connectionString: string): PreviewTarget {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    fail("DATABASE_URL is not a valid URL");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    fail("DATABASE_URL must be a postgresql:// URL");
  }

  const host = url.hostname.toLowerCase();
  const port = url.port || "5432";
  const username = decodeURIComponent(url.username);

  if (host.includes(PRODUCTION_PROJECT_REF) || username.includes(PRODUCTION_PROJECT_REF)) {
    fail(`the Production project (${PRODUCTION_PROJECT_REF}) must never be used in Preview`);
  }

  if (port === "6543") {
    fail(
      "transaction mode (port 6543) loses session state, so search_path would not survive and queries would silently fall back to public. Use direct or Supavisor session mode on 5432",
    );
  }
  if (port !== "5432") {
    fail(`port ${port} is not an approved database port (expected 5432)`);
  }

  let transport: PreviewTransport;
  if (host === `db.${PREVIEW_PROJECT_REF}.supabase.co`) {
    transport = "direct";
  } else if (POOLER_HOST.test(host) && username.endsWith(`.${PREVIEW_PROJECT_REF}`)) {
    // Supavisor session mode carries the project ref in the login name, not the
    // host. Requiring the exact suffix stops a pooler URL for another project
    // from being accepted.
    transport = "session-pooler";
  } else {
    fail(
      `host ${host} is neither the Preview direct endpoint nor a Supavisor endpoint for ${PREVIEW_PROJECT_REF}`,
    );
  }

  const options = url.searchParams.get("options") ?? "";
  if (url.searchParams.has("options") && !/search_path\s*=\s*app_preview/.test(options)) {
    fail(`options must set search_path=${PREVIEW_SCHEMA}`);
  }
  if (!url.searchParams.has("options")) {
    fail(
      `DATABASE_URL must set options=-c search_path=${PREVIEW_SCHEMA}; without it the connection silently resolves to public`,
    );
  }

  return { transport, host, port, schema: PREVIEW_SCHEMA };
}

/**
 * Environment-aware entry point used by the pool configuration.
 *
 * Returns null in every non-Preview environment, which is what guarantees the
 * Production configuration can never be made to require app_preview.
 */
export function previewTargetForEnvironment(env: RuntimeEnvironment): PreviewTarget | null {
  if (!isPreviewRuntime(env)) return null;

  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    fail("DATABASE_URL is not configured for a Preview deployment");
  }
  return assertPreviewDatabaseTarget(connectionString);
}

/** SQL applied to every pooled connection in Preview, before it is handed out. */
export function previewSearchPathStatement(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Refusing an unsafe schema identifier: ${schema}`);
  }
  return `SET search_path = ${schema}, pg_catalog`;
}
