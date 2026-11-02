import { logError, normalizeRoutePath, requestIdFromHeaders } from "@/shared/observability";

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
