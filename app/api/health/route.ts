import { checkDatabaseHealth } from "@/backend/db/health";
import { getBearerToken, isDiagnosticTokenValid, toPublicDatabaseHealth } from "@/backend/health-diagnostics";
import { logRouteEvent } from "@/backend/observability";
import { getHealthDiagnosticToken } from "@/backend/secret-config";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

function healthHeaders(ok: boolean, authorized: boolean): Headers {
  const headers = new Headers(NO_STORE);
  headers.set("Vary", "Authorization");
  if (!ok) headers.set("Retry-After", "30");
  if (authorized) headers.set("X-Robots-Tag", "noindex");
  return headers;
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const authorized = authorization !== null &&
    isDiagnosticTokenValid(getBearerToken(authorization), getHealthDiagnosticToken());
  if (authorization !== null && !authorized) {
    logRouteEvent("warn", "health.diagnostics_rejected", request, { component: "health", via: "bearer-token" });
    const headers = healthHeaders(false, false);
    headers.set("WWW-Authenticate", 'Bearer realm="health-diagnostics"');
    return Response.json({ ok: false, status: "unauthorized", checkedAt: new Date().toISOString() }, { status: 401, headers });
  }
  if (authorized) logRouteEvent("info", "health.diagnostics_accessed", request, { component: "health", via: "bearer-token" });
  const health = await checkDatabaseHealth();
  return Response.json(authorized ? health : toPublicDatabaseHealth(health), {
    status: health.ok ? 200 : 503,
    headers: healthHeaders(health.ok, authorized),
  });
}
