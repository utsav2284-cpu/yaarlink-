export const SITE_AVAILABILITY_MODES = ["online", "maintenance", "emergency"] as const;

export type SiteAvailabilityMode = (typeof SITE_AVAILABILITY_MODES)[number];

export type SiteAvailabilitySettings = {
  mode: SiteAvailabilityMode;
  message: string | null;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
};

export type EffectiveSiteAvailability = {
  settings: SiteAvailabilitySettings;
  effectiveMode: SiteAvailabilityMode;
  isUnavailable: boolean;
  isScheduled: boolean;
  retryAfterSeconds: number;
};

export const DEFAULT_SITE_AVAILABILITY: SiteAvailabilitySettings = {
  mode: "online",
  message: null,
  startsAt: null,
  endsAt: null,
  updatedAt: null,
};

const MAX_AVAILABILITY_MESSAGE_LENGTH = 500;
const CONTROL_CHARACTERS = new Set(["\u0000", "\u0001", "\u0002", "\u0003", "\u0004", "\u0005", "\u0006", "\u0007", "\b", "\u000b", "\f", "\u000e", "\u000f", "\u0010", "\u0011", "\u0012", "\u0013", "\u0014", "\u0015", "\u0016", "\u0017", "\u0018", "\u0019", "\u001a", "\u001b", "\u001c", "\u001d", "\u001e", "\u001f", "\u007f"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseOptionalMessage(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const message = value.trim().replace(/\s+/g, " ");
  if (!message) return null;
  if (Array.from(message).length > MAX_AVAILABILITY_MESSAGE_LENGTH) return undefined;
  if ([...message].some((character) => CONTROL_CHARACTERS.has(character))) return undefined;
  return message;
}

/**
 * Parse the JSON value stored in the existing settings table (or the object
 * accepted by the admin API). Unknown fields are ignored so an older/newer
 * settings payload cannot smuggle arbitrary public copy or behaviour into
 * the request path; malformed values return null and callers fail safe to
 * the compiled online default for reads, or HTTP 400 for writes.
 */
export function parseSiteAvailabilitySettings(value: unknown): SiteAvailabilitySettings | null {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(candidate)) return null;

  const mode = candidate.mode;
  if (mode !== "online" && mode !== "maintenance" && mode !== "emergency") return null;

  const message = parseOptionalMessage(candidate.message);
  const startsAt = parseOptionalDate(candidate.startsAt);
  const endsAt = parseOptionalDate(candidate.endsAt);
  const updatedAt = parseOptionalDate(candidate.updatedAt);
  if (message === undefined || startsAt === undefined || endsAt === undefined || updatedAt === undefined) return null;
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return null;

  return { mode, message, startsAt, endsAt, updatedAt };
}

export function siteAvailabilitySettingsFromValue(value: string | null | undefined): SiteAvailabilitySettings {
  return value ? (parseSiteAvailabilitySettings(value) ?? DEFAULT_SITE_AVAILABILITY) : DEFAULT_SITE_AVAILABILITY;
}

export function serializeSiteAvailabilitySettings(settings: SiteAvailabilitySettings): string {
  return JSON.stringify({
    mode: settings.mode,
    message: settings.message,
    startsAt: settings.startsAt,
    endsAt: settings.endsAt,
    updatedAt: settings.updatedAt,
  });
}

/**
 * Resolve scheduled windows at request time. Keeping this pure makes the
 * transition rules unit-testable and lets the proxy cache only the stored
 * settings while still switching exactly at the configured start/end.
 */
export function effectiveSiteAvailability(
  settings: SiteAvailabilitySettings,
  now: Date = new Date(),
): EffectiveSiteAvailability {
  if (settings.mode === "online") {
    return { settings, effectiveMode: "online", isUnavailable: false, isScheduled: false, retryAfterSeconds: 300 };
  }

  const nowMs = now.getTime();
  const startsMs = settings.startsAt ? new Date(settings.startsAt).getTime() : null;
  const endsMs = settings.endsAt ? new Date(settings.endsAt).getTime() : null;

  if (startsMs !== null && nowMs < startsMs) {
    return { settings, effectiveMode: "online", isUnavailable: false, isScheduled: true, retryAfterSeconds: 300 };
  }
  if (endsMs !== null && nowMs >= endsMs) {
    return { settings, effectiveMode: "online", isUnavailable: false, isScheduled: false, retryAfterSeconds: 300 };
  }

  const retryAfterSeconds = endsMs === null
    ? 300
    : Math.min(86_400, Math.max(60, Math.ceil((endsMs - nowMs) / 1000)));

  return {
    settings,
    effectiveMode: settings.mode,
    isUnavailable: true,
    isScheduled: false,
    retryAfterSeconds,
  };
}

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Paths that must remain reachable while the public site is unavailable.
 * The admin page and admin APIs stay available so the owner can always turn
 * the site back on; those endpoints still perform their own authentication.
 * Health, CSP reporting, logout and static assets are operational/safety
 * surfaces rather than public marketplace access.
 */
export function isSiteAvailabilityExemptPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if (hasPathPrefix(pathname, "/admin")) return true;
  if (hasPathPrefix(pathname, "/api/admin")) return true;
  if (pathname === "/api/health") return true;
  if (pathname === "/api/security/csp-report") return true;
  if (pathname === "/api/auth/logout") return true;
  if (hasPathPrefix(pathname, "/_next")) return true;
  if (pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  // Generated metadata/manifest/icon files are not marketplace surfaces and
  // should not receive an HTML maintenance document with the wrong type.
  return /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|png|svg|txt|webmanifest|webp|woff2?|xml)$/i.test(pathname);
}
