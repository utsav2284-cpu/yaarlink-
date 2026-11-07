import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { logError, logEvent, serializeLogError } from "@/backend/observability";
import { getDatabasePoolConfig } from "./connection-config";
import { isPreviewRuntime, previewSearchPathStatement, previewTargetForEnvironment } from "./preview-target";
import { shouldLogSlowQuery, slowQueryThresholdMs, sqlFingerprint, sqlOperation } from "./slow-query";

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

const INSTRUMENTED_CLIENT = Symbol.for("yaarlink.instrumentedPoolClient");

type InstrumentedPoolClient = PoolClient & {
  [INSTRUMENTED_CLIENT]?: boolean;
};

function resultRowCount(result: unknown): number | undefined {
  if (Array.isArray(result)) {
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const count = resultRowCount(result[index]);
      if (count !== undefined) return count;
    }
    return undefined;
  }
  if (!result || typeof result !== "object") return undefined;
  const rowCount = (result as { rowCount?: unknown }).rowCount;
  return typeof rowCount === "number" && Number.isFinite(rowCount) ? rowCount : undefined;
}

function instrumentPoolClient(client: PoolClient, thresholdMs: number): PoolClient {
  const instrumented = client as InstrumentedPoolClient;
  if (instrumented[INSTRUMENTED_CLIENT]) return client;
  instrumented[INSTRUMENTED_CLIENT] = true;

  const originalQuery = client.query.bind(client) as (...args: unknown[]) => unknown;

  const instrumentedQuery = (...args: unknown[]): unknown => {
    const startedAt = performance.now();
    const queryInput = args[0];
    let completed = false;

    const complete = (error?: unknown, result?: unknown) => {
      if (completed) return;
      completed = true;
      const durationMs = performance.now() - startedAt;
      if (!shouldLogSlowQuery(durationMs, thresholdMs)) return;

      const serializedError = error === undefined ? undefined : serializeLogError(error);
      logEvent("warn", "database.slow_query", {
        component: "database",
        operation: sqlOperation(queryInput),
        durationMs: Math.round(durationMs * 10) / 10,
        thresholdMs,
        queryFingerprint: sqlFingerprint(queryInput),
        rowCount: resultRowCount(result),
        outcome: error === undefined ? "success" : "error",
        errorName: serializedError?.name,
        errorCode: serializedError?.code,
      });
    };

    const callbackIndex = args.length - 1;
    if (typeof args[callbackIndex] === "function") {
      const callback = args[callbackIndex] as (...callbackArgs: unknown[]) => unknown;
      args[callbackIndex] = (...callbackArgs: unknown[]) => {
        complete(callbackArgs[0] || undefined, callbackArgs[1]);
        return callback(...callbackArgs);
      };
      try {
        return originalQuery(...args);
      } catch (error) {
        complete(error);
        throw error;
      }
    }

    let result: unknown;
    try {
      result = originalQuery(...args);
    } catch (error) {
      complete(error);
      throw error;
    }

    if (result && typeof (result as { then?: unknown }).then === "function") {
      void (result as Promise<unknown>).then(
        (value) => complete(undefined, value),
        (error) => complete(error),
      );
      return result;
    }

    if (result && typeof (result as { once?: unknown }).once === "function") {
      const emitter = result as { once(event: string, listener: (...eventArgs: unknown[]) => void): unknown };
      emitter.once("end", () => complete(undefined, result));
      emitter.once("error", (error) => complete(error));
      return result;
    }

    complete(undefined, result);
    return result;
  };

  instrumented.query = instrumentedQuery as PoolClient["query"];
  return client;
}

function instrumentPool(pool: Pool): Pool {
  const thresholdMs = slowQueryThresholdMs();
  const originalConnect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;

  const instrumentedConnect = (...args: unknown[]): unknown => {
    if (typeof args[0] === "function") {
      const callback = args[0] as (...callbackArgs: unknown[]) => unknown;
      return originalConnect((...callbackArgs: unknown[]) => {
        const client = callbackArgs[1] as PoolClient | undefined;
        if (client) instrumentPoolClient(client, thresholdMs);
        return callback(...callbackArgs);
      });
    }

    const result = originalConnect(...args);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return (result as Promise<PoolClient>).then((client) => instrumentPoolClient(client, thresholdMs));
    }
    return result;
  };

  pool.connect = instrumentedConnect as Pool["connect"];
  return pool;
}

function attachPoolErrorHandler(pool: Pool): Pool {
  // node-postgres emits `error` when an idle pooled client loses its socket.
  // The pool removes that client, but an EventEmitter error without a listener
  // can terminate the process. Record a sanitized summary for health/logs and
  // let later requests create a fresh client instead of crashing the instance.
  pool.on("error", (error) => {
    globalForDb.__yaarlinkDbPoolLastErrorAt = new Date().toISOString();
    globalForDb.__yaarlinkDbPoolErrorCount = (globalForDb.__yaarlinkDbPoolErrorCount ?? 0) + 1;
    logError("database.pool_idle_client_error", error, {
      component: "database-pool",
      operation: "idle_client",
      replacement: "fresh_client_on_demand",
    });
  });
  return pool;
}

/**
 * Apply the Preview search_path to a freshly checked-out connection.
 *
 * The connection string already requests `search_path` as a startup parameter,
 * but a shared pooler may not forward startup parameters. Re-asserting it here
 * means no Preview query can run with an unqualified name resolving to public,
 * whichever approved transport is in use.
 *
 * ORDERING IS DELIBERATE: this wrapper is applied AFTER instrumentPool(), so the
 * instrumented query is the one used to issue SET. That keeps the SET inside the
 * same accounting as every other statement. Outside Preview the statement is
 * null and this function returns the pool untouched, so Production behaviour -
 * including its exact execution order - is unchanged.
 */
function withPreviewSearchPath(pool: Pool, statement: string | null): Pool {
  if (!statement) return pool;
  const originalConnect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;

  /**
   * A checked-out client is only handed to the caller once search_path has been
   * applied. If the statement fails the client is released and the caller
   * receives the error: the pool never yields a connection whose search_path is
   * unproven, because that is exactly what would silently resolve to public.
   */
  const apply = async (client: PoolClient | undefined): Promise<PoolClient> => {
    if (!client) throw new Error("Preview connection rejected: no client was returned");
    try {
      await client.query(statement);
      return client;
    } catch (error) {
      client.release();
      throw new Error(
        `Preview connection rejected: could not apply search_path (${(error as Error).message})`,
      );
    }
  };

  const patchedConnect = (...args: unknown[]): unknown => {
    const maybeCallback = args[0];
    if (typeof maybeCallback === "function") {
      const callback = maybeCallback as (...cb: unknown[]) => unknown;
      const rest = args.slice(1);
      // Preserve the callback contract: never invoke it synchronously from
      // inside itself, and never before the search_path statement resolves.
      return originalConnect(...rest, (error: unknown, client?: PoolClient) => {
        if (error) {
          callback(error, client);
          return;
        }
        apply(client).then(
          (ready) => callback(null, ready),
          (applyError) => callback(applyError, client),
        );
      });
    }

    const result = originalConnect(...args);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return (result as Promise<PoolClient>).then(apply);
    }
    return result;
  };

  pool.connect = patchedConnect as Pool["connect"];
  return pool;
}

/** Shared pool for Node servers. Kept on globalThis to survive dev hot reloads. */
export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    // Fails closed in Preview, and returns null (no enforcement) everywhere
    // else, so Production configuration can never require app_preview.
    const previewTarget = previewTargetForEnvironment(process.env);
    const pool = new Pool(getDatabasePoolConfig());
    globalForDb.__arenaNextJsPostgresqlPool = attachPoolErrorHandler(
      withPreviewSearchPath(
        instrumentPool(pool),
        previewTarget ? previewSearchPathStatement(previewTarget.schema) : null,
      ),
    );
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
