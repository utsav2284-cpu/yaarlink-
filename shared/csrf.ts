/**
 * Cross-site request forgery guard for cookie-authenticated API mutations.
 *
 * Session cookies already use SameSite (user: Lax, admin: Strict), which
 * stops classic cross-site form POSTs in modern browsers. This check is the
 * second layer: for state-changing `/api` requests, a browser-supplied
 * `Origin` (or `Referer` fallback) must name this site, and a request the
 * browser itself labels `Sec-Fetch-Site: cross-site` is always refused.
 * Browsers cannot suppress or forge these headers from another origin, so
 * this blocks cross-site and same-site (e.g. hostile subdomain) forgery
 * without per-form tokens.
 *
 * Requests with neither header are non-browser clients (curl, monitoring,
 * server-to-server): they carry no ambient browser credentials to forge
 * with, so they are allowed through and remain subject to normal
 * authentication and rate limiting in the route handlers.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface MutationOriginInput {
  method: string;
  origin: string | null;
  referer: string | null;
  secFetchSite: string | null;
  /** Effective host the request was addressed to (may include a port). */
  requestHost: string | null;
  /**
   * Additional first-party hosts that may originate mutations (the canonical
   * www host and its apex). Hosts may be given with or without a port.
   */
  allowedHosts?: Iterable<string>;
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  // Proxies occasionally join repeated headers; Origin is defined as a
  // single serialized origin, so only ever trust the first token.
  const first = value.split(/[,\s]/, 1)[0]?.trim();
  return first ? first : null;
}

function hostMatches(url: URL, allowed: Iterable<string>): boolean {
  const host = url.host.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  for (const entry of allowed) {
    const normalized = entry.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === host || normalized === hostname) return true;
  }
  return false;
}

export function isAllowedMutationOrigin(input: MutationOriginInput): boolean {
  if (!MUTATING_METHODS.has(input.method.trim().toUpperCase())) return true;

  // Fetch Metadata: a browser-marked cross-site mutation is never a
  // first-party form/API call, whatever the other headers claim.
  if (firstHeaderValue(input.secFetchSite)?.toLowerCase() === "cross-site") return false;

  const candidate = firstHeaderValue(input.origin) ?? firstHeaderValue(input.referer);
  if (!candidate) return true;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    // Includes the opaque-origin serialization "null" sent by sandboxed
    // frames and some privacy modes: not a first-party page we serve.
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const allowed = new Set<string>();
  if (input.requestHost) allowed.add(input.requestHost);
  for (const host of input.allowedHosts ?? []) allowed.add(host);
  return hostMatches(url, allowed);
}
