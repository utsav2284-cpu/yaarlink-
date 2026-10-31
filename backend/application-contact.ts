import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/backend/social-url";

export type ApplicationContactKind = "email" | "phone" | "instagram" | "youtube" | "profile";

export type ApplicationContactOption = {
  kind: ApplicationContactKind;
  /** Canonical value stored on the application and shown to the brand. */
  value: string;
  /** Normalized aliases that identify this same account/profile contact. */
  keys: string[];
};

type AccountContactSource = {
  email?: string | null;
  phone?: string | null;
};

type CreatorProfileContactSource = AccountContactSource & {
  name?: string | null;
  status?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  profileUrl?: string | null;
  platform?: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPLETED_CREATOR_STATUSES = new Set(["pending", "approved", "rejected", "suspended"]);

function cleanContactInput(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function emailIdentity(value: unknown): { key: string; value: string } | null {
  const email = cleanContactInput(value).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return null;
  return { key: `email:${email}`, value: email };
}

function phoneDigitsFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    const host = parsed.hostname.toLowerCase();
    if (host === "wa.me") return parsed.pathname.replace(/\D/g, "") || null;
    if (host === "api.whatsapp.com" || host === "www.whatsapp.com" || host === "whatsapp.com") {
      const phone = parsed.searchParams.get("phone") ?? parsed.pathname;
      return phone.replace(/\D/g, "") || null;
    }
  } catch {
    return null;
  }
  return null;
}

function phoneIdentity(value: unknown): { value: string; keys: string[] } | null {
  const cleaned = cleanContactInput(value);
  if (!cleaned) return null;

  let digits = phoneDigitsFromUrl(cleaned);
  if (!digits) {
    const phoneText = cleaned.toLowerCase().startsWith("tel:") ? cleaned.slice(4) : cleaned;
    // Do not extract a phone number from arbitrary prose: the complete input
    // must look like a phone number (or be a WhatsApp link handled above).
    if (!/^[+()\-.\s\d]+$/.test(phoneText)) return null;
    digits = phoneText.replace(/\D/g, "");
  }
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7 || digits.length > 15) return null;

  let national = "";
  if (digits.length === 12 && digits.startsWith("91")) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1);
  else if (digits.length === 10) national = digits;

  if (national) {
    return {
      value: `+91 ${national}`,
      keys: unique([
        `phone:in:${national}`,
        `phone:digits:${digits}`,
        `phone:digits:91${national}`,
        `phone:digits:0${national}`,
      ]),
    };
  }

  return {
    value: `+${digits}`,
    keys: [`phone:intl:${digits}`, `phone:digits:${digits}`],
  };
}

function cleanUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.protocol = "https:";
    parsed.hostname = parsed.hostname.toLowerCase();
    // Drop tracking/session query data, but preserve an `id` parameter:
    // it is the actual identity in profile URLs such as
    // facebook.com/profile.php?id=123.
    const profileId = parsed.searchParams.get("id");
    parsed.search = profileId ? `?id=${encodeURIComponent(profileId)}` : "";
    parsed.hash = "";
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
  } catch {
    return value;
  }
}

function candidateHost(value: string): string | null {
  if (!value.includes(".") && !value.includes("://")) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function instagramIdentity(value: unknown): { key: string; value: string } | null {
  const cleaned = cleanContactInput(value);
  const host = candidateHost(cleaned);
  if (host && host !== "instagram.com" && host !== "www.instagram.com") return null;
  const canonical = normalizeInstagramUrl(cleaned);
  if (!canonical) return null;
  try {
    const handle = new URL(canonical).pathname.split("/").filter(Boolean)[0];
    if (!handle) return null;
    // Post/reel/story URLs are content links, not an identifiable profile
    // contact. In particular, never key them only by `/p/` or `/reel/`.
    if (["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"].includes(handle.toLowerCase())) return null;
    return { key: `instagram:${handle.toLowerCase()}`, value: canonical };
  } catch {
    return null;
  }
}

function youtubeIdentity(value: unknown): { key: string; value: string } | null {
  const cleaned = cleanContactInput(value);
  const host = candidateHost(cleaned);
  if (host && !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return null;
  const canonical = normalizeYouTubeUrl(cleaned);
  if (!canonical) return null;
  const cleanedUrl = cleanUrl(canonical);
  try {
    const parsed = new URL(cleanedUrl);
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean);
    // Video/short links (including youtu.be and /watch) are content links,
    // not channel contacts. Never key them by a query-stripped `/watch` path.
    if (host === "youtu.be") return null;
    if (segments[0]?.startsWith("@")) {
      return { key: `youtube:${segments[0].toLowerCase()}`, value: cleanedUrl };
    }
    if (["channel", "c", "user"].includes(segments[0]?.toLowerCase() ?? "") && segments[1]) {
      return { key: `youtube:${segments[0].toLowerCase()}:${segments[1].toLowerCase()}`, value: cleanedUrl };
    }
    if (/^UC[\w-]{20,}$/.test(segments[0] ?? "")) {
      return {
        key: `youtube:channel:${segments[0].toLowerCase()}`,
        value: `https://www.youtube.com/channel/${segments[0]}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function profileIdentity(value: unknown, platform?: string | null): { key: string; value: string } | null {
  const canonical = normalizeProfileUrl(cleanContactInput(value), platform);
  if (!canonical) return null;

  const host = candidateHost(canonical);
  if (host === "instagram.com" || host === "www.instagram.com") return instagramIdentity(canonical);
  if (host && ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return youtubeIdentity(canonical);

  const instagram = instagramIdentity(canonical);
  if (instagram) return instagram;
  const youtube = youtubeIdentity(canonical);
  if (youtube) return youtube;

  const cleaned = cleanUrl(canonical);
  try {
    const parsed = new URL(cleaned);
    return {
      key: `profile:${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase().replace(/\/$/, "")}${parsed.search.toLowerCase()}`,
      value: cleaned,
    };
  } catch {
    return null;
  }
}

/**
 * Returns every normalized identity an input could represent. A bare handle
 * intentionally produces both Instagram and YouTube keys; ownership matching
 * decides which saved profile field it belongs to.
 */
export function applicationContactKeys(value: unknown, platform?: string | null): string[] {
  const cleaned = cleanContactInput(value);
  if (!cleaned || cleaned.length > 240) return [];

  const email = emailIdentity(cleaned);
  if (email) return [email.key];
  const phone = phoneIdentity(cleaned);
  if (phone) return phone.keys;
  const instagram = instagramIdentity(cleaned);
  const youtube = youtubeIdentity(cleaned);
  const profile = profileIdentity(cleaned, platform);

  return unique([
    instagram?.key,
    youtube?.key,
    profile?.key,
  ]);
}

function makeOption(
  kind: ApplicationContactKind,
  identity: { key?: string; keys?: string[]; value: string } | null,
  platform?: string | null,
): ApplicationContactOption | null {
  if (!identity) return null;
  return {
    kind,
    value: identity.value,
    keys: unique([identity.key, ...(identity.keys ?? []), ...applicationContactKeys(identity.value, platform)]),
  };
}

export function isCompletedCreatorProfile(
  profile: CreatorProfileContactSource | null | undefined,
): profile is CreatorProfileContactSource & { name: string } {
  if (!profile) return false;
  const status = typeof profile.status === "string" ? profile.status.trim().toLowerCase() : "";
  if (!COMPLETED_CREATOR_STATUSES.has(status)) return false;
  if (typeof profile.name !== "string" || !profile.name.trim()) return false;

  // Match the creator-profile parser's completion gate: a completed (but
  // not necessarily approved) profile has a name and at least one valid
  // social/profile link. Contact-grade identity is stricter and is enforced
  // separately by resolveApplicationContact.
  return Boolean(
    normalizeInstagramUrl(profile.instagram) ??
      normalizeYouTubeUrl(profile.youtube) ??
      normalizeProfileUrl(profile.profileUrl, profile.platform),
  );
}

/** Contacts that belong to this signed-in account or its creator profile. */
export function applicationContactOptions(
  account: AccountContactSource | null | undefined,
  profile: CreatorProfileContactSource | null | undefined,
): ApplicationContactOption[] {
  const platform = profile?.platform;
  const candidates: Array<ApplicationContactOption | null> = [
    makeOption("phone", phoneIdentity(profile?.phone), platform),
    makeOption("email", emailIdentity(profile?.email), platform),
    makeOption("instagram", instagramIdentity(profile?.instagram), platform),
    makeOption("youtube", youtubeIdentity(profile?.youtube), platform),
    makeOption("profile", profileIdentity(profile?.profileUrl, platform), platform),
    makeOption("phone", phoneIdentity(account?.phone), platform),
    makeOption("email", emailIdentity(account?.email), platform),
  ];

  const options: ApplicationContactOption[] = [];
  const seenKeys = new Set<string>();
  const seenValues = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const valueKey = candidate.value.toLowerCase();
    if (seenValues.has(valueKey) || candidate.keys.some((key) => seenKeys.has(key))) continue;
    options.push(candidate);
    seenValues.add(valueKey);
    candidate.keys.forEach((key) => seenKeys.add(key));
  }
  return options;
}

/**
 * Resolves free-form input to the canonical saved contact it matches. Returns
 * null for every contact that is not already on the account/creator profile,
 * without consulting any other applicant's application.
 */
export function resolveApplicationContact(
  input: unknown,
  account: AccountContactSource | null | undefined,
  profile: CreatorProfileContactSource | null | undefined,
): ApplicationContactOption | null {
  const inputKeys = new Set(applicationContactKeys(input, profile?.platform));
  if (!inputKeys.size) return null;
  return applicationContactOptions(account, profile).find((option) =>
    option.keys.some((key) => inputKeys.has(key)),
  ) ?? null;
}

export function sameApplicationContact(left: unknown, right: unknown): boolean {
  const rightKeys = new Set(applicationContactKeys(right));
  return applicationContactKeys(left).some((key) => rightKeys.has(key));
}
