import {
  ADMIN_COOKIE,
  isAdmin,
  isAdminSessionUnavailableError,
  logAdminSessionUnavailable,
} from "@/backend/admin";
import { checkDatabaseHealth } from "@/backend/db/health";
import {
  getBearerToken,
  hasCookie,
  isDiagnosticTokenValid,
  toPublicDatabaseHealth,
} from "@/backend/health-diagnostics";
import { getHealthDiagnosticToken } from "@/backend/secret-config";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

type DiagnosticAccess = "authorized" | "public" | "invalid-authorization";

function healthHeaders(ok: boolean): Headers {
  const headers = new Headers(NO_STORE);
  // The same URL intentionally returns a smaller body to anonymous callers.
  // no-store is the primary protection; Vary prevents a shared intermediary
  // from confusing the public and authenticated variants if it ignores it.
  headers.set("Vary", "Authorization, Cookie");
  if (!ok) headers.set("Retry-After", "30");
  return headers;
}

async function getDiagnosticAccess(request: Request): Promise<DiagnosticAccess> {
  const authorization = request.headers.get("authorization");

  // A caller that explicitly supplies credentials is asking for diagnostics.
  // Fail that request closed instead of silently returning the public body,
  // which could make an expired monitoring credential look successful.
  if (authorization !== null) {
    return isDiagnosticTokenValid(getBearerToken(authorization), getHealthDiagnosticToken())
      ? "authorized"
      : "invalid-authorization";
  }

  // Query parameters—including the historical `diag` cache-buster—never grant
  // access. A valid, database-revocable admin session is the browser path.
  if (!hasCookie(request.headers.get("cookie"), ADMIN_COOKIE)) return "public";

  try {
    return (await isAdmin()) ? "authorized" : "public";
  } catch (error) {
    if (isAdminSessionUnavailableError(error)) logAdminSessionUnavailable(error, request);
    return "public";
  }
}

export async function GET(request: Request) {
  const access = await getDiagnosticAccess(request);

  if (access === "invalid-authorization") {
    const headers = healthHeaders(false);
    headers.set("WWW-Authenticate", 'Bearer realm="health-diagnostics"');
    return Response.json(
      { ok: false, status: "unauthorized", checkedAt: new Date().toISOString() },
      { status: 401, headers },
    );
  }

  const health = await checkDatabaseHealth();
  return Response.json(access === "authorized" ? health : toPublicDatabaseHealth(health), {
    status: health.ok ? 200 : 503,
    headers: healthHeaders(health.ok),
  });
}
