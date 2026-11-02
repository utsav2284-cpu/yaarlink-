/**
 * YaarLink site settings — EDIT THIS FILE to change your public contact details.
 * The Contact page and footer read from here.
 *
 * `SITE_ORIGIN` is the single source of truth for the public web address:
 * `SITE.url`, `SITE.host` and the apex `SITE.domain` are all derived from it,
 * so the three can never drift apart.
 */
const SITE_ORIGIN = "https://www.theyaar.com";

const siteUrl = new URL(SITE_ORIGIN);
const siteHost = siteUrl.hostname.toLowerCase();
const siteDomain = siteHost.startsWith("www.") ? siteHost.slice("www.".length) : siteHost;

export interface SiteConfig {
  name: string;
  domain: string;
  host: string;
  url: string;
  whatsappNumber: string;
  phoneDisplay: string;
  hours: string;
  email: string;
  instagram: string;
  city: string;
}

export const SITE: SiteConfig = {
  name: "YaarLink",

  // Brand domain shown in copy. The apex redirects to the canonical www host,
  // so absolute links and metadata must use `url`, not the apex.
  domain: siteDomain,
  host: siteHost,
  url: siteUrl.origin,

  // WhatsApp / phone in international format, digits only (91 = India).
  whatsappNumber: "919153907403",

  // How the number is shown to visitors.
  phoneDisplay: "+91 91539 07403",

  // Hours shown next to the phone number.
  hours: "Mon–Sat, 10am–8pm",

  email: "yaarlink0@gmail.com",

  // Instagram username without the @.
  instagram: "yaarlink",

  city: "Punjab, India",
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/*                                                                     */
/* `validateSiteConfig` returns field/code pairs only — never the      */
/* offending values — so it is safe to log at startup (see            */
/* instrumentation.ts). Link builders below use the same helpers and   */
/* return "" for a malformed value instead of a silently broken link.  */
/* ------------------------------------------------------------------ */

export type SiteConfigIssueCode =
  | "required"
  | "invalid_url"
  | "insecure_url"
  | "url_not_origin"
  | "url_host_mismatch"
  | "url_domain_mismatch"
  | "invalid_host"
  | "invalid_domain"
  | "invalid_whatsapp_number"
  | "phone_display_mismatch"
  | "invalid_email"
  | "invalid_instagram"
  | "instagram_leading_at";

export interface SiteConfigIssue {
  field: keyof SiteConfig;
  code: SiteConfigIssueCode;
}

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isValidHostname(value: string): boolean {
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => HOSTNAME_LABEL.test(label))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,}$/.test(tld) || tld.startsWith("xn--");
}

/**
 * Digits for wa.me / tel: links, or "" when the configured number is not a
 * plausible international number (8–15 digits, per E.164).
 */
export function normalizedPhoneDigits(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!/^\+?[0-9][0-9\s()-]*$/.test(trimmed)) return "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : "";
}

function isValidEmailAddress(value: string): boolean {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  return isValidHostname(domain);
}

/**
 * Instagram username safe to put in a profile URL, or "" when invalid.
 * A single leading "@" is tolerated here (and reported by
 * `validateSiteConfig`) so a config typo degrades to a warning, not a
 * broken instagram.com/@user link.
 */
export function normalizeInstagramHandle(value: string): string {
  if (typeof value !== "string") return "";
  const handle = value.trim().replace(/^@/, "");
  if (handle.length < 1 || handle.length > 30) return "";
  if (!/^[A-Za-z0-9._]+$/.test(handle)) return "";
  if (handle.startsWith(".") || handle.endsWith(".") || handle.includes("..")) return "";
  return handle;
}

/**
 * Split a domain for the big display treatment ("the**yaar**.com").
 * Works for any configured host: a leading "www." is dropped, the suffix
 * (from the last dot) is separated, and a leading "the" stays unhighlighted.
 */
export function splitSiteDomain(value: string): { prefix: string; highlight: string; suffix: string } {
  let host = (value ?? "").trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname.toLowerCase();
    } catch {
      host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split("/")[0];
    }
  }
  host = host.replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice("www.".length);

  const lastDot = host.lastIndexOf(".");
  if (lastDot <= 0) return { prefix: "", highlight: host, suffix: "" };
  const name = host.slice(0, lastDot);
  const suffix = host.slice(lastDot);
  if (name.startsWith("the") && name.length > 3) {
    return { prefix: "the", highlight: name.slice(3), suffix };
  }
  return { prefix: "", highlight: name, suffix };
}

export function validateSiteConfig(config: SiteConfig): SiteConfigIssue[] {
  const issues: SiteConfigIssue[] = [];
  const push = (field: keyof SiteConfig, code: SiteConfigIssueCode) => issues.push({ field, code });

  if (!config.name?.trim()) push("name", "required");
  if (!config.hours?.trim()) push("hours", "required");
  if (!config.city?.trim()) push("city", "required");

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(config.url);
  } catch {
    push("url", "invalid_url");
  }
  if (parsedUrl) {
    const hostname = parsedUrl.hostname.toLowerCase();
    const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && isLoopback)) {
      push("url", "insecure_url");
    }
    if (
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash ||
      config.url !== parsedUrl.origin
    ) {
      push("url", "url_not_origin");
    }
    if (config.host?.trim().toLowerCase() !== hostname) push("host", "url_host_mismatch");
    const derivedDomain = hostname.startsWith("www.") ? hostname.slice("www.".length) : hostname;
    if (config.domain?.trim().toLowerCase() !== derivedDomain) push("domain", "url_domain_mismatch");
  }
  if (!isValidHostname(config.host ?? "")) push("host", "invalid_host");
  if (!isValidHostname(config.domain ?? "")) push("domain", "invalid_domain");

  const whatsappDigits = normalizedPhoneDigits(config.whatsappNumber ?? "");
  if (config.whatsappNumber?.trim() && !whatsappDigits) push("whatsappNumber", "invalid_whatsapp_number");
  const displayDigits = (config.phoneDisplay ?? "").replace(/[^0-9]/g, "");
  if (whatsappDigits && !config.phoneDisplay?.trim()) push("phoneDisplay", "required");
  if (config.phoneDisplay?.trim() && displayDigits !== whatsappDigits) {
    push("phoneDisplay", "phone_display_mismatch");
  }

  if (!isValidEmailAddress(config.email ?? "")) push("email", "invalid_email");

  if (config.instagram?.trim()) {
    if (config.instagram.trim().startsWith("@")) push("instagram", "instagram_leading_at");
    if (!normalizeInstagramHandle(config.instagram)) push("instagram", "invalid_instagram");
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/* Link builders (empty string = not configured / malformed)           */
/* ------------------------------------------------------------------ */

const digits = normalizedPhoneDigits(SITE.whatsappNumber);
const instagramHandle = normalizeInstagramHandle(SITE.instagram);
const siteEmail = isValidEmailAddress(SITE.email) ? SITE.email.trim() : "";

export const whatsappLink = digits ? `https://wa.me/${digits}` : "";
export const callLink = digits ? `tel:+${digits}` : "";
export const instagramLink = instagramHandle ? `https://instagram.com/${encodeURIComponent(instagramHandle)}` : "";
export const instagramDmLink = instagramHandle ? `https://ig.me/m/${encodeURIComponent(instagramHandle)}` : "";

/** WhatsApp link with a ready-made first message. */
export function whatsappWithText(text: string) {
  return whatsappLink ? `${whatsappLink}?text=${encodeURIComponent(text)}` : "";
}

/** Opens Gmail's compose window in the browser (works on computers with no mail app set up). */
export function gmailComposeLink(subject?: string, body?: string) {
  if (!siteEmail) return "";
  const p = new URLSearchParams({ view: "cm", fs: "1", to: siteEmail });
  if (subject) p.set("su", subject);
  if (body) p.set("body", body);
  return `https://mail.google.com/mail/?${p.toString()}`;
}

/** Gmail-friendly mailto link with subject (and optional body). */
export function mailtoLink(subject?: string, body?: string) {
  if (!siteEmail) return "";
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const q = params.toString().replace(/\+/g, "%20");
  return `mailto:${siteEmail}${q ? `?${q}` : ""}`;
}
