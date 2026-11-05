import { timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { getClientIp } from "@/backend/rate-limit";
import { getPool } from "@/backend/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const EXPECTED_BRANCH = "arena/9b3c6e40-yaarlink";
const EXPECTED_PREVIEW_REF = "rjxpvkzlwhabuntfvkct";
const EXPECTED_PRODUCTION_REF = "dqhxgwzjwzvpqiilteld";
// These PostgreSQL cluster system identifiers were read directly from the
// named Supabase projects. Unlike DATABASE_URL metadata, matching this value
// from a query through the app pool identifies the database actually reached.
const PREVIEW_SYSTEM_IDENTIFIER = "7702070854497379551";
const PRODUCTION_SYSTEM_IDENTIFIER = "7690937621030482216";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_ATTEMPTS = 5;
const MAX_RATE_LIMIT_BUCKETS = 2_000;

type RateLimitBucket = { count: number; expiresAt: number };
type DatabaseFailureCategory =
  | "DATABASE_AUTHENTICATION_FAILED"
  | "DATABASE_DNS_FAILED"
  | "DATABASE_CONNECTION_REFUSED"
  | "DATABASE_CONNECTION_TIMEOUT"
  | "DATABASE_TLS_CERTIFICATE_FAILED"
  | "DATABASE_PERMISSION_DENIED"
  | "DATABASE_QUERY_FAILED"
  | "UNKNOWN_DATABASE_ERROR";
type DatabaseFailureStage = "connection_establishment" | "query_execution";
type RuntimeIdentityRow = {
  role: string;
  system_identifier: string;
  is_superuser: boolean;
  can_create_database: boolean;
  can_create_roles: boolean;
  can_replicate: boolean;
  bypasses_rls: boolean;
};
const attemptsByIp = new Map<string, RateLimitBucket>();

function classifyDatabaseError(error: unknown, stage: DatabaseFailureStage): DatabaseFailureCategory {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";

  if (code === "28P01" || code === "28000") return "DATABASE_AUTHENTICATION_FAILED";
  if (["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "ENODATA"].includes(code)) return "DATABASE_DNS_FAILED";
  if (code === "ECONNREFUSED") return "DATABASE_CONNECTION_REFUSED";
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT", "CONNECT_TIMEOUT"].includes(code)) return "DATABASE_CONNECTION_TIMEOUT";
  if ([
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "SELF_SIGNED_CERT_IN_CHAIN",
  ].includes(code)) return "DATABASE_TLS_CERTIFICATE_FAILED";
  if (code === "42501") return "DATABASE_PERMISSION_DENIED";
  if (stage === "query_execution") return "DATABASE_QUERY_FAILED";
  return "UNKNOWN_DATABASE_ERROR";
}

function databaseFailureExplanation(category: DatabaseFailureCategory): string {
  switch (category) {
    case "DATABASE_AUTHENTICATION_FAILED": return "The database rejected authentication.";
    case "DATABASE_DNS_FAILED": return "The database host could not be resolved.";
    case "DATABASE_CONNECTION_REFUSED": return "The database host refused the connection.";
    case "DATABASE_CONNECTION_TIMEOUT": return "The database connection attempt timed out.";
    case "DATABASE_TLS_CERTIFICATE_FAILED": return "The verified TLS certificate check failed.";
    case "DATABASE_PERMISSION_DENIED": return "The database role lacks permission for the verification query.";
    case "DATABASE_QUERY_FAILED": return "The database connection succeeded, but the verification query failed.";
    case "UNKNOWN_DATABASE_ERROR": return "The database operation failed for an unclassified reason.";
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(req.url).origin) return false;
  } catch {
    return false;
  }
  const fetchSite = req.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

function allowAttempt(ip: string): boolean {
  const now = Date.now();
  for (const [key, bucket] of attemptsByIp) {
    if (bucket.expiresAt <= now) attemptsByIp.delete(key);
  }
  const current = attemptsByIp.get(ip);
  if (current && current.expiresAt > now) {
    if (current.count >= RATE_LIMIT_ATTEMPTS) return false;
    current.count += 1;
    return true;
  }
  if (attemptsByIp.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = attemptsByIp.keys().next().value;
    if (oldestKey !== undefined) attemptsByIp.delete(oldestKey);
  }
  attemptsByIp.set(ip, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
  return true;
}

function tokenMatches(provided: unknown): boolean {
  const expected = process.env.PREVIEW_RUNTIME_VERIFY_TOKEN;
  if (typeof expected !== "string" || !TOKEN_PATTERN.test(expected)) return false;
  if (typeof provided !== "string" || !TOKEN_PATTERN.test(provided)) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const providedBytes = Buffer.from(provided, "hex");
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET() {
  return json({ ok: false, error: "post_required" }, 405);
}

export async function POST(req: Request) {
  // Fail closed outside the one approved Preview branch. Production never
  // reaches the database query, even with a configured token.
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) {
    return json({ ok: false, error: "preview_target_only" }, 404);
  }

  if (!sameOrigin(req)) return json({ ok: false, error: "same_origin_required" }, 403);
  if (!allowAttempt(getClientIp(req))) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }
  if (!process.env.PREVIEW_RUNTIME_VERIFY_TOKEN || !TOKEN_PATTERN.test(process.env.PREVIEW_RUNTIME_VERIFY_TOKEN)) {
    return json({ ok: false, error: "verification_not_configured" }, 503);
  }
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "invalid_request" }, 415);
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 1_024) return json({ ok: false, error: "invalid_request" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const token = body && typeof body === "object" && "token" in body ? body.token : undefined;
  if (!tokenMatches(token)) return json({ ok: false, error: "not_authorized" }, 401);

  const environmentActual = process.env.VERCEL_ENV ?? "missing";
  const branchActual = process.env.VERCEL_GIT_COMMIT_REF ?? "missing";
  let connectionEstablished = false;
  let querySucceeded = false;
  let databaseFailure: { category: DatabaseFailureCategory; stage: DatabaseFailureStage } | null = null;
  let actualRole: string | null = null;
  let actualSystemIdentifier: string | null = null;
  let roleIsRestricted = false;
  let client: PoolClient | undefined;
  try {
    // Acquire first so connection establishment and SQL execution failures are
    // distinguishable. Both operations use the same shared application pool.
    client = await getPool().connect();
    connectionEstablished = true;
  } catch (error) {
    databaseFailure = {
      category: classifyDatabaseError(error, "connection_establishment"),
      stage: "connection_establishment",
    };
  }

  if (client) {
    try {
      // Fixed, read-only identity query; it returns no user records.
      const result = await client.query<RuntimeIdentityRow>(
        "SELECT current_user AS role, (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier, r.rolsuper AS is_superuser, r.rolcreatedb AS can_create_database, r.rolcreaterole AS can_create_roles, r.rolreplication AS can_replicate, r.rolbypassrls AS bypasses_rls FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user",
      );
      querySucceeded = true;
      const row = result.rows[0];
      if (row && typeof row.role === "string" && typeof row.system_identifier === "string") {
        actualRole = row.role;
        actualSystemIdentifier = row.system_identifier;
        roleIsRestricted = !row.is_superuser && !row.can_create_database && !row.can_create_roles && !row.can_replicate && !row.bypasses_rls;
      }
    } catch (error) {
      databaseFailure = {
        category: classifyDatabaseError(error, "query_execution"),
        stage: "query_execution",
      };
    } finally {
      client.release();
    }
  }

  const databaseConnection = {
    status: connectionEstablished && querySucceeded && actualRole !== null && actualSystemIdentifier !== null ? "PASS" : "FAIL",
    connectionEstablished,
    querySucceeded,
    stage: databaseFailure?.stage ?? (querySucceeded ? "identity_validation" : "connection_establishment"),
    category: databaseFailure?.category ?? (querySucceeded && (!actualRole || !actualSystemIdentifier) ? "UNKNOWN_DATABASE_ERROR" : null),
    explanation: databaseFailure
      ? databaseFailureExplanation(databaseFailure.category)
      : querySucceeded && (!actualRole || !actualSystemIdentifier)
        ? "The query completed but returned no verifiable database identity."
        : connectionEstablished && querySucceeded
          ? "The read-only identity query completed successfully."
          : "The database connection could not be established.",
  } as const;
  const databaseChecksPassed = databaseConnection.status === "PASS";
  const isPreviewProject = actualSystemIdentifier === PREVIEW_SYSTEM_IDENTIFIER;
  const isProductionProject = actualSystemIdentifier === PRODUCTION_SYSTEM_IDENTIFIER;
  const checks = {
    environment: {
      status: environmentActual === "preview" ? "PASS" : "FAIL",
      expected: "preview",
      actual: environmentActual,
    },
    branch: {
      status: branchActual === EXPECTED_BRANCH ? "PASS" : "FAIL",
      expected: EXPECTED_BRANCH,
      actual: branchActual,
    },
    databaseConnection,
    supabaseProject: {
      status: isPreviewProject ? "PASS" : "FAIL",
      expectedProject: "yaarlink-preview",
      expectedProjectRef: EXPECTED_PREVIEW_REF,
      actualProjectRef: isPreviewProject ? EXPECTED_PREVIEW_REF : isProductionProject ? EXPECTED_PRODUCTION_REF : null,
    },
    applicationRole: {
      status: actualRole === "yaarlink_app" ? "PASS" : "FAIL",
      expected: "yaarlink_app",
      actual: actualRole,
    },
    applicationRolePrivileges: {
      status: databaseChecksPassed && roleIsRestricted ? "PASS" : "FAIL",
      expected: "no superuser, create-database, create-role, replication, or RLS-bypass privileges",
      actual: databaseChecksPassed ? (roleIsRestricted ? "restricted" : "one or more elevated privileges") : "unavailable",
    },
    productionDatabase: {
      status: databaseChecksPassed && !isProductionProject ? "PASS" : "FAIL",
      detected: databaseChecksPassed ? isProductionProject : null,
    },
  } as const;
  const ok = Object.values(checks).every((check) => check.status === "PASS");
  return json({ ok, checks });
}
