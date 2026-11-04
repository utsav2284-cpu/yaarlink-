import { isAllowedMutationOrigin } from "@/shared/csrf";

/**
 * Route-level defense in depth for sensitive administrator mutations.
 *
 * The global proxy already applies the shared mutation-origin policy. MFA
 * and session-management routes repeat the check at their own boundary so
 * their security contract does not depend solely on routing configuration.
 * The request URL host is used rather than a client-supplied forwarded host.
 * A local server bound to 0.0.0.0/:: reports that bind address in `req.url`
 * even though the browser addressed localhost or a preview host; in that one
 * case, fall back to the connection's Host header so legitimate same-origin
 * browser mutations are not rejected before authentication.
 */
export function sameOriginMutationAllowed(req: Request): boolean {
  let requestHost: string | null = null;
  try {
    const requestUrl = new URL(req.url);
    requestHost = requestUrl.host;
    if (requestUrl.hostname === "0.0.0.0" || requestUrl.hostname === "::") {
      requestHost = req.headers.get("host")?.split(",", 1)[0]?.trim() || requestHost;
    }
  } catch {
    requestHost = null;
  }
  return isAllowedMutationOrigin({
    method: req.method,
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    requestHost,
  });
}
