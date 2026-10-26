import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Database client.
 *
 * - Normal Node.js server (local, preview, VPS): one shared connection pool.
 * - Cloudflare Workers: a connection may not be shared between requests, so a
 *   fresh single-use pool is created per query chain (see OpenNext DB docs).
 *
 * `db` is a thin proxy, so the rest of the code just does `import { db } from "@/backend/db"`.
 */

const isWorkers =
  typeof navigator !== "undefined" && (navigator as { userAgent?: string }).userAgent === "Cloudflare-Workers";

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __yaarlinkDb?: NodePgDatabase;
};

/** Shared pool for long-running Node servers. Kept on globalThis to survive dev hot reloads. */
export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({ connectionString: connectionString() });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

export function getDb(): NodePgDatabase {
  if (isWorkers) {
    return drizzle(new Pool({ connectionString: connectionString(), maxUses: 1 }));
  }
  if (!globalForDb.__yaarlinkDb) globalForDb.__yaarlinkDb = drizzle(getPool());
  return globalForDb.__yaarlinkDb;
}

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
