const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const YOUTUBE_HANDLE_PATTERN = /^@[A-Za-z0-9._-]{3,30}$/;
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

const INSTAGRAM_RESERVED_PATHS = new Set([
  "accounts",
  "direct",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

function cleanInput(value: unknown): string {
  let cleaned = String(value ?? "").trim();

  // People sometimes paste a Markdown link copied from another app.
  const markdownLink = cleaned.match(/^\[[^\]]*\]\(([^)\s]+)\)$/);
  if (markdownLink) cleaned = markdownLink[1];

  return cleaned.replace(/^<+|>+$/g, "").replace(/^["']|["']$/g, "").trim();
}

function parseUrl(value: string): URL | null {
  if (!value || /\s/.test(value)) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value.replace(/^\/\//, "")}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname.includes(".")) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isHost(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
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

function isValidInstagramHandle(handle: string): boolean {
  return (
    INSTAGRAM_HANDLE_PATTERN.test(handle) &&
    !handle.startsWith(".") &&
    !handle.endsWith(".") &&
    !handle.includes("..")
  );
}

export function normalizeInstagramUrl(value: unknown): string | null {
  const cleaned = cleanInput(value);
  if (!cleaned) return null;

  const bareHandle = cleaned.replace(/^@/, "");
  if (!/[/?#:]/.test(bareHandle) && isValidInstagramHandle(bareHandle)) {
    return `https://www.instagram.com/${bareHandle}/`;
  }

  const parsed = parseUrl(cleaned);
  if (!parsed) return null;
  if (!isHost(parsed.hostname, "instagram.com") && !isHost(parsed.hostname, "instagr.am")) {
    return null;
  }

  const handle = pathSegments(parsed)[0] ?? "";
  if (
    INSTAGRAM_RESERVED_PATHS.has(handle.toLowerCase()) ||
    !isValidInstagramHandle(handle)
  ) {
    return null;
  }

  // Tracking parameters such as ?igsh=… and ?dlrf=… are not needed to
  // identify the profile, so store the clean canonical profile URL.
  return `https://www.instagram.com/${handle}/`;
}

export function normalizeYouTubeUrl(value: unknown): string | null {
  const cleaned = cleanInput(value);
  if (!cleaned) return null;

  if (cleaned.startsWith("@")) {
    return YOUTUBE_HANDLE_PATTERN.test(cleaned)
      ? `https://www.youtube.com/${cleaned}`
      : null;
  }

  if (YOUTUBE_CHANNEL_ID_PATTERN.test(cleaned)) {
    return `https://www.youtube.com/channel/${cleaned}`;
  }

  if (!/[/?#:]/.test(cleaned) && YOUTUBE_HANDLE_PATTERN.test(`@${cleaned}`)) {
    return `https://www.youtube.com/@${cleaned}`;
  }

  const parsed = parseUrl(cleaned);
  if (!parsed) return null;

  if (isHost(parsed.hostname, "youtu.be")) return parsed.toString();
  if (!isHost(parsed.hostname, "youtube.com")) return null;

  const segments = pathSegments(parsed);
  const first = segments[0] ?? "";

  if (first.startsWith("@")) {
    return YOUTUBE_HANDLE_PATTERN.test(first)
      ? `https://www.youtube.com/${first}`
      : null;
  }
  if (first === "channel" && segments[1]) {
    return YOUTUBE_CHANNEL_ID_PATTERN.test(segments[1])
      ? `https://www.youtube.com/channel/${segments[1]}`
      : null;
  }
  if ((first === "c" || first === "user") && segments[1]) {
    return `https://www.youtube.com/${first}/${segments[1]}`;
  }

  // Keep other valid YouTube URLs (for example, a sample video) working as before.
  return parsed.toString();
}

export function normalizeProfileUrl(value: unknown, platform?: unknown): string | null {
  const cleaned = cleanInput(value);
  if (!cleaned) return null;

  const host = cleaned
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^\/\//, "")
    .split(/[/?#]/)[0]
    .toLowerCase();

  if (isHost(host, "instagram.com") || isHost(host, "instagr.am")) {
    return normalizeInstagramUrl(cleaned);
  }
  if (isHost(host, "youtube.com") || isHost(host, "youtu.be")) {
    return normalizeYouTubeUrl(cleaned);
  }

  // The profile-link field can receive just a handle. Use the selected main
  // platform where possible; Instagram is the form's default platform.
  if (cleaned.startsWith("@") || !/[/?#.:]/.test(cleaned)) {
    return String(platform ?? "").toLowerCase().includes("youtube")
      ? normalizeYouTubeUrl(cleaned)
      : normalizeInstagramUrl(cleaned);
  }

  return parseUrl(cleaned)?.toString() ?? null;
}
