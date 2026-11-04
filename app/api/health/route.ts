import { requireAdminAccess } from "@/backend/admin-access";
import {
  ADMIN_ACCOUNT_COOKIE,
  isAdminIdentityUnavailableError,
  logAdminIdentityUnavailable,
} from "@/backend/admin-identity";
import { checkDatabaseHealth } from "@/backend/db/health";
import {
  getBearerToken,
  hasCookie,
  isDiagnosticTokenValid,
  toPublicDatabaseHealth,
} from "@/backend/health-diagnostics";
import { logRouteEvent } from "@/backend/observability";
import { getHealthDiagnosticToken } from "@/backend/secret-config";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

type DiagnosticAccess = "authorized" | "public" | "invalid-authorization";
type DiagnosticAccessResult = {
  access: DiagnosticAccess;
  via: "bearer-token" | "admin-session" | null;
};

function healthHeaders(ok: boolean): Headers {
  const headers = new Headers(NO_STORE);
  // The same URL intentionally returns a smaller body to anonymous callers.
  // no-store is the primary protection; Vary prevents a shared intermediary
  // from confusing the public and authenticated variants if it ignores it.
  headers.set("Vary", "Authorization, Cookie");
  if (!ok) headers.set("Retry-After", "30");
  return headers;
}

async function getDiagnosticAccess(request: Request): Promise<DiagnosticAccessResult> {
  const authorization = request.headers.get("authorization");

  // A caller that explicitly supplies credentials is asking for diagnostics.
  // Fail that request closed instead of silently returning the public body,
  // which could make an expired monitoring credential look successful.
  if (authorization !== null) {
    return isDiagnosticTokenValid(getBearerToken(authorization), getHealthDiagnosticToken())
      ? { access: "authorized", via: "bearer-token" }
      : { access: "invalid-authorization", via: "bearer-token" };
  }

  // Query parameters—including the historical `diag` cache-buster—never grant
  // access. A valid, database-revocable admin session is the browser path.
  if (!hasCookie(request.headers.get("cookie"), ADMIN_ACCOUNT_COOKIE)) {
    return { access: "public", via: null };
  }

  try {
    return (await requireAdminAccess("system.health.view", request))
      ? { access: "authorized", via: "admin-session" }
      : { access: "public", via: null };
  } catch (error) {
    if (isAdminIdentityUnavailableError(error)) logAdminIdentityUnavailable(error, request);
    return { access: "public", via: null };
  }
}

export async function GET(request: Request) {
  const { access, via } = await getDiagnosticAccess(request);

  // Diagnostics expose operational detail, so every privileged access—and
  // every rejected credential—is audit-logged with the request correlation
  // ID. The credential itself is never logged; anonymous public probes are
  // expected uptime traffic and stay unlogged.
  if (access === "authorized") {
    logRouteEvent("info", "health.diagnostics_accessed", request, { component: "health", via });
  } else if (access === "invalid-authorization") {
    logRouteEvent("warn", "health.diagnostics_rejected", request, { component: "health", via });
  }

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
