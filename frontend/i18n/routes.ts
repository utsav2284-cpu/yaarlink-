import type { TranslationKey } from "./types";

const PUBLIC_DETAIL_PATH = /^\/(?:campaigns|creators)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Detail pages own their record-specific document title. */
export function isPublicDetailPath(pathname: string): boolean {
  return PUBLIC_DETAIL_PATH.test(pathname);
}

/** Localized document-title key for each routable page. */
export const ROUTE_TITLE_KEYS: Readonly<Record<string, TranslationKey>> = {
  "/brands": "brand.title",
  "/creators": "cr.title",
  "/campaigns": "camp.title",
  "/how-it-works": "howp.title",
  "/about": "about.title",
  "/contact": "nav.contact",
  "/dashboard": "dash.title",
  "/account": "account.title",
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

/**
 * Localized Meta description key for each routable page. These intentionally
 * reuse the page's own translated intro copy so search/social snippets stay
 * specific to the destination instead of repeating the home-page description.
 */
export const ROUTE_DESCRIPTION_KEYS: Readonly<Record<string, TranslationKey>> = {
  "/": "meta.siteDescription",
  "/brands": "brand.sub",
  "/creators": "cr.sub",
  "/campaigns": "camp.sub",
  "/how-it-works": "howp.sub",
  "/about": "about.p1",
  "/contact": "cont.sub",
  "/dashboard": "dash.workspaceHint",
  "/account": "account.subtitle",
  "/login": "auth.loginSub",
  "/signup": "auth.signupSub",
  "/forgot-password": "auth.forgotSub",
  "/reset-password": "auth.resetSub",
  "/verify-email": "auth.verifySub",
  "/verify-account-email": "auth.verifyAccountSub",
  "/privacy": "meta.privacyDescription",
  "/terms": "meta.termsDescription",
  "/refund-policy": "meta.refundsDescription",
  "/data-rights": "meta.dataRightsDescription",
  "/account-deletion": "meta.accountDeletionDescription",
};

/** Private, account-recovery, verification, and auth-funnel routes. */
export const NO_INDEX_ROUTES: ReadonlySet<string> = new Set([
  "/dashboard",
  "/account",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-account-email",
]);
