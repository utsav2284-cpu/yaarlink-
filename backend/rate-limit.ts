import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { authFailureLockouts, rateLimitBuckets } from "@/backend/db/schema";

const enc = new TextEncoder();
const MAX_LOCAL_BUCKETS = 10_000;
const MAX_LOCAL_FAILURES = 10_000;
const MAX_BUCKET_COUNT = 1_000_000;
const CLEANUP_SAMPLE_RATE = 0.01;
const CLEANUP_BATCH_SIZE = 500;

export type RateLimitResult = {
  ok: boolean;
  retryAfter: number;
  remaining: number;
  resetAt: number;
};

/* ------------------------------------------------------------------ hashing */

/**
 * SHA-256 (not a 32-bit FNV hash), so attacker-supplied values such as emails
 * are not retained verbatim and cannot practically collide with another
 * account's limiter bucket.
 */
export async function hashKey(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bucketKeyHash(key: string): Promise<string> {
  return hashKey(`yl_rate_limit:v1:${key}`);
}

async function authFailureKeyHash(key: string): Promise<string> {
  return hashKey(`yl_auth_failure:v1:${key}`);
}

/* ------------------------------------------------------------- client IP key */

function canonicalIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    octets.push(octet);
  }
  return octets.join(".");
}

function canonicalIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.startsWith("[") && candidate.endsWith("]")) candidate = candidate.slice(1, -1);
  if (!candidate || candidate.length > 45 || /[\s\/%]/.test(candidate)) return null;
  if (!candidate.includes(":")) return canonicalIpv4(candidate);

  try {
    const hostname = new URL(`http://[${candidate}]`).hostname;
    const ip = (hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname).toLowerCase();
    if (ip.startsWith("::ffff:")) {
      const mapped = ip.slice("::ffff:".length);
      const ipv4 = canonicalIpv4(mapped);
      if (ipv4) return ipv4;
      const groups = mapped.split(":");
      if (groups.length === 2 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
        const high = Number.parseInt(groups[0], 16);
        const low = Number.parseInt(groups[1], 16);
        return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
      }
    }
    return ip;
  } catch {
    return null;
  }
}

function ipList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .slice(0, 32)
    .map((part) => canonicalIp(part))
    .filter((ip): ip is string => Boolean(ip));
}

function firstHeaderIp(req: Request, name: string): string | null {
  return ipList(req.headers.get(name))[0] ?? null;
}

/**
 * Resolve the client IP only on the supported Vercel deployment path.
 *
 * Vercel sets `VERCEL=1` and overwrites its forwarding headers, so prefer the
 * Vercel-specific header, then `x-real-ip`/`x-forwarded-for`. Everywhere else
 * (including local development) callers share the conservative `unknown`
 * bucket rather than trusting a client-supplied proxy header. There is no
 * proxy-trust environment switch to misconfigure.
 */
export function getClientIp(req: Request): string {
  try {
    if (process.env.VERCEL === "1") {
      return (
        firstHeaderIp(req, "x-vercel-forwarded-for") ??
        canonicalIp(req.headers.get("x-real-ip")) ??
        firstHeaderIp(req, "x-forwarded-for") ??
        "unknown"
      );
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function getClientKey(req: Request, prefix: string) {
  return `${prefix}:${getClientIp(req)}`;
}

/* ------------------------------------------------------- local emergency mode */

type LocalBucket = { count: number; resetAt: number };
const localBuckets = new Map<string, LocalBucket>();

function sweepLocalBuckets(now: number) {
  for (const [key, bucket] of localBuckets) if (bucket.resetAt <= now) localBuckets.delete(key);
}

function localRateLimit(keyHash: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const current = localBuckets.get(keyHash);
  if (!current || current.resetAt <= now) {
    if (localBuckets.size >= MAX_LOCAL_BUCKETS) {
      sweepLocalBuckets(now);
      if (localBuckets.size >= MAX_LOCAL_BUCKETS) {
        const oldest = localBuckets.keys().next().value;
        if (oldest !== undefined) localBuckets.delete(oldest);
      }
    }
    const resetAt = now + windowMs;
    localBuckets.set(keyHash, { count: 1, resetAt });
    return { ok: true, retryAfter: 0, remaining: Math.max(0, limit - 1), resetAt };
  }

  current.count = Math.min(MAX_BUCKET_COUNT, current.count + 1);
  return {
    ok: current.count <= limit,
    retryAfter: current.count <= limit ? 0 : Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

let lastDatabaseErrorLogAt = 0;
function logDatabaseFallback(operation: string, error: unknown) {
  const now = Date.now();
  if (now - lastDatabaseErrorLogAt < 60_000) return;
  lastDatabaseErrorLogAt = now;
  console.error(`[rate-limit] database ${operation} unavailable; using bounded per-process fallback`, error);
}

async function cleanupExpiredRateLimitBuckets(now: Date): Promise<void> {
  await db.execute(sql`
    delete from rate_limit_buckets
    where key_hash in (
      select key_hash
      from rate_limit_buckets
      where expires_at <= ${now}
      order by expires_at
      limit ${CLEANUP_BATCH_SIZE}
    )
  `);
}

type RateLimitRow = { count: number | string; expires_at: Date | string };

/**
 * Distributed fixed-window limiter backed by Postgres. The counter increment
 * and window reset are one atomic upsert, so every Vercel function instance
 * sharing the database observes the same count.
 * If the database is briefly unavailable, a bounded in-process limiter is
 * used as an emergency fallback instead of failing completely open.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const safeLimit = Number.isFinite(limit) ? Math.floor(limit) : 0;
  const safeWindowMs = Number.isFinite(windowMs) ? Math.floor(windowMs) : 0;
  if (safeLimit <= 0 || safeWindowMs <= 0) {
    return { ok: false, retryAfter: 60, remaining: 0, resetAt: Date.now() + 60_000 };
  }

  const keyHash = await bucketKeyHash(key);
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const expires = new Date(nowMs + safeWindowMs);

  try {
    const result = await db.execute(sql`
      insert into rate_limit_buckets (key_hash, count, window_started_at, expires_at, updated_at)
      values (${keyHash}, 1, ${now}, ${expires}, ${now})
      on conflict (key_hash) do update set
        count = case
          when rate_limit_buckets.expires_at <= ${now} then 1
          else least(${MAX_BUCKET_COUNT}, rate_limit_buckets.count + 1)
        end,
        window_started_at = case
          when rate_limit_buckets.expires_at <= ${now} then ${now}
          else rate_limit_buckets.window_started_at
        end,
        expires_at = case
          when rate_limit_buckets.expires_at <= ${now} then ${expires}
          else rate_limit_buckets.expires_at
        end,
        updated_at = ${now}
      returning count, expires_at
    `);
    const row = (result as unknown as { rows?: RateLimitRow[] }).rows?.[0];
    if (!row) throw new Error("rate limit upsert returned no row");

    const count = Number(row.count);
    const resetAt = row.expires_at instanceof Date ? row.expires_at.getTime() : new Date(row.expires_at).getTime();
    if (!Number.isFinite(count) || !Number.isFinite(resetAt)) throw new Error("rate limit upsert returned invalid row");

    if (Math.random() < CLEANUP_SAMPLE_RATE) {
      try {
        await cleanupExpiredRateLimitBuckets(now);
      } catch (cleanupError) {
        logDatabaseFallback("bucket cleanup", cleanupError);
      }
    }

    return {
      ok: count <= safeLimit,
      retryAfter: count <= safeLimit ? 0 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
      remaining: Math.max(0, safeLimit - count),
      resetAt,
    };
  } catch (error) {
    logDatabaseFallback("limiter", error);
    return localRateLimit(keyHash, safeLimit, safeWindowMs);
  }
}

export function limitedResponse(retryAfter: number) {
  const safeRetryAfter = Number.isFinite(retryAfter) ? Math.max(1, Math.ceil(retryAfter)) : 60;
  return Response.json(
    { error: "Too many requests. Please try again later.", code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(safeRetryAfter), "Cache-Control": "no-store" } },
  );
}

/* ------------------------------------------------------ failed-auth lockouts */

export type AuthFailureOptions = {
  threshold?: number;
  baseMs?: number;
  maxMs?: number;
  /** Failures older than this no longer count toward a new lockout. */
  windowMs?: number;
};

const DEFAULT_LOCKOUT = { threshold: 5, baseMs: 60_000, maxMs: 15 * 60_000, windowMs: 15 * 60_000 };

type FailureState = {
  count: number;
  firstFailedAt: number;
  lastFailedAt: number;
  lockedUntil: number | null;
  expiresAt: number;
};

const localFailures = new Map<string, FailureState>();

function normalizeAuthFailureOptions(opts: AuthFailureOptions = {}) {
  const merged = { ...DEFAULT_LOCKOUT, ...opts };
  return {
    threshold: Math.max(1, Math.floor(merged.threshold) || DEFAULT_LOCKOUT.threshold),
    baseMs: Math.max(1, Math.floor(merged.baseMs) || DEFAULT_LOCKOUT.baseMs),
    maxMs: Math.max(1, Math.floor(merged.maxMs) || DEFAULT_LOCKOUT.maxMs),
    windowMs: Math.max(1, Math.floor(merged.windowMs) || DEFAULT_LOCKOUT.windowMs),
  };
}

function isFailureStateExpired(state: FailureState, now: number, windowMs: number): boolean {
  if (state.expiresAt <= now) return true;
  const stillLocked = state.lockedUntil !== null && state.lockedUntil > now;
  return !stillLocked && state.lastFailedAt <= now - windowMs;
}

function nextFailureState(existing: FailureState | undefined, now: number, opts: Required<AuthFailureOptions>): FailureState {
  const usable = existing && !isFailureStateExpired(existing, now, opts.windowMs) ? existing : undefined;
  const count = Math.min(MAX_BUCKET_COUNT, (usable?.count ?? 0) + 1);
  let lockedUntil = usable?.lockedUntil ?? null;
  if (count >= opts.threshold) {
    const exponent = Math.min(20, count - opts.threshold);
    const backoff = Math.min(opts.maxMs, opts.baseMs * 2 ** exponent);
    lockedUntil = now + backoff;
  }
  const expiresAt = Math.max(now + opts.windowMs, (lockedUntil ?? now) + opts.windowMs);
  return {
    count,
    firstFailedAt: usable?.firstFailedAt ?? now,
    lastFailedAt: now,
    lockedUntil,
    expiresAt,
  };
}

function lockoutSeconds(state: FailureState | undefined, now: number, windowMs: number): number {
  if (!state || isFailureStateExpired(state, now, windowMs) || !state.lockedUntil) return 0;
  return state.lockedUntil > now ? Math.ceil((state.lockedUntil - now) / 1000) : 0;
}

function sweepLocalFailures(now: number, windowMs: number) {
  for (const [key, state] of localFailures) if (isFailureStateExpired(state, now, windowMs)) localFailures.delete(key);
}

function localRegisterAuthFailure(keyHash: string, opts: Required<AuthFailureOptions>): number {
  const now = Date.now();
  if (localFailures.size >= MAX_LOCAL_FAILURES) {
    sweepLocalFailures(now, opts.windowMs);
    if (localFailures.size >= MAX_LOCAL_FAILURES) {
      const oldest = localFailures.keys().next().value;
      if (oldest !== undefined) localFailures.delete(oldest);
    }
  }
  const next = nextFailureState(localFailures.get(keyHash), now, opts);
  localFailures.set(keyHash, next);
  return lockoutSeconds(next, now, opts.windowMs);
}

async function cleanupExpiredAuthFailureLockouts(now: Date): Promise<void> {
  await db.execute(sql`
    delete from auth_failure_lockouts
    where key_hash in (
      select key_hash
      from auth_failure_lockouts
      where expires_at <= ${now}
      order by expires_at
      limit ${CLEANUP_BATCH_SIZE}
    )
  `);
}

function failureStateFromRow(row: typeof authFailureLockouts.$inferSelect): FailureState {
  return {
    count: row.failureCount,
    firstFailedAt: row.firstFailedAt.getTime(),
    lastFailedAt: row.lastFailedAt.getTime(),
    lockedUntil: row.lockedUntil?.getTime() ?? null,
    expiresAt: row.expiresAt.getTime(),
  };
}

/**
 * Record one failed auth attempt in the shared database and return the
 * current lockout in seconds (0 = not locked). Counts automatically decay
 * after `windowMs` without another failure.
 */
export async function registerAuthFailure(key: string, opts: AuthFailureOptions = {}): Promise<number> {
  const normalized = normalizeAuthFailureOptions(opts);
  const keyHash = await authFailureKeyHash(key);

  try {
    const seconds = await db.transaction(async (tx) => {
      const insertedAt = new Date();
      await tx
        .insert(authFailureLockouts)
        .values({
          keyHash,
          failureCount: 0,
          firstFailedAt: insertedAt,
          lastFailedAt: insertedAt,
          lockedUntil: null,
          expiresAt: new Date(insertedAt.getTime() + normalized.windowMs),
          updatedAt: insertedAt,
        })
        .onConflictDoNothing({ target: authFailureLockouts.keyHash });

      const [row] = await tx
        .select()
        .from(authFailureLockouts)
        .where(eq(authFailureLockouts.keyHash, keyHash))
        .limit(1)
        .for("update");
      if (!row) throw new Error("auth failure lockout row missing after insert");

      const now = Date.now();
      const next = nextFailureState(failureStateFromRow(row), now, normalized);
      await tx
        .update(authFailureLockouts)
        .set({
          failureCount: next.count,
          firstFailedAt: new Date(next.firstFailedAt),
          lastFailedAt: new Date(next.lastFailedAt),
          lockedUntil: next.lockedUntil ? new Date(next.lockedUntil) : null,
          expiresAt: new Date(next.expiresAt),
          updatedAt: new Date(now),
        })
        .where(eq(authFailureLockouts.keyHash, keyHash));
      return lockoutSeconds(next, now, normalized.windowMs);
    });

    localFailures.delete(keyHash);
    if (Math.random() < CLEANUP_SAMPLE_RATE) {
      try {
        await cleanupExpiredAuthFailureLockouts(new Date());
      } catch (cleanupError) {
        logDatabaseFallback("auth lockout cleanup", cleanupError);
      }
    }
    return seconds;
  } catch (error) {
    logDatabaseFallback("auth failure recorder", error);
    return localRegisterAuthFailure(keyHash, normalized);
  }
}

/** Seconds still locked for a key, or 0. Expired records are deleted lazily. */
export async function authLockoutSeconds(key: string, opts: AuthFailureOptions = {}): Promise<number> {
  const normalized = normalizeAuthFailureOptions(opts);
  const keyHash = await authFailureKeyHash(key);
  const now = Date.now();

  try {
    const [row] = await db
      .select()
      .from(authFailureLockouts)
      .where(eq(authFailureLockouts.keyHash, keyHash))
      .limit(1);
    if (!row) return lockoutSeconds(localFailures.get(keyHash), now, normalized.windowMs);

    const state = failureStateFromRow(row);
    if (isFailureStateExpired(state, now, normalized.windowMs)) {
      await db.delete(authFailureLockouts).where(eq(authFailureLockouts.keyHash, keyHash));
      localFailures.delete(keyHash);
      return 0;
    }
    return lockoutSeconds(state, now, normalized.windowMs);
  } catch (error) {
    logDatabaseFallback("auth lockout lookup", error);
    const state = localFailures.get(keyHash);
    if (state && isFailureStateExpired(state, now, normalized.windowMs)) {
      localFailures.delete(keyHash);
      return 0;
    }
    return lockoutSeconds(state, now, normalized.windowMs);
  }
}

/** Clear the failure counter after a successful login; returns recent, unexpired failures. */
export async function clearAuthFailures(key: string, opts: AuthFailureOptions = {}): Promise<number> {
  const normalized = normalizeAuthFailureOptions(opts);
  const keyHash = await authFailureKeyHash(key);
  const now = Date.now();

  try {
    const [row] = await db
      .select()
      .from(authFailureLockouts)
      .where(eq(authFailureLockouts.keyHash, keyHash))
      .limit(1);
    if (row) await db.delete(authFailureLockouts).where(eq(authFailureLockouts.keyHash, keyHash));
    const localState = localFailures.get(keyHash);
    localFailures.delete(keyHash);
    const dbCount = row && !isFailureStateExpired(failureStateFromRow(row), now, normalized.windowMs) ? row.failureCount : 0;
    const localCount =
      localState && !isFailureStateExpired(localState, now, normalized.windowMs) ? localState.count : 0;
    return Math.max(dbCount, localCount);
  } catch (error) {
    logDatabaseFallback("auth failure clear", error);
    const state = localFailures.get(keyHash);
    localFailures.delete(keyHash);
    return state && !isFailureStateExpired(state, now, normalized.windowMs) ? state.count : 0;
  }
}
