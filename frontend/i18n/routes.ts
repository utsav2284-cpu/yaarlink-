import type { TranslationKey } from "./types";

const PUBLIC_DETAIL_PATH = /^\/(?:campaigns|creators)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Detail pages own their record-specific document title. */
export function isPublicDetailPath(pathname: string): boolean {
  return PUBLIC_DETAIL_PATH.test(pathname);
}

/** Localized document-title key for each routable page. */
export const ROUTE_TITLE_KEYS: Readonly<Record<string, TranslationKey>> = {
  "/brands": "brand.eyebrow",
  "/creators": "nav.creators",
  "/campaigns": "nav.campaigns",
  "/how-it-works": "nav.how",
  "/about": "nav.about",
  "/contact": "nav.contact",
  "/dashboard": "dash.title",
  "/account": "account.title",
  "/admin": "meta.admin",
  "/login": "auth.login",
  "/signup": "nav.signup",
  "/forgot-password": "auth.forgotTitle",
  "/reset-password": "auth.resetTitle",
  "/verify-email": "auth.verifyTitle",
  "/verify-account-email": "auth.verifyAccountTitle",
  "/privacy": "legal.privacy",
  "/terms": "legal.terms",
  "/refund-policy": "legal.refunds",
  "/data-rights": "legal.dataRights",
  "/account-deletion": "legal.accountDeletion",
};
