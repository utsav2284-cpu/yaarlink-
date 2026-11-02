import { createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseHealth } from "./db/health";

export type PublicDatabaseHealth = Pick<DatabaseHealth, "ok" | "status" | "checkedAt">;

/**
 * Public uptime probes need only the same go/no-go signal already carried by
 * the HTTP status. Schema state, pool counters, and error timing remain in
 * the authenticated diagnostic response and server logs.
 */
export function toPublicDatabaseHealth(health: DatabaseHealth): PublicDatabaseHealth {
  return {
    ok: health.ok,
    status: health.status,
    checkedAt: health.checkedAt,
  };
}

/** Returns the single bearer credential, or null for every other scheme/shape. */
export function getBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer[ \t]+([^ \t]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/**
 * Compare SHA-256 digests so valid/invalid credentials take the same
 * fixed-length comparison path and neither length nor a matching prefix can
 * short-circuit the check.
 */
export function isDiagnosticTokenValid(given: string | null, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const givenDigest = createHash("sha256").update(given, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(givenDigest, expectedDigest);
}

/** Cheap presence check before doing database-backed admin-session verification. */
export function hasCookie(cookieHeader: string | null, cookieName: string): boolean {
  if (!cookieHeader) return false;

  return cookieHeader.split(";").some((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return false;
    return part.slice(0, separator).trim() === cookieName && part.slice(separator + 1).trim().length > 0;
  });
}
