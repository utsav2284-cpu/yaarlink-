export const DEFAULT_RETURN_TO = "/dashboard";

const MAX_RETURN_TO_LENGTH = 1024;
const BLOCKED_RETURN_PREFIXES = [
  "/api",
  "/_next",
  "/admin",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-account-email",
] as const;

function hasUnsafeCharacters(value: string) {
  return /[\s\\]/.test(value) || /[\u0000-\u001f\u007f]/.test(value);
}

function hasBlockedPrefix(pathname: string) {
  return BLOCKED_RETURN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Return destinations are deliberately limited to ordinary same-site page
 * paths. This rejects absolute and protocol-relative URLs, backslash tricks,
 * API/admin destinations, and auth-page loops before the value is used in a
 * link, email, redirect, or client navigation.
 */
export function safeReturnTo(value: unknown, fallback: string = DEFAULT_RETURN_TO): string {
  if (typeof value !== "string") return fallback;

  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_RETURN_TO_LENGTH || hasUnsafeCharacters(candidate)) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  // Decode repeatedly so values such as /%252f%252fexample.com cannot hide a
  // protocol-relative or backslash destination behind one encoding layer.
  let decoded = candidate;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return fallback;
    }
    if (hasUnsafeCharacters(decoded) || !decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://yaarlink.internal");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "https://yaarlink.internal" || hasBlockedPrefix(parsed.pathname)) return fallback;

  // Also inspect the decoded pathname so encodings such as /%61dmin or
  // /admin%2fusers cannot smuggle a blocked route past the literal check.
  let decodedPathname = parsed.pathname;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decodedPathname);
      if (next === decodedPathname) break;
      decodedPathname = next;
    } catch {
      return fallback;
    }
  }
  if (hasUnsafeCharacters(decodedPathname) || decodedPathname.startsWith("//") || hasBlockedPrefix(decodedPathname)) return fallback;

  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return normalized.length <= MAX_RETURN_TO_LENGTH ? normalized : fallback;
}

export function buildPathWithReturnTo(pathname: string, returnTo: unknown, fallback: string = DEFAULT_RETURN_TO): string {
  const destination = safeReturnTo(returnTo, fallback);
  if (!destination || destination === DEFAULT_RETURN_TO) return pathname;
  const params = new URLSearchParams({ returnTo: destination });
  return `${pathname}?${params.toString()}`;
}

export function buildAuthPath(
  pathname: "/login" | "/signup" | "/forgot-password",
  options: { returnTo?: unknown; role?: unknown } = {},
): string {
  const params = new URLSearchParams();
  const destination = safeReturnTo(options.returnTo, "");
  if (destination && destination !== DEFAULT_RETURN_TO) params.set("returnTo", destination);
  if (options.role === "brand" || options.role === "creator") {
    params.set("role", options.role);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
