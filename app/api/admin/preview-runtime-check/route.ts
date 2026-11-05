import { timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { getClientIp } from "@/backend/rate-limit";
import { getPool } from "@/backend/db";
import { normalizeDatabaseConnectionString } from "@/backend/db/connection-config";

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
  | "DATABASE_CONFIGURATION_INVALID"
  | "UNKNOWN_DATABASE_ERROR";
type DatabaseFailureStage = "connection_establishment" | "select_1" | "identity_query";
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

function databaseErrorDetails(error: unknown): { codes: Set<string>; messages: Set<string> } {
  const codes = new Set<string>();
  const messages = new Set<string>();
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0 && visited.size < 12) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") codes.add(record.code.toUpperCase());
    if (typeof record.message === "string") messages.add(record.message);
    if (record.cause) pending.push(record.cause);
    if (record.originalError) pending.push(record.originalError);
    if (Array.isArray(record.errors)) pending.push(...record.errors.slice(0, 8));
  }
  return { codes, messages };
}

function classifyDatabaseError(error: unknown, stage: DatabaseFailureStage): DatabaseFailureCategory {
  const { codes, messages } = databaseErrorDetails(error);
  const codeIs = (...candidates: string[]) => candidates.some((candidate) => codes.has(candidate));

  // Pool construction can throw before a socket is opened. Match only the
  // fixed validation messages from connection-config.ts; never return them.
  if ([
    "DATABASE_URL is required",
    "DATABASE_URL must be a valid PostgreSQL connection URL",
    "DATABASE_CA_CERT must contain a PEM-encoded CA certificate",
    "DATABASE_URL must enable verified TLS for a remote database",
    "DATABASE_URL must use sslmode=verify-full for a remote database; do not use no-verify, disable, prefer, require, or verify-ca",
    "DATABASE_URL sslrootcert=system is not supported by node-postgres; omit sslrootcert for a public CA or set DATABASE_CA_CERT",
    "DATABASE_URL for Supabase must be paired with DATABASE_CA_CERT (the downloaded Supabase root certificate) or sslrootcert",
  ].some((message) => messages.has(message))) return "DATABASE_CONFIGURATION_INVALID";

  if (codeIs("28P01", "28000")) return "DATABASE_AUTHENTICATION_FAILED";
  if (codeIs("ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "ENODATA", "EAI_NONAME")) return "DATABASE_DNS_FAILED";
  if (codeIs("ECONNREFUSED")) return "DATABASE_CONNECTION_REFUSED";
  if (codeIs("ETIMEDOUT", "ESOCKETTIMEDOUT", "CONNECT_TIMEOUT")) return "DATABASE_CONNECTION_TIMEOUT";
  if (codeIs(
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED",
    "ERR_TLS_CERT_UNKNOWN_SIGNER",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "ERR_SSL_WRONG_VERSION_NUMBER",
    "ERR_TLS_HANDSHAKE_TIMEOUT",
  )) return "DATABASE_TLS_CERTIFICATE_FAILED";
  if (codeIs("42501")) return "DATABASE_PERMISSION_DENIED";
  if (stage !== "connection_establishment") return "DATABASE_QUERY_FAILED";
  return "UNKNOWN_DATABASE_ERROR";
}

function inspectDatabaseConfiguration() {
  const connectionString = process.env.DATABASE_URL;
  const caCertificate = process.env.DATABASE_CA_CERT?.trim() ?? "";
  const caConfigured = caCertificate.includes("-----BEGIN CERTIFICATE-----") && caCertificate.includes("-----END CERTIFICATE-----");
  if (!connectionString) {
    return { urlConfigured: false, urlParseable: false, configuredPreviewProject: false, configuredApplicationRole: false, caCertificateConfigured: caConfigured };
  }

  try {
    const url = new URL(normalizeDatabaseConnectionString(connectionString));
    const username = decodeURIComponent(url.username).toLowerCase();
    const host = url.hostname.toLowerCase();
    const projectMatch = host.includes(EXPECTED_PREVIEW_REF) || username.split(/[.@]/).includes(EXPECTED_PREVIEW_REF);
    const roleMatch = username === "yaarlink_app" || username.startsWith("yaarlink_app.");
    return {
      urlConfigured: true,
      urlParseable: (url.protocol === "postgres:" || url.protocol === "postgresql:") && Boolean(url.hostname),
      configuredPreviewProject: projectMatch,
      configuredApplicationRole: roleMatch,
      caCertificateConfigured: caConfigured,
    };
  } catch {
    return { urlConfigured: true, urlParseable: false, configuredPreviewProject: false, configuredApplicationRole: false, caCertificateConfigured: caConfigured };
  }
}

function databaseFailureExplanation(category: DatabaseFailureCategory): string {
  switch (category) {
    case "DATABASE_AUTHENTICATION_FAILED": return "The database rejected authentication.";
    case "DATABASE_DNS_FAILED": return "The database host could not be resolved.";
    case "DATABASE_CONNECTION_REFUSED": return "The database host refused the connection.";
    case "DATABASE_CONNECTION_TIMEOUT": return "The database connection attempt timed out.";
    case "DATABASE_TLS_CERTIFICATE_FAILED": return "The verified TLS certificate check failed.";
    case "DATABASE_PERMISSION_DENIED": return "The database role lacks permission for the verification query.";
    case "DATABASE_QUERY_FAILED": return "The database connection succeeded, but a read-only verification query failed.";
    case "DATABASE_CONFIGURATION_INVALID": return "The server rejected the database connection configuration before connecting.";
    case "UNKNOWN_DATABASE_ERROR": return "The connection failed with an unrecognized driver error; no raw error details are exposed.";
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
  let selectOneSucceeded = false;
  let identityQuerySucceeded = false;
  let databaseFailure: { category: DatabaseFailureCategory; stage: DatabaseFailureStage } | null = null;
  let actualRole: string | null = null;
  let actualSystemIdentifier: string | null = null;
  let roleIsRestricted = false;
  let client: PoolClient | undefined;
  try {
    // Pool construction/config validation and socket/auth/TLS establishment
    // are caught at this boundary, before any SQL is sent.
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
      await client.query("SELECT 1 AS ok");
      selectOneSucceeded = true;
    } catch (error) {
      databaseFailure = {
        category: classifyDatabaseError(error, "select_1"),
        stage: "select_1",
      };
    }

    if (selectOneSucceeded) {
      try {
        // Fixed, read-only identity query; it returns no user records.
        const result = await client.query<RuntimeIdentityRow>(
          "SELECT current_user AS role, (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier, r.rolsuper AS is_superuser, r.rolcreatedb AS can_create_database, r.rolcreaterole AS can_create_roles, r.rolreplication AS can_replicate, r.rolbypassrls AS bypasses_rls FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user",
        );
        identityQuerySucceeded = true;
        const row = result.rows[0];
        if (row && typeof row.role === "string" && typeof row.system_identifier === "string") {
          actualRole = row.role;
          actualSystemIdentifier = row.system_identifier;
          roleIsRestricted = !row.is_superuser && !row.can_create_database && !row.can_create_roles && !row.can_replicate && !row.bypasses_rls;
        }
      } catch (error) {
        databaseFailure = {
          category: classifyDatabaseError(error, "identity_query"),
          stage: "identity_query",
        };
      }
    }
    client.release();
  }

  const identityAvailable = actualRole !== null && actualSystemIdentifier !== null;
  const databaseConfiguration = inspectDatabaseConfiguration();
  const databaseConnection = {
    status: connectionEstablished && selectOneSucceeded && identityQuerySucceeded && identityAvailable ? "PASS" : "FAIL",
    configuration: databaseConfiguration,
    connectionEstablished,
    selectOneSucceeded,
    identityQuerySucceeded,
    stage: databaseFailure?.stage ?? (identityQuerySucceeded && !identityAvailable ? "identity_validation" : "complete"),
    category: databaseFailure?.category ?? (identityQuerySucceeded && !identityAvailable ? "UNKNOWN_DATABASE_ERROR" : null),
    explanation: databaseFailure
      ? databaseFailureExplanation(databaseFailure.category)
      : identityQuerySucceeded && !identityAvailable
        ? "The identity query completed but returned no verifiable database identity."
        : identityQuerySucceeded
          ? "Connection, SELECT 1, and identity query succeeded."
          : "Database connection checks completed.",
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
