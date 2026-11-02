import { logError, logEvent, normalizeRoutePath, requestIdFromHeaders } from "@/shared/observability";

type RequestErrorContext = {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "proxy";
  renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
  revalidateReason: "on-demand" | "stale" | undefined;
};

export async function register() {
  // `next build` should not need production secrets merely to compile. The
  // check runs when a server instance starts and request-level guards remain
  // as a fail-closed backstop on platforms that do not invoke instrumentation.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertServerSecretConfiguration } = await import("@/backend/secret-config");
  try {
    assertServerSecretConfiguration();
  } catch (error) {
    logError("startup.configuration_failed", error, { component: "instrumentation" });
    // Next records an instrumentation failure but can leave a Node HTTP
    // listener alive returning 500s. Exit explicitly in the Node runtime so
    // supervisors and deployment health checks see a failed startup. Edge
    // runtimes still fail initialization by rethrowing.
    if (process.env.NEXT_RUNTIME === "nodejs") process.exit(1);
    throw error;
  }

  // Public contact/social settings live in source (config/site.ts), so a typo
  // there would otherwise become a silently broken WhatsApp/Instagram/email
  // link. Warn once at startup with field/code pairs only — never the values.
  // The link builders already return "" for malformed entries, so this is a
  // warning, not a startup failure.
  try {
    const { SITE, validateSiteConfig } = await import("@/config/site");
    const siteIssues = validateSiteConfig(SITE);
    if (siteIssues.length > 0) {
      logEvent("warn", "startup.site_configuration_warning", {
        component: "site-config",
        issueCount: siteIssues.length,
        issues: siteIssues,
      });
    }
  } catch (error) {
    logError("startup.site_configuration_failed", error, { component: "site-config" });
  }
}

export function onRequestError(
  error: unknown,
  request: Readonly<{ path: string; method: string; headers: Record<string, string | string[] | undefined> }>,
  context: Readonly<RequestErrorContext>,
): void {
  const routePath = normalizeRoutePath(context.routePath) || normalizeRoutePath(request.path) || "unknown";
  logError("request.unhandled", error, {
    component: "next-instrumentation",
    requestId: requestIdFromHeaders(request.headers),
    route: `${request.method.toUpperCase()} ${routePath}`,
    routerKind: context.routerKind,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  });
}
