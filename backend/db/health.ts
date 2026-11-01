import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type { QueryConfig } from "pg";
import { getDatabasePoolSnapshot, getPool, type DatabasePoolSnapshot } from "./index";
import {
  accountTokens,
  adminAuditLogs,
  applications,
  authFailureLockouts,
  brands,
  campaigns,
  contacts,
  creators,
  notifications,
  pendingSignups,
  rateLimitBuckets,
  reports,
  settings,
  userSessions,
  users,
} from "./schema";

/**
 * Deep database health check.
 *
 * A successful TCP connection or `select 1` is not enough for this app: a
 * reachable but unmigrated/partially migrated database would still fail every
 * real request. The required table/column pairs are derived from the Drizzle
 * schema and checked in the database schema that unqualified app queries use.
 */

const REQUIRED_TABLES: readonly PgTable[] = [
  users,
  pendingSignups,
  accountTokens,
  userSessions,
  brands,
  creators,
  campaigns,
  applications,
  notifications,
  contacts,
  reports,
  settings,
  adminAuditLogs,
  rateLimitBuckets,
  authFailureLockouts,
];

export type DatabaseSchemaColumn = {
  table: string;
  column: string;
};

export const REQUIRED_DATABASE_COLUMNS: readonly DatabaseSchemaColumn[] = REQUIRED_TABLES.flatMap((table) => {
  const config = getTableConfig(table);
  return config.columns.map((column) => ({ table: config.name, column: column.name }));
});

export const REQUIRED_DATABASE_TABLES: readonly string[] = Array.from(
  new Set(REQUIRED_DATABASE_COLUMNS.map(({ table }) => table)),
);

function schemaColumnKey({ table, column }: DatabaseSchemaColumn): string {
  return `${table}\0${column}`;
}

/** Pure comparison used by the health probe and tests. */
export function findMissingDatabaseColumns(
  existingColumns: Iterable<DatabaseSchemaColumn>,
): DatabaseSchemaColumn[] {
  const existing = new Set<string>();
  for (const column of existingColumns) existing.add(schemaColumnKey(column));
  return REQUIRED_DATABASE_COLUMNS.filter((column) => !existing.has(schemaColumnKey(column)));
}

export type DatabaseHealth = {
  ok: boolean;
  status: "ok" | "degraded";
  checks: {
    database: "ok" | "fail";
    schema: "ok" | "fail";
  };
  /** Null when the database itself could not be queried, so schema state is unknown. */
  missingSchemaItems: number | null;
  checkedAt: string;
  pool: DatabasePoolSnapshot;
};

const DATABASE_HEALTH_QUERY_TIMEOUT_MS = 3_000;

const globalForDbHealth = globalThis as typeof globalThis & {
  __yaarlinkDbHealthInFlight?: Promise<DatabaseHealth>;
};

type ExistingColumnRow = {
  table_name: string;
  column_name: string;
};

function sanitizedDatabaseError(error: unknown): { name: string; code: string } {
  if (!(error instanceof Error)) return { name: "UnknownError", code: "unknown" };
  const code = (error as Error & { code?: unknown }).code;
  return {
    name: error.name || "Error",
    code: typeof code === "string" || typeof code === "number" ? String(code) : "unknown",
  };
}

async function runDatabaseHealthCheck(): Promise<DatabaseHealth> {
  const checkedAt = new Date().toISOString();

  try {
    const query = {
      text: `
        select table_name, column_name
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = any($1::text[])
      `,
      values: [[...REQUIRED_DATABASE_TABLES]],
      // node-postgres supports a per-query timeout even though @types/pg does
      // not expose it on QueryConfig. Health probes must fail faster than the
      // pool-wide 30-second application query bound.
      query_timeout: DATABASE_HEALTH_QUERY_TIMEOUT_MS,
    } as QueryConfig<[string[]]>;

    const result = await getPool().query<ExistingColumnRow, [string[]]>(query);
    const existingColumns = result.rows.map((row) => ({ table: row.table_name, column: row.column_name }));
    const missing = findMissingDatabaseColumns(existingColumns);

    if (missing.length > 0) {
      console.error("[db-health] required database schema is incomplete", {
        missingCount: missing.length,
        missing: missing.slice(0, 20).map(({ table, column }) => `${table}.${column}`),
      });
    }

    return {
      ok: missing.length === 0,
      status: missing.length === 0 ? "ok" : "degraded",
      checks: {
        database: "ok",
        schema: missing.length === 0 ? "ok" : "fail",
      },
      missingSchemaItems: missing.length,
      checkedAt,
      pool: getDatabasePoolSnapshot(),
    };
  } catch (error) {
    console.error("[db-health] database check failed", sanitizedDatabaseError(error));
    return {
      ok: false,
      status: "degraded",
      checks: {
        database: "fail",
        schema: "fail",
      },
      missingSchemaItems: null,
      checkedAt,
      pool: getDatabasePoolSnapshot(),
    };
  }
}

/**
 * Check database connectivity and required schema.
 *
 * Concurrent probes share one in-flight query so a burst cannot stampede a
 * degraded database. Completed results are deliberately not cached: the next
 * probe must reflect the database's current state rather than hiding a new
 * outage or a just-completed recovery behind a stale result.
 */
export function checkDatabaseHealth(): Promise<DatabaseHealth> {
  if (globalForDbHealth.__yaarlinkDbHealthInFlight) {
    return globalForDbHealth.__yaarlinkDbHealthInFlight;
  }

  const inFlight = runDatabaseHealthCheck().finally(() => {
    if (globalForDbHealth.__yaarlinkDbHealthInFlight === inFlight) {
      delete globalForDbHealth.__yaarlinkDbHealthInFlight;
    }
  });

  globalForDbHealth.__yaarlinkDbHealthInFlight = inFlight;
  return inFlight;
}
