import { normalizePlatform } from "./constants";

/**
 * Maximum lengths of the exact URL values this module returns.
 *
 * Length is enforced after normalization, by returning `null`, so callers
 * never need to slice a normalized URL down to a field limit afterwards.
 * The route parsers import these same constants instead of maintaining a
 * second, subtly different set of limits.
 */
export const MAX_INSTAGRAM_URL_LENGTH = 160;
export const MAX_YOUTUBE_URL_LENGTH = 160;
export const MAX_PROFILE_URL_LENGTH = 200;
export const MAX_WEBSITE_URL_LENGTH = MAX_PROFILE_URL_LENGTH;

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

const YOUTUBE_SHORT_LINK_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

/*
 * Instagram routes and namespaces whose first path segment is not a profile.
 * This is deliberately wider than the original eight-item list: Instagram
 * has many top-level app, account, discovery, legal, API and content routes
 * that share the same URL level as usernames.
 */
const INSTAGRAM_RESERVED_PATHS = new Set([
  "about",
  "accounts",
  "admin",
  "ads",
  "ajax",
  "api",
  "app",
  "apps",
  "ar",
  "assets",
  "audio",
  "auth",
  "call",
  "calls",
  "camera",
  "challenge",
  "channel",
  "channels",
  "checkout",
  "checkpoint",
  "confirm_email",
  "copyright",
  "create",
  "developer",
  "developers",
  "direct",
  "directory",
  "discover",
  "download",
  "effects",
  "emails",
  "embed",
  "embeds",
  "explore",
  "getapp",
  "graphql",
  "graphql_www",
  "guide",
  "guides",
  "hashtag",
  "hashtags",
  "help",
  "igtv",
  "inbox",
  "insights",
  "invite",
  "invites",
  "jobs",
  "join",
  "lite",
  "live",
  "location",
  "locations",
  "login",
  "logout",
  "media",
  "messages",
  "monetization",
  "music",
  "nametag",
  "notifications",
  "oauth",
  "oembed",
  "orders",
  "original_audio",
  "p",
  "password",
  "payments",
  "policies",
  "policy",
  "popular",
  "press",
  "privacy",
  "professional",
  "professionals",
  "publicapi",
  "qr",
  "query",
  "reel",
  "reels",
  "register",
  "report",
  "rooms",
  "s",
  "saved",
  "search",
  "session",
  "share",
  "signup",
  "sitemap",
  "static",
  "stories",
  "support",
  "tag",
  "tags",
  "terms",
  "trending",
  "tv",
  "two_factor",
  "upload",
  "web",
  "your_activity",
]);

const INSTAGRAM_RESERVED_FILES = new Set([
  "apple-touch-icon.png",
  "browserconfig.xml",
  "embed.js",
  "embeds.js",
  "favicon.ico",
  "favicon.png",
  "favicon.svg",
  "manifest.json",
  "robots.txt",
  "service-worker.js",
  "sitemap.xml",
  "sitemap.xml.gz",
  "sw.js",
]);

/*
 * A small number of names are both usable profile roots (for example the
 * real @legal, @places and @settings profiles) and Instagram namespaces
 * below that root (/legal/privacy/, /places/c/…, /security/csp_report/).
 * For those names only a non-profile subpath is reserved, so the profile
 * itself keeps working without letting a system page masquerade as one.
 */
const INSTAGRAM_RESERVED_ROUTE_PREFIXES = new Set([
  "data",
  "legal",
  "places",
  "security",
  "settings",
]);

const INSTAGRAM_PROFILE_SUBPATHS = new Set([
  "channel",
  "followers",
  "following",
  "guide",
  "guides",
  "live",
  "p",
  "posts",
  "reel",
  "reels",
  "saved",
  "tagged",
  "threads",
  "tv",
]);

const NON_PUBLIC_HOST_SUFFIXES = new Set([
  "alt",
  "corp",
  "example",
  "home",
  "internal",
  "intranet",
  "invalid",
  "lan",
  "local",
  "localdomain",
  "localhost",
  "onion",
  "test",
]);

function cleanInput(value: unknown): string {
  if (typeof value !== "string") return "";

  let cleaned = value.trim();

  // People sometimes paste a Markdown link copied from another app.
  const markdownLink = cleaned.match(/^\[[^\]]*\]\(([^)\s]+)\)$/);
  if (markdownLink) cleaned = markdownLink[1];

  return cleaned.replace(/^<+|>+$/g, "").replace(/^[\"']|[\"']$/g, "").trim();
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function ipv4Parts(hostname: string): number[] | null {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isPublicIpv4(parts: number[]): boolean {
  const [a, b, c] = parts;

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // shared/CGNAT space
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 31 && c === 196) return false;
  if (a === 192 && b === 52 && c === 193) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 175 && c === 48) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation

  return true;
}

function ipv6Groups(hostname: string): number[] | null {
  const host = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (!host || host.includes("%") || host.split("::").length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const groups: number[] = [];
    for (const token of side.split(":")) {
      if (!token) return null;
      if (token.includes(".")) {
        const ipv4 = ipv4Parts(token);
        if (!ipv4) return null;
        groups.push((ipv4[0] << 8) + ipv4[1], (ipv4[2] << 8) + ipv4[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(token)) return null;
      groups.push(Number.parseInt(token, 16));
    }
    return groups;
  };

  if (!host.includes("::")) {
    const groups = parseSide(host);
    return groups?.length === 8 ? groups : null;
  }

  const [left, right] = host.split("::");
  const leftGroups = parseSide(left);
  const rightGroups = parseSide(right);
  if (!leftGroups || !rightGroups || leftGroups.length + rightGroups.length > 7) return null;

  return [
    ...leftGroups,
    ...Array.from({ length: 8 - leftGroups.length - rightGroups.length }, () => 0),
    ...rightGroups,
  ];
}

function isPublicIpv6(groups: number[]): boolean {
  // IPv4-mapped addresses take the public/private status of the IPv4 part.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPublicIpv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  }

  // ::/96 is deprecated IPv4-compatible space and also contains :: and ::1.
  if (groups.slice(0, 6).every((group) => group === 0)) return false;
  if ((groups[0] & 0xfe00) === 0xfc00) return false; // unique-local
  if ((groups[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((groups[0] & 0xff00) === 0xff00) return false; // multicast
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) return false; // NAT64
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return false;
  if (groups[0] === 0x2001 && groups[1] === 0) return false; // Teredo
  if (groups[0] === 0x2001 && groups[1] === 0x0002 && groups[2] === 0) return false;
  if (groups[0] === 0x2001 && ((groups[1] & 0xfff0) === 0x0010 || (groups[1] & 0xfff0) === 0x0020)) return false;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false; // documentation
  if (groups[0] === 0x2002) return false; // 6to4
  if (groups[0] === 0x3fff && (groups[1] & 0xf000) === 0) return false; // documentation
  if (groups[0] === 0x5f00) return false; // segment-routing SIDs

  // Current global unicast space is 2000::/3.
  return (groups[0] & 0xe000) === 0x2000;
}

function embeddedIpv4IsNonPublic(labels: string[]): boolean {
  // Wildcard-DNS hostnames such as 127.0.0.1.nip.io or 127-0-0-1.sslip.io
  // encode a literal address in their labels. That is still an IP
  // destination for the purposes of a stored, user-facing link, even though
  // resolving arbitrary DNS names is outside this module's scope.
  for (let index = 0; index + 6 <= labels.length; index += 1) {
    const dotted = ipv4Parts(labels.slice(index, index + 4).join("."));
    if (dotted && !isPublicIpv4(dotted)) return true;
  }

  for (const label of labels.slice(0, -2)) {
    const hyphenated = label.match(/^(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})$/);
    if (!hyphenated) continue;
    const parts = hyphenated.slice(1).map(Number);
    if (parts.every((part) => part >= 0 && part <= 255) && !isPublicIpv4(parts)) return true;
  }

  return false;
}

function isPublicHostname(rawHostname: string): boolean {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname || hostname.length > 253) return false;

  if (hostname.startsWith("[") || hostname.includes(":")) {
    const groups = ipv6Groups(hostname);
    return groups ? isPublicIpv6(groups) : false;
  }

  const ipv4 = ipv4Parts(hostname);
  if (ipv4) return isPublicIpv4(ipv4);

  if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;

  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  if (
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9-]+$/.test(label) ||
        label.startsWith("-") ||
        label.endsWith("-"),
    )
  ) {
    return false;
  }

  const topLevel = labels[labels.length - 1];
  if (topLevel.length < 2 || /^\d+$/.test(topLevel) || NON_PUBLIC_HOST_SUFFIXES.has(topLevel)) {
    return false;
  }

  return !embeddedIpv4IsNonPublic(labels);
}

function parsePublicUrl(value: string): URL | null {
  if (!value || /\s/.test(value)) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value.replace(/^\/\//, "")}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!isPublicHostname(parsed.hostname)) return null;

    // Store one canonical host spelling; a fully-qualified trailing dot
    // names the same public host but otherwise makes equal links differ.
    parsed.hostname = normalizeHostname(parsed.hostname);
    return parsed;
  } catch {
    return null;
  }
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

function withinLength(url: string, maxLength: number): string | null {
  return url.length <= maxLength ? url : null;
}

export function isInstagramHostname(hostname: string): boolean {
  return INSTAGRAM_HOSTS.has(normalizeHostname(hostname));
}

export function isYouTubeHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return YOUTUBE_HOSTS.has(host) || YOUTUBE_SHORT_LINK_HOSTS.has(host);
}

/** True only for an http(s) URL whose literal host is a public destination. */
export function isPublicHttpUrl(value: unknown): boolean {
  const cleaned = cleanInput(value);
  return Boolean(cleaned && parsePublicUrl(cleaned));
}

function isValidInstagramHandle(handle: string): boolean {
  return (
    INSTAGRAM_HANDLE_PATTERN.test(handle) &&
    !handle.startsWith(".") &&
    !handle.endsWith(".") &&
    !handle.includes("..") &&
    !INSTAGRAM_RESERVED_PATHS.has(handle.toLowerCase()) &&
    !INSTAGRAM_RESERVED_FILES.has(handle.toLowerCase())
  );
}

function isReservedInstagramRoute(segments: string[]): boolean {
  const first = (segments[0] ?? "").toLowerCase();
  const second = (segments[1] ?? "").toLowerCase();

  if (!first) return true;
  if (INSTAGRAM_RESERVED_PATHS.has(first) || INSTAGRAM_RESERVED_FILES.has(first)) return true;

  // Locale-prefixed embed scripts (for example /en_US/embeds.js) are not a
  // profile named after the locale.
  if (second && INSTAGRAM_RESERVED_FILES.has(second) && /^[a-z]{2}(?:_[a-z]{2})?$/i.test(first)) {
    return true;
  }

  return Boolean(
    second &&
      INSTAGRAM_RESERVED_ROUTE_PREFIXES.has(first) &&
      !INSTAGRAM_PROFILE_SUBPATHS.has(second),
  );
}

function instagramFromHandle(handle: string): string | null {
  if (!isValidInstagramHandle(handle)) return null;
  return withinLength(`https://www.instagram.com/${handle}/`, MAX_INSTAGRAM_URL_LENGTH);
}

function instagramFromUrl(parsed: URL): string | null {
  if (!isInstagramHostname(parsed.hostname)) return null;

  const segments = pathSegments(parsed);
  if (isReservedInstagramRoute(segments)) return null;

  // Tracking parameters such as ?igsh=… are not needed to identify the
  // profile, so store the clean canonical profile URL.
  return instagramFromHandle(segments[0] ?? "");
}

export function normalizeInstagramUrl(value: unknown): string | null {
  const cleaned = cleanInput(value);
  if (!cleaned) return null;

  const bareHandle = cleaned.replace(/^@/, "");
  if (!/[/?#:]/.test(bareHandle)) return instagramFromHandle(bareHandle);

  const parsed = parsePublicUrl(cleaned);
  return parsed ? instagramFromUrl(parsed) : null;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isValidYouTubeHandle(handle: string): boolean {
  if (!handle.startsWith("@")) return false;

  const body = handle.slice(1);
  const characters = Array.from(body);
  if (characters.length < 1 || characters.length > 30) return false;
  if (/^[\x00-\x7f]+$/.test(body) && characters.length < 3) return false;
  // Include combining marks so valid Hindi/Punjabi and other Indic-script
  // handles are not rejected merely because their vowel signs are marks,
  // rather than standalone letters. The first character still cannot be one.
  if (!/^[\p{L}\p{M}\p{N}._\-·]+$/u.test(body)) return false;
  if (!/^[\p{L}\p{N}]/u.test(body) || !/[\p{L}\p{M}\p{N}]$/u.test(body)) return false;
  if (body.includes("..")) return false;

  // YouTube handles must contain a letter; a digits-only string is not one.
  return /\p{L}/u.test(body);
}

function youtubeHandleUrl(handle: string): string | null {
  if (!isValidYouTubeHandle(handle)) return null;
  return withinLength(
    `https://www.youtube.com/@${encodeURIComponent(handle.slice(1))}`,
    MAX_YOUTUBE_URL_LENGTH,
  );
}

function isValidYouTubeLegacyName(name: string): boolean {
  const length = codePointLength(name);
  if (length < 1 || length > 100) return false;
  if (!/^[\p{L}\p{M}\p{N}._\-·']+$/u.test(name)) return false;
  return /^[\p{L}\p{N}]/u.test(name) && /[\p{L}\p{M}\p{N}]$/u.test(name) && !name.includes("..");
}

function youtubeFromUrl(parsed: URL): string | null {
  const host = normalizeHostname(parsed.hostname);

  // youtu.be is a video short-link host. Neither its root nor a video ID
  // identifies a channel profile.
  if (YOUTUBE_SHORT_LINK_HOSTS.has(host)) return null;
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const segments = pathSegments(parsed);
  const first = segments[0] ?? "";
  if (!first) return null;

  if (first.startsWith("@")) return youtubeHandleUrl(first);

  const route = first.toLowerCase();
  const identifier = segments[1] ?? "";

  if (route === "channel") {
    return YOUTUBE_CHANNEL_ID_PATTERN.test(identifier)
      ? withinLength(`https://www.youtube.com/channel/${identifier}`, MAX_YOUTUBE_URL_LENGTH)
      : null;
  }

  if (route === "c" || route === "user") {
    if (!isValidYouTubeLegacyName(identifier)) return null;
    return withinLength(
      `https://www.youtube.com/${route}/${encodeURIComponent(identifier)}`,
      MAX_YOUTUBE_URL_LENGTH,
    );
  }

  // Everything else on youtube.com — the homepage, /results, /watch,
  // /shorts, /feed/…, playlists, clips and site pages — is not a channel
  // profile, even when it is an otherwise valid public YouTube URL.
  return null;
}

export function normalizeYouTubeUrl(value: unknown): string | null {
  const cleaned = cleanInput(value);
  if (!cleaned) return null;

  if (cleaned.startsWith("@")) return youtubeHandleUrl(cleaned);

  if (YOUTUBE_CHANNEL_ID_PATTERN.test(cleaned)) {
    return withinLength(`https://www.youtube.com/channel/${cleaned}`, MAX_YOUTUBE_URL_LENGTH);
  }

  if (!/[/?#:]/.test(cleaned)) return youtubeHandleUrl(`@${cleaned}`);

  const parsed = parsePublicUrl(cleaned);
  return parsed ? youtubeFromUrl(parsed) : null;
}

function bareHandleForPlatform(cleaned: string, platform?: unknown): string | null {
  const canonicalPlatform = normalizePlatform(platform);

  if (canonicalPlatform === "YouTube") return normalizeYouTubeUrl(cleaned);
  if (canonicalPlatform === "Instagram" || canonicalPlatform === "Both") {
    // "Both" includes Instagram. The dedicated Instagram/YouTube fields
    // remain available when the creator needs to disambiguate the link.
    return normalizeInstagramUrl(cleaned);
  }
  if (canonicalPlatform === "Other") return null;

  // Preserve the historical no-platform default used by the brand website
  // field, which explicitly asks for a website or Instagram link. Any other
  // non-empty platform value is explicit, so do not guess Instagram for it.
  if (platform == null || (typeof platform === "string" && !platform.trim())) {
    return normalizeInstagramUrl(cleaned);
  }
  return null;
}

export function normalizeProfileUrl(value: unknown, platform?: unknown): string | null {
  const cleaned = cleanInput(value);
  if (!cleaned) return null;

  // The profile-link field can receive just a handle. Only an Instagram or
  // YouTube platform can turn that handle into a profile URL; in
  // particular, an "@handle" supplied for platform "Other" stays invalid
  // instead of being silently converted into an Instagram profile.
  if (cleaned.startsWith("@") || !/[/?#:.\s]/.test(cleaned)) {
    return bareHandleForPlatform(cleaned, platform);
  }

  const parsed = parsePublicUrl(cleaned);
  if (!parsed) return null;

  if (isInstagramHostname(parsed.hostname)) return instagramFromUrl(parsed);
  if (isYouTubeHostname(parsed.hostname)) return youtubeFromUrl(parsed);

  return withinLength(parsed.toString(), MAX_PROFILE_URL_LENGTH);
}
