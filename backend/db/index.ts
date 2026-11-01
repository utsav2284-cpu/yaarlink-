import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabasePoolConfig } from "./connection-config";

/**
 * Database client for the supported Node.js/Vercel runtime.
 *
 * One pool is shared by a warm server instance. `db` is a thin proxy, so the
 * rest of the code just does `import { db } from "@/backend/db"` while pool
 * creation (and DATABASE_URL/TLS validation) stays lazy.
 */

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __yaarlinkDb?: NodePgDatabase;
};

/** Shared pool for Node servers. Kept on globalThis to survive dev hot reloads. */
export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool(getDatabasePoolConfig());
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

export function getDb(): NodePgDatabase {
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
