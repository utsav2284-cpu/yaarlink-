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
  __yaarlinkDbPoolLastErrorAt?: string;
  __yaarlinkDbPoolErrorCount?: number;
};

export type DatabasePoolSnapshot = {
  initialized: boolean;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  expiredCount: number;
  errorCount: number;
  lastErrorAt: string | null;
};

function sanitizedPoolError(error: Error): { name: string; code: string } {
  const code = (error as Error & { code?: unknown }).code;
  return {
    name: error.name || "Error",
    code: typeof code === "string" || typeof code === "number" ? String(code) : "unknown",
  };
}

function attachPoolErrorHandler(pool: Pool): Pool {
  // node-postgres emits `error` when an idle pooled client loses its socket.
  // The pool removes that client, but an EventEmitter error without a listener
  // can terminate the process. Record a sanitized summary for health/logs and
  // let later requests create a fresh client instead of crashing the instance.
  pool.on("error", (error) => {
    globalForDb.__yaarlinkDbPoolLastErrorAt = new Date().toISOString();
    globalForDb.__yaarlinkDbPoolErrorCount = (globalForDb.__yaarlinkDbPoolErrorCount ?? 0) + 1;
    console.error("[db-pool] idle client error; client will be replaced", sanitizedPoolError(error));
  });
  return pool;
}

/** Shared pool for Node servers. Kept on globalThis to survive dev hot reloads. */
export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = attachPoolErrorHandler(new Pool(getDatabasePoolConfig()));
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

/** Non-sensitive pool counters for health and operational logging. */
export function getDatabasePoolSnapshot(): DatabasePoolSnapshot {
  const pool = globalForDb.__arenaNextJsPostgresqlPool;
  return {
    initialized: Boolean(pool),
    totalCount: pool?.totalCount ?? 0,
    idleCount: pool?.idleCount ?? 0,
    waitingCount: pool?.waitingCount ?? 0,
    expiredCount: pool?.expiredCount ?? 0,
    errorCount: globalForDb.__yaarlinkDbPoolErrorCount ?? 0,
    lastErrorAt: globalForDb.__yaarlinkDbPoolLastErrorAt ?? null,
  };
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
