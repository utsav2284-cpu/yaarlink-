/**
 * Restrict phone-field typing/pasting to the characters a phone number can
 * actually contain: digits, one leading `+` (country code), and the common
 * grouping characters (spaces, hyphens, parentheses). Letters and every
 * other symbol are dropped as the user types, so values like "vbnm" can
 * never sit in a phone field looking valid until submit.
 *
 * This is a typing aid only — it does not decide whether the number is a
 * real, dialable number. `normalizePhoneNumber` in `backend/validation.ts`
 * still performs (and remains the authority for) full E.164 validation on
 * the server, and it accepts exactly this character set.
 */
export function sanitizePhoneInput(value: string): string {
  if (typeof value !== "string") return "";
  const withoutLeadingSpace = value.replace(/^\s+/, "");
  const hasLeadingPlus = withoutLeadingSpace.startsWith("+");
  // Drop spaces left at the front after letter removal (e.g. pasting
  // "call me: 98123…"), but keep inner/trailing grouping spaces while typing.
  const kept = withoutLeadingSpace.replace(/[^0-9()\-\s]/g, "").replace(/^\s+/, "");
  return hasLeadingPlus ? `+${kept}` : kept;
}
