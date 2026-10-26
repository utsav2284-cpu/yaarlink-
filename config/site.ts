/**
 * YaarLink site settings — EDIT THIS FILE to change your public contact details.
 * The Contact page and footer read from here.
 */
export const SITE = {
  name: "YaarLink",

  // Your website address (shown across the site and used in share links).
  domain: "theyaar.com",
  url: "https://theyaar.com",

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

const digits = SITE.whatsappNumber.replace(/[^0-9]/g, "");

export const whatsappLink = digits ? `https://wa.me/${digits}` : "";
export const callLink = digits ? `tel:+${digits}` : "";
export const instagramLink = SITE.instagram ? `https://instagram.com/${SITE.instagram}` : "";
export const instagramDmLink = SITE.instagram ? `https://ig.me/m/${SITE.instagram}` : "";

/** WhatsApp link with a ready-made first message. */
export function whatsappWithText(text: string) {
  return whatsappLink ? `${whatsappLink}?text=${encodeURIComponent(text)}` : "";
}

/** Opens Gmail's compose window in the browser (works on computers with no mail app set up). */
export function gmailComposeLink(subject?: string, body?: string) {
  const p = new URLSearchParams({ view: "cm", fs: "1", to: SITE.email });
  if (subject) p.set("su", subject);
  if (body) p.set("body", body);
  return `https://mail.google.com/mail/?${p.toString()}`;
}

/** Gmail-friendly mailto link with subject (and optional body). */
export function mailtoLink(subject?: string, body?: string) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const q = params.toString().replace(/\+/g, "%20");
  return `mailto:${SITE.email}${q ? `?${q}` : ""}`;
}
