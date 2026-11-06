import { getDatabasePoolConfig, normalizeDatabaseConnectionString } from "./db/connection-config.ts";

/**
 * Fail-closed target gate for a future server-side Production review adapter.
 * This module does not authorize users, establish connections, or perform any
 * review operations. A target match is never a substitute for MFA, RBAC,
 * current-session checks, and same-transaction audit.
 */
export function assertProductionMarketplaceTarget(env: Record<string, string | undefined>): void {
  if (env.VERCEL_ENV !== "production") throw new Error("Production marketplace review is unavailable in this environment");
  const connection = env.DATABASE_URL;
  if (!connection) throw new Error("Production marketplace database is not configured");
  let url: URL;
  try { url = new URL(normalizeDatabaseConnectionString(connection)); }
  catch { throw new Error("Production marketplace database is not configured"); }
  const ref = "dqhxgwzjwzvpqiilteld";
  const direct = url.hostname === `db.${ref}.supabase.co`;
  let username: string;
  try { username = decodeURIComponent(url.username); }
  catch { throw new Error("Production marketplace database target is not allowed"); }
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && username.endsWith(`.${ref}`) && username.length > ref.length + 1;
  if ((url.protocol !== "postgresql:" && url.protocol !== "postgres:") || (!direct && !pooler) || url.pathname !== "/postgres" || url.searchParams.has("host")) {
    throw new Error("Production marketplace database target is not allowed");
  }
  const keys = Array.from(url.searchParams.keys(), key => key.toLowerCase());
  if (keys.includes("host") || keys.some((key, index) => keys.indexOf(key) !== index)) {
    throw new Error("Production marketplace database target is not allowed");
  }
  // Also rejects unverified remote TLS or insecure connection settings.
  getDatabasePoolConfig(env);
}
