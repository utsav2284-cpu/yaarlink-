import { NextResponse, type NextRequest } from "next/server";

const CSP_REPORT_PATH = "/api/security/csp-report";
const CSP_REPORT_GROUP = "csp-endpoint";

function isHttpsRequest(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

function reportEndpointUrl(request: NextRequest): string {
  // `nextUrl.origin` can be the server's bind address (for example 0.0.0.0)
  // behind a platform proxy. Reporting-Endpoints needs the public origin the
  // browser used, so prefer the forwarded/request host and protocol.
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    request.nextUrl.host;
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

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Next and React render a small number of inline style elements/attributes;
    // scripts—the executable XSS surface—remain nonce-only in production.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
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

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(request, nonce);
  const reportEndpoint = reportEndpointUrl(request);

  // Next reads the request CSP, extracts this nonce, and stamps it onto the
  // framework bootstrap/RSC scripts it emits while rendering this request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // The root layout uses this proxy-owned (not caller-controlled) pathname
  // to emit a localized route title in the first HTML response.
  requestHeaders.set("x-yaarlink-pathname", request.nextUrl.pathname);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Reporting-Endpoints", `${CSP_REPORT_GROUP}="${reportEndpoint}"`);

  return response;
}

export const config = {
  matcher: [
    {
      // Documents need a fresh nonce. APIs get a separate static deny-all CSP
      // from next.config.ts; static assets are governed by the document CSP.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
