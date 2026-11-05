import { timingSafeEqual } from "node:crypto";
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
  let connectionSucceeded = false;
  let actualRole: string | null = null;
  let actualSystemIdentifier: string | null = null;
  let roleIsRestricted = false;
  try {
    // This fixed, read-only SELECT runs through the same shared node-postgres
    // pool used by Drizzle and the Admin routes. It returns no user records.
    const result = await getPool().query<RuntimeIdentityRow>(
      "SELECT current_user AS role, (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier, r.rolsuper AS is_superuser, r.rolcreatedb AS can_create_database, r.rolcreaterole AS can_create_roles, r.rolreplication AS can_replicate, r.rolbypassrls AS bypasses_rls FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user",
    );
    const row = result.rows[0];
    if (row && typeof row.role === "string" && typeof row.system_identifier === "string") {
      connectionSucceeded = true;
      actualRole = row.role;
      actualSystemIdentifier = row.system_identifier;
      roleIsRestricted = !row.is_superuser && !row.can_create_database && !row.can_create_roles && !row.can_replicate && !row.bypasses_rls;
    }
  } catch {
    // Deliberately return no driver error, SQL, host, or credential details.
  }

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
    databaseConnection: {
      status: connectionSucceeded ? "PASS" : "FAIL",
    },
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
      status: connectionSucceeded && roleIsRestricted ? "PASS" : "FAIL",
      expected: "no superuser, create-database, create-role, replication, or RLS-bypass privileges",
      actual: connectionSucceeded ? (roleIsRestricted ? "restricted" : "one or more elevated privileges") : "unavailable",
    },
    productionDatabase: {
      status: connectionSucceeded && !isProductionProject ? "PASS" : "FAIL",
      detected: connectionSucceeded ? isProductionProject : null,
    },
  } as const;
  const ok = Object.values(checks).every((check) => check.status === "PASS");
  return json({ ok, checks });
}
