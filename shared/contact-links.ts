import {
  isInstagramHostname,
  isYouTubeHostname,
  normalizeInstagramUrl,
  normalizeProfileUrl,
  normalizeYouTubeUrl,
} from "./social-url";

export type ContactLinkKind = "email" | "phone" | "whatsapp" | "instagram" | "youtube" | "profile" | "unknown";

export type ContactLinks = {
  kind: ContactLinkKind;
  /** The value as it should be shown to the person who is allowed to see it. */
  display: string;
  mailtoHref?: string;
  telHref?: string;
  whatsappHref?: string;
  profileHref?: string;
};

function cleanContact(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizedPhone(value: string): string | null {
  const phoneText = value.toLowerCase().startsWith("tel:") ? value.slice(4) : value;
  if (!/^[+()\-.\s\d]+$/.test(phoneText)) return null;
  if ((phoneText.match(/\+/g) ?? []).length > 1) return null;

  const hasPlus = phoneText.trim().startsWith("+");
  let digits = phoneText.replace(/\D/g, "");
  if (!digits) return null;

  if (!hasPlus && digits.startsWith("00")) digits = digits.slice(2);
  if (hasPlus || value.trim().startsWith("00")) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
    if (digits.startsWith("91") && digits.length !== 12) return null;
    return `+${digits}`;
  }
  if (digits.length === 10 && /^[1-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && /^[1-9]/.test(digits.slice(1))) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[1-9]/.test(digits.slice(2))) return `+${digits}`;
  return null;
}

function phoneLinks(value: string, kind: "phone" | "whatsapp" = "phone"): ContactLinks | null {
  const normalized = normalizedPhone(value);
  if (!normalized) return null;
  const digits = normalized.slice(1);
  return {
    kind,
    display: value,
    telHref: `tel:${normalized}`,
    whatsappHref: `https://wa.me/${digits}`,
  };
}

function whatsappPhone(value: string): string | null {
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    const host = parsed.hostname.toLowerCase();
    if (host === "wa.me") return parsed.pathname.replace(/\D/g, "") || null;
    if (host === "api.whatsapp.com" || host === "www.whatsapp.com" || host === "whatsapp.com") {
      return (parsed.searchParams.get("phone") ?? parsed.pathname).replace(/\D/g, "") || null;
    }
  } catch {
    return null;
  }
  return null;
}

function candidateHost(value: string): string | null {
  if (!value.includes(".") && !value.includes("://")) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    !/[\s<>()[\]\\,;:"?#]/.test(value) &&
    /^[A-Za-z0-9.!#$%&'*+/^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(value)
  );
}

/**
 * Turn one already-authorized contact value into safe action links.
 *
 * Unknown/legacy text stays plain text. Social links are rebuilt through the
 * same public-host normalizers used when profiles are saved, so a stored
 * value can never become a javascript:, data:, credential-bearing, or
 * private-host link merely because it is rendered in a dashboard.
 */
export function contactLinks(value: unknown, platform?: string | null): ContactLinks {
  const cleaned = cleanContact(value);
  if (!cleaned || cleaned.length > 300 || /[\u0000-\u001f\u007f]/.test(cleaned)) {
    return { kind: "unknown", display: cleaned };
  }

  const withoutMailto = cleaned.toLowerCase().startsWith("mailto:") ? cleaned.slice(7).split("?")[0] : cleaned;
  if (isEmail(withoutMailto)) {
    const email = withoutMailto.toLowerCase();
    return { kind: "email", display: cleaned, mailtoHref: `mailto:${email}` };
  }

  const waDigits = whatsappPhone(cleaned);
  if (waDigits) {
    const links = phoneLinks(waDigits.length === 10 || waDigits.startsWith("0") ? waDigits : `+${waDigits}`, "whatsapp");
    if (links) return { ...links, display: cleaned };
  }

  const phone = phoneLinks(cleaned);
  if (phone) return phone;

  const host = candidateHost(cleaned);
  if (host && isInstagramHostname(host)) {
    const href = normalizeInstagramUrl(cleaned);
    if (href) return { kind: "instagram", display: cleaned, profileHref: href };
    return { kind: "unknown", display: cleaned };
  }
  if (host && isYouTubeHostname(host)) {
    const href = normalizeYouTubeUrl(cleaned);
    if (href) return { kind: "youtube", display: cleaned, profileHref: href };
    return { kind: "unknown", display: cleaned };
  }

  const looksLikeUrl = Boolean(host) || cleaned.includes("/");
  const looksLikeHandle = cleaned.startsWith("@") || !/[\s]/.test(cleaned);
  if (looksLikeUrl || (looksLikeHandle && platform)) {
    const href = normalizeProfileUrl(cleaned, platform ?? undefined);
    if (href) {
      const hrefHost = candidateHost(href);
      return {
        kind: hrefHost && isInstagramHostname(hrefHost) ? "instagram" : hrefHost && isYouTubeHostname(hrefHost) ? "youtube" : "profile",
        display: cleaned,
        profileHref: href,
      };
    }
  }

  return { kind: "unknown", display: cleaned };
}
