/**
 * Restrict amount/count fields to the characters their server parsers
 * accept: digits, plus commas as digit grouping (the budget, quote, and
 * follower parsers all accept plain, Western-grouped, and Indian-grouped
 * integers). Letters, currency symbols, decimal points, and every other
 * character are dropped as the user types, so a value like "8ooo" can
 * never sit in an amount field looking valid until submit.
 *
 * This is a typing aid only — grouping, range, and bounds validation stay
 * with the existing client/server parsers (`parseIntegerString` and
 * friends in `backend/validation.ts`).
 */
export function sanitizeAmountInput(value: string): string {
  if (typeof value !== "string") return "";
  // A leading comma can never be part of a grouped number; dropping it
  // keeps the field from starting with punctuation after a paste.
  return value.replace(/[^0-9,]/g, "").replace(/^,+/, "");
}
