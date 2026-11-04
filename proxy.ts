import { NextResponse, type NextRequest } from "next/server";
import { SITE } from "@/config/site";
import { isAllowedMutationOrigin } from "@/shared/csrf";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/shared/observability";
import {
  isSiteAvailabilityExemptPath,
  type EffectiveSiteAvailability,
} from "@/shared/site-availability";
import {
  LANGUAGE_COOKIE,
  LOCALES,
  languageFromAcceptLanguage,
  normalizeLanguageTag,
} from "@/frontend/i18n/config";
import { loadLocale } from "@/frontend/i18n/load-locale";
import { translateMessage } from "@/frontend/i18n/translate";

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

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Next and React render a small number of inline style elements/attributes;
    // scripts—the executable XSS surface—remain nonce-only in production.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function siteUnavailableResponse(
  request: NextRequest,
  availability: EffectiveSiteAvailability,
  requestId: string | null | undefined,
): Promise<NextResponse> {
  const lang = normalizeLanguageTag(request.cookies.get(LANGUAGE_COOKIE)?.value)
    ?? languageFromAcceptLanguage(request.headers.get("accept-language"));
  const locale = LOCALES[lang];
  const localeData = await loadLocale(lang);
  const t = (key: Parameters<typeof translateMessage>[2], values: Parameters<typeof translateMessage>[3] = {}) =>
    translateMessage(localeData.messages, locale, key, values);
  const message = availability.settings.message ?? t("maintenance.body");
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Retry-After": String(availability.retryAfterSeconds),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  if (requestId) headers.set(REQUEST_ID_HEADER, requestId);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: message,
        code: availability.effectiveMode === "emergency" ? "emergency_mode" : "maintenance_mode",
      },
      { status: 503, headers },
    );
  }

  const backAt = availability.settings.endsAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(availability.settings.endsAt))
    : null;
  const title = t("maintenance.title");
  const backText = backAt ? t("maintenance.backAt", { date: backAt }) : "";
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${escapeHtml(title)} · YaarLink</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #fffbf1; color: #1c1917; font-family: Arial, system-ui, sans-serif; }
      main { width: min(100%, 620px); border: 1px solid #e9ddc3; border-radius: 28px; background: #ffffff; padding: clamp(28px, 6vw, 48px); box-shadow: 0 24px 60px rgba(28, 25, 23, 0.10); }
      .brand { margin: 0 0 18px; color: #c7431f; font-size: 13px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
      h1 { margin: 0; font-family: Georgia, serif; font-size: clamp(32px, 7vw, 48px); line-height: 1.05; }
      p { color: #57534e; font-size: 17px; line-height: 1.65; }
      .back { display: inline-block; margin-top: 10px; border-radius: 999px; background: #fff4de; padding: 8px 14px; color: #1c1917; font-size: 14px; font-weight: 700; }
    </style>
  </head>
  <body>
    <main role="main" aria-labelledby="maintenance-title">
      <p class="brand">YaarLink</p>
      <h1 id="maintenance-title">${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${backText ? `<span class="back">${escapeHtml(backText)}</span>` : ""}
    </main>
  </body>
</html>`;
  return new NextResponse(html, { status: 503, headers });
}

export async function proxy(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers);
  const requestHeaders = new Headers(request.headers);
  if (requestId) requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set("x-yaarlink-pathname", request.nextUrl.pathname);

  // Website availability is an application-level control stored in the
  // existing settings table. Admin, health, logout and static paths are
  // exempt so the owner can always sign in and turn the public site back on.
  // A settings-store failure returns the last known/online state from the
  // cached reader; normal route/database error handling remains authoritative.
  if (!isSiteAvailabilityExemptPath(request.nextUrl.pathname)) {
    try {
      const { getEffectiveSiteAvailabilityCached } = await import("@/backend/site-availability");
      const availability = await getEffectiveSiteAvailabilityCached();
      if (availability.isUnavailable) return await siteUnavailableResponse(request, availability, requestId);
    } catch {
      // If even the cached reader cannot be loaded, do not let the proxy turn
      // a deployment/database failure into a second, misleading failure mode.
    }
  }

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
