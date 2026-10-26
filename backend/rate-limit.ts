const buckets = new Map<string, { count: number; resetAt: number }>();
const failures = new Map<string, { count: number; lockedUntil: number }>();
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export function getClientKey(req: Request, prefix: string) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}

/** FNV-1a hash, so attacker-supplied values (e.g. emails) are not retained verbatim as map keys. */
export function hashKey(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Lightweight per-isolate limiter. Cloudflare edge/WAF rate limiting should be added for stronger distributed protection. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    // Keep the map bounded: drop expired buckets, then the oldest entry if still full.
    if (buckets.size >= MAX_BUCKETS) {
      sweep(now);
      if (buckets.size >= MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count > limit) return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

export function limitedResponse(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

const DEFAULT_LOCKOUT = { threshold: 5, baseMs: 60_000, maxMs: 15 * 60_000 };

/**
 * Record one failed auth attempt and return the current lockout in seconds (0 = not locked).
 * After `threshold` failures the key is locked for `baseMs`, doubling with each further
 * failure up to `maxMs` — a hard lockout + backoff on top of the sliding-window limiter.
 */
export function registerAuthFailure(key: string, opts: { threshold?: number; baseMs?: number; maxMs?: number } = {}) {
  const { threshold, baseMs, maxMs } = { ...DEFAULT_LOCKOUT, ...opts };
  const now = Date.now();
  const record = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= threshold) {
    const backoff = Math.min(maxMs, baseMs * 2 ** (record.count - threshold));
    record.lockedUntil = now + backoff;
  }
  failures.set(key, record);
  return record.lockedUntil > now ? Math.ceil((record.lockedUntil - now) / 1000) : 0;
}

/** Seconds still locked for a key, or 0. */
export function authLockoutSeconds(key: string) {
  const record = failures.get(key);
  if (!record) return 0;
  const remaining = record.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** Clear the failure counter after a successful login; returns how many recent failures were recorded. */
export function clearAuthFailures(key: string) {
  const count = failures.get(key)?.count ?? 0;
  failures.delete(key);
  return count;
}
