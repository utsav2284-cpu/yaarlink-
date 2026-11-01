export const CATEGORIES = [
  "Food & Cafe",
  "Fashion & Lifestyle",
  "Memes & Comedy",
  "Education & Motivation",
  "Tech & Apps",
  "Travel & Local",
  "Fitness & Health",
  "Beauty & Skincare",
  "Finance & Business",
  "Music & Entertainment",
  "Punjabi Culture",
  "Other",
] as const;

export const LANGUAGES = ["English", "Hindi", "Punjabi", "Hinglish", "Bengali", "Marathi", "Tamil", "Telugu"] as const;

export const CONTENT_TYPES = ["Story", "Reel", "Post", "UGC Video", "YouTube Shorts", "YouTube Video"] as const;

export const PLATFORMS = ["Instagram", "YouTube", "Both", "Other"] as const;

export const PROMOTION_TYPES = [
  { id: "Local Business", emoji: "🏪", title: "Local Business" },
  { id: "App", emoji: "📱", title: "App" },
  { id: "Website", emoji: "🌐", title: "Website" },
  { id: "Product", emoji: "🛍️", title: "Product" },
  { id: "Creator / UGC", emoji: "🎥", title: "Creator / UGC" },
  { id: "Event", emoji: "🎟️", title: "Event" },
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Language = (typeof LANGUAGES)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type PromotionType = (typeof PROMOTION_TYPES)[number]["id"];

/*
 * Canonical stored values are the English IDs above. The alias tables also
 * accept labels produced by older clients (including the previously leaked
 * `cr.both` / `cr.otherPlat` translation keys) so reads and delayed form
 * submissions are repaired instead of persisting display text.
 */
const PLATFORM_ALIASES: Record<string, Platform> = {
  Instagram: "Instagram",
  YouTube: "YouTube",
  Both: "Both",
  "Both Instagram & YouTube": "Both",
  "Instagram & YouTube": "Both",
  "Instagram and YouTube": "Both",
  "cr.both": "Both",
  "Instagram और YouTube दोनों": "Both",
  "दोनों": "Both",
  "Instagram ਅਤੇ YouTube ਦੋਵੇਂ": "Both",
  "ਦੋਵੇਂ": "Both",
  Other: "Other",
  "Other platform": "Other",
  "cr.otherPlat": "Other",
  "कोई और प्लेटफॉर्म": "Other",
  "अन्य प्लेटफॉर्म": "Other",
  "ਹੋਰ ਪਲੇਟਫਾਰਮ": "Other",
};

const CATEGORY_ALIASES: Record<string, Category> = {
  "Food & Cafe": "Food & Cafe",
  "खाना और कैफे": "Food & Cafe",
  "ਖਾਣਾ ਅਤੇ ਕੈਫੇ": "Food & Cafe",
  "Fashion & Lifestyle": "Fashion & Lifestyle",
  Fashion: "Fashion & Lifestyle",
  "फ़ैशन और लाइफस्टाइल": "Fashion & Lifestyle",
  "फ़ैशन": "Fashion & Lifestyle",
  "ਫੈਸ਼ਨ ਅਤੇ ਲਾਈਫਸਟਾਈਲ": "Fashion & Lifestyle",
  "ਫੈਸ਼ਨ": "Fashion & Lifestyle",
  "Memes & Comedy": "Memes & Comedy",
  "मीम और कॉमेडी": "Memes & Comedy",
  "ਮੀਮ ਅਤੇ ਕਾਮੇਡੀ": "Memes & Comedy",
  "Education & Motivation": "Education & Motivation",
  Education: "Education & Motivation",
  "एजुकेशन और प्रेरणा": "Education & Motivation",
  "एजुकेशन": "Education & Motivation",
  "ਐਜੂਕੇਸ਼ਨ ਅਤੇ ਪ੍ਰੇਰਣਾ": "Education & Motivation",
  "ਐਜੂਕੇਸ਼ਨ": "Education & Motivation",
  "Tech & Apps": "Tech & Apps",
  "टेक और ऐप": "Tech & Apps",
  "ਟੈਕ ਅਤੇ ਐਪ": "Tech & Apps",
  "Travel & Local": "Travel & Local",
  Travel: "Travel & Local",
  "ट्रैवल और लोकल": "Travel & Local",
  "ट्रैवल": "Travel & Local",
  "ਟ੍ਰੈਵਲ ਅਤੇ ਲੋਕਲ": "Travel & Local",
  "ਟ੍ਰੈਵਲ": "Travel & Local",
  "Fitness & Health": "Fitness & Health",
  Health: "Fitness & Health",
  "फिटनेस और सेहत": "Fitness & Health",
  "सेहत": "Fitness & Health",
  "ਫਿਟਨੈਸ ਅਤੇ ਸਿਹਤ": "Fitness & Health",
  "ਸਿਹਤ": "Fitness & Health",
  "Beauty & Skincare": "Beauty & Skincare",
  Beauty: "Beauty & Skincare",
  "ब्यूटी और स्किनकेयर": "Beauty & Skincare",
  "ब्यूटी": "Beauty & Skincare",
  "ਬਿਊਟੀ ਅਤੇ ਸਕਿਨਕੇਅਰ": "Beauty & Skincare",
  "ਬਿਊਟੀ": "Beauty & Skincare",
  "Finance & Business": "Finance & Business",
  Money: "Finance & Business",
  "फाइनेंस और बिज़नेस": "Finance & Business",
  "पैसे": "Finance & Business",
  "ਫਾਈਨੈਂਸ ਅਤੇ ਕਾਰੋਬਾਰ": "Finance & Business",
  "ਪੈਸੇ": "Finance & Business",
  "Music & Entertainment": "Music & Entertainment",
  "म्यूज़िक और मनोरंजन": "Music & Entertainment",
  "ਮਿਊਜ਼ਿਕ ਅਤੇ ਮਨੋਰੰਜਨ": "Music & Entertainment",
  "Punjabi Culture": "Punjabi Culture",
  "पंजाबी संस्कृति": "Punjabi Culture",
  "ਪੰਜਾਬੀ ਸੱਭਿਆਚਾਰ": "Punjabi Culture",
  Other: "Other",
  "अन्य": "Other",
  "ਹੋਰ": "Other",
  "Local Services": "Other",
  "लोकल सर्विस": "Other",
  "ਲੋਕਲ ਸਰਵਿਸ": "Other",
  Home: "Other",
  "घर": "Other",
  Events: "Other",
  "इवेंट": "Other",
  "ਇਵੈਂਟ": "Other",
};

const LANGUAGE_ALIASES: Record<string, Language> = {
  English: "English",
  "अंग्रेज़ी": "English",
  "ਅੰਗਰੇਜ਼ੀ": "English",
  Hindi: "Hindi",
  "हिन्दी": "Hindi",
  "ਹਿੰਦੀ": "Hindi",
  Punjabi: "Punjabi",
  "पंजाबी": "Punjabi",
  "ਪੰਜਾਬੀ": "Punjabi",
  Hinglish: "Hinglish",
  "हिंग्लिश": "Hinglish",
  "ਹਿੰਗਲਿਸ਼": "Hinglish",
  Bengali: "Bengali",
  "बंगाली": "Bengali",
  "ਬੰਗਾਲੀ": "Bengali",
  Marathi: "Marathi",
  "मराठी": "Marathi",
  "ਮਰਾਠੀ": "Marathi",
  Tamil: "Tamil",
  "तमिल": "Tamil",
  "ਤਮਿਲ": "Tamil",
  Telugu: "Telugu",
  "तेलुगु": "Telugu",
  "ਤੇਲਗੂ": "Telugu",
};

const CONTENT_TYPE_ALIASES: Record<string, ContentType> = {
  Story: "Story",
  "स्टोरी": "Story",
  "ਸਟੋਰੀ": "Story",
  Reel: "Reel",
  "रील": "Reel",
  "ਰੀਲ": "Reel",
  Post: "Post",
  "पोस्ट": "Post",
  "ਪੋਸਟ": "Post",
  "UGC Video": "UGC Video",
  "UGC वीडियो": "UGC Video",
  "UGC ਵੀਡੀਓ": "UGC Video",
  "YouTube Shorts": "YouTube Shorts",
  "YouTube Short": "YouTube Shorts",
  "YouTube शॉर्ट": "YouTube Shorts",
  "YouTube ਸ਼ਾਰਟ": "YouTube Shorts",
  "YouTube Video": "YouTube Video",
  "YouTube वीडियो": "YouTube Video",
  "YouTube ਵੀਡੀਓ": "YouTube Video",
};

const PROMOTION_TYPE_ALIASES: Record<string, PromotionType> = {
  "Local Business": "Local Business",
  "लोकल बिज़नेस": "Local Business",
  "ਲੋਕਲ ਕਾਰੋਬਾਰ": "Local Business",
  App: "App",
  "ऐप": "App",
  "ਐਪ": "App",
  Website: "Website",
  "वेबसाइट": "Website",
  "ਵੈੱਬਸਾਈਟ": "Website",
  Product: "Product",
  "प्रोडक्ट": "Product",
  "ਪ੍ਰੋਡਕਟ": "Product",
  "Creator / UGC": "Creator / UGC",
  "क्रिएटर / UGC": "Creator / UGC",
  "ਕ੍ਰਿਏਟਰ / UGC": "Creator / UGC",
  Event: "Event",
  "इवेंट": "Event",
  "ਇਵੈਂਟ": "Event",
};

function normalizeFromAliases<T extends string>(value: unknown, aliases: Record<string, T>): T | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (aliases[cleaned]) return aliases[cleaned];

  const lower = cleaned.toLocaleLowerCase("en-US");
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (alias.toLocaleLowerCase("en-US") === lower) return canonical;
  }
  return null;
}

export function normalizePlatform(value: unknown): Platform | null {
  return normalizeFromAliases(value, PLATFORM_ALIASES);
}

export function normalizeCategory(value: unknown): Category | null {
  return normalizeFromAliases(value, CATEGORY_ALIASES);
}

export function normalizeLanguage(value: unknown): Language | null {
  return normalizeFromAliases(value, LANGUAGE_ALIASES);
}

export function normalizeContentType(value: unknown): ContentType | null {
  return normalizeFromAliases(value, CONTENT_TYPE_ALIASES);
}

export function normalizePromotionType(value: unknown): PromotionType | null {
  return normalizeFromAliases(value, PROMOTION_TYPE_ALIASES);
}

function listItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => listItems(item));
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (value == null) return [];
  const item = String(value).trim();
  return item ? [item] : [];
}

function normalizeList(value: unknown, normalize: (item: unknown) => string | null, keepUnknown: boolean): string[] | null {
  const normalizedItems: string[] = [];
  for (const item of listItems(value)) {
    const normalized = normalize(item);
    if (!normalized) {
      if (!keepUnknown) return null;
      normalizedItems.push(item);
      continue;
    }
    normalizedItems.push(normalized);
  }
  return [...new Set(normalizedItems)];
}

/** Canonicalize an array/comma-separated language list. */
export function normalizeLanguageList(value: unknown, keepUnknown = false): string[] | null {
  return normalizeList(value, normalizeLanguage, keepUnknown);
}

/** Canonicalize an array/comma-separated content-type list. */
export function normalizeContentTypeList(value: unknown, keepUnknown = false): string[] | null {
  return normalizeList(value, normalizeContentType, keepUnknown);
}

/** One canonical campaign-budget range for the API, DB check and every form. */
export const CAMPAIGN_BUDGET_MIN = 500;
export const CAMPAIGN_BUDGET_MAX = 10_000_000;

/** Creator list bounds; joined lengths are the exact all-values maxima. */
export const MAX_CREATOR_LANGUAGES = LANGUAGES.length;
export const MAX_CREATOR_CONTENT_TYPES = CONTENT_TYPES.length;
export const MAX_CREATOR_LANGUAGES_JOINED_LENGTH = LANGUAGES.join(", ").length;
export const MAX_CREATOR_CONTENT_TYPES_JOINED_LENGTH = CONTENT_TYPES.join(", ").length;

export function formatINR(n: number, locale = "en-IN") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

/** Public-listing review states. Only approved/open + verified rows are public. */
export const CREATOR_REVIEW_STATUSES = ["incomplete", "pending", "approved", "rejected", "suspended"] as const;
export const CAMPAIGN_REVIEW_STATUSES = ["pending", "open", "paused", "rejected", "suspended", "closed"] as const;
export const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "failed"] as const;

/** Marketplace application lifecycle, from first application through completion. */
export const APPLICATION_STATUSES = ["applied", "shortlisted", "rejected", "hired", "completed", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Structured in-app notification events; display copy is localized in the UI. */
export const NOTIFICATION_KINDS = ["application_received", "application_withdrawn", "application_status"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Canonical report reasons stored in the DB; UI labels come from i18n. */
export const REPORT_REASONS = ["impersonation", "scam", "spam", "incorrect-info", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = "campaign" | "creator";
