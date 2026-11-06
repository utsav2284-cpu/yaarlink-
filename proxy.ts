import { NextResponse, type NextRequest } from "next/server";
import { SITE } from "@/config/site";
import { adminAuthCspOrigin } from "@/lib/admin-csp";
import { localAdminCspAllowed } from "@/lib/admin-local-config";
import { isAllowedMutationOrigin } from "@/shared/csrf";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/shared/observability";

const CSP_REPORT_PATH = "/api/security/csp-report";
const CSP_REPORT_GROUP = "csp-endpoint";

function isHttpsRequest(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

function effectiveRequestHost(request: NextRequest): string {
  // `nextUrl.host` can be the server's bind address (for example 0.0.0.0)
  // behind a platform proxy, so prefer the forwarded/request host the
  // browser actually used.
  return (
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    request.nextUrl.host
  );
}

function reportEndpointUrl(request: NextRequest): string {
  // Reporting-Endpoints needs the public origin the browser used, so prefer
  // the forwarded/request host and protocol over `nextUrl.origin`.
  const host = effectiveRequestHost(request);
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : request.nextUrl.protocol.replace(":", "");

  try {
    return new URL(CSP_REPORT_PATH, `${protocol}://${host}`).toString();
  } catch {
    return new URL(CSP_REPORT_PATH, request.nextUrl.origin).toString();
  }
}

function buildContentSecurityPolicy(request: NextRequest, nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === "development";
  const localAuth = localAdminCspAllowed(process.env.NEXT_PUBLIC_YAARLINK_LOCAL_ADMIN, process.env.NODE_ENV, process.env.VERCEL, request.headers.get("host") ?? undefined, request.headers.get("x-forwarded-host"));

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Next and React render a small number of inline style elements/attributes;
    // scripts—the executable XSS surface—remain nonce-only in production.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${adminAuthCspOrigin(process.env.VERCEL_ENV)}${localAuth ? " http://127.0.0.1:54321" : ""}${isDevelopment ? " ws: wss:" : ""}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttpsRequest(request) ? ["upgrade-insecure-requests"] : []),
    `report-to ${CSP_REPORT_GROUP}`,
    // report-uri is deprecated, but remains the fallback for browsers that do
    // not implement the Reporting API's report-to/Reporting-Endpoints pair.
    `report-uri ${CSP_REPORT_PATH}`,
  ];

  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers);
  const requestHeaders = new Headers(request.headers);
  if (requestId) requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set("x-yaarlink-pathname", request.nextUrl.pathname);

  // API responses keep their static deny-all CSP from next.config.ts. The
  // proxy establishes one correlation ID that route logs and the response
  // share, and refuses cross-origin state-changing requests before any
  // route handler can act on ambient cookie credentials (CSRF). The CSP
  // report endpoint is exempt: it is unauthenticated browser machinery that
  // changes no state and must keep accepting reports.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (
      request.nextUrl.pathname !== CSP_REPORT_PATH &&
      !isAllowedMutationOrigin({
        method: request.method,
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
        secFetchSite: request.headers.get("sec-fetch-site"),
        requestHost: effectiveRequestHost(request),
        allowedHosts: [SITE.host, SITE.domain],
      })
    ) {
      const blocked = NextResponse.json(
        { error: "Cross-origin request blocked.", code: "forbidden_origin" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
      if (requestId) blocked.headers.set(REQUEST_ID_HEADER, requestId);
      return blocked;
    }

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    if (requestId) response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(request, nonce);
  const reportEndpoint = reportEndpointUrl(request);

  // Next reads the request CSP, extracts this nonce, and stamps it onto the
  // framework bootstrap/RSC scripts it emits while rendering this request.
  requestHeaders.set("x-nonce", nonce);
  // The root layout uses this proxy-owned (not caller-controlled) pathname
  // to emit a localized route title in the first HTML response.
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (requestId) response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Reporting-Endpoints", `${CSP_REPORT_GROUP}="${reportEndpoint}"`);

  return response;
}

export const config = {
  matcher: [
    {
      // Documents need a fresh nonce. Static assets are governed by the
      // document CSP and do not need proxy-generated request IDs.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      // API requests run the correlation-ID branch above; their CSP remains
      // the separate deny-all header configured in next.config.ts.
      source: "/api/(.*)",
    },
  ],
};
