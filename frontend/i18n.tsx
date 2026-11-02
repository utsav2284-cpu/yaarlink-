"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  normalizeCategory,
  normalizeContentType,
  normalizeLanguage,
  normalizePlatform,
  normalizePromotionType,
} from "@/shared/constants";
import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  LANGUAGE_COOKIE_SYNC_KEY,
  LANGUAGE_STORAGE_KEY,
  LOCALES,
  isLang,
  type Lang,
} from "./i18n/config";
import {
  formatCompactNumberForLocale,
  formatCurrencyForLocale,
  formatDateForLocale,
  formatDateTimeForLocale,
  formatListForLocale,
  formatNumberForLocale,
} from "./i18n/format";
import { loadLocale } from "./i18n/load-locale";
import { ROUTE_TITLE_KEYS } from "./i18n/routes";
import { translateMessage, type TranslationValues } from "./i18n/translate";
import type { Dictionary, LocaleData, PromotionDetail, TranslationKey } from "./i18n/types";

export { LANGS } from "./i18n/config";
export type { Lang } from "./i18n/config";
export type { PromotionDetail, TranslationKey } from "./i18n/types";

/* ------------------------------------------------------------------- CONTEXT */

type Ctx = {
  lang: Lang;
  locale: string;
  languagePending: boolean;
  pendingLang: Lang | null;
  setLang: (l: Lang) => Promise<void>;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  /**
   * Localise one canonical category/language/content-type value, an array of
   * values, or the comma-joined representation stored by legacy rows/forms.
   */
  opt: (value: string | readonly string[] | null | undefined) => string;
  /** Localise a promotion-type title coming from constants or the database. */
  promo: (value: string | null | undefined) => string;
  /** Localise promotion-card description/example copy for a promotion type. */
  promoDetail: (value: string | null | undefined) => PromotionDetail;
  /** Localise a canonical creator-platform value. */
  platform: (value: string | null | undefined) => string;
  /** Localise a controlled database status without leaking its raw code. */
  status: (value: string | null | undefined) => string;
  /** Localise a canonical report reason. */
  reportReason: (value: string | null | undefined) => string;
  /** Localise a canonical marketplace entity/target type. */
  entity: (value: string | null | undefined) => string;
  /** Localise a canonical contact-enquiry kind. */
  contactKind: (value: string | null | undefined) => string;
  /** Map a stable API error code/status to a translation key (never show server English). */
  apiErrorKey: (status?: number | null, code?: string | null, fallbackKey?: TranslationKey) => TranslationKey;
  /** Render a stable API error code/status in the selected language. */
  apiError: (status?: number | null, code?: string | null, fallbackKey?: TranslationKey) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCompactNumber: (value: number) => string;
  formatCurrency: (value: number) => string;
  formatList: (values: readonly string[], options?: Intl.ListFormatOptions) => string;
  formatDate: (value?: string | number | Date | null, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value?: string | number | Date | null) => string;
};

const LangCtx = createContext<Ctx | null>(null);

function persistLanguage(lang: Lang) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    localStorage.setItem(LANGUAGE_COOKIE_SYNC_KEY, lang);
  } catch {}
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LANGUAGE_COOKIE}=${lang}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {}
}

const STATUS_KEYS: Readonly<Record<string, TranslationKey>> = {
  active: "status.active",
  incomplete: "status.incomplete",
  pending: "status.pending",
  approved: "status.approved",
  rejected: "status.rejected",
  suspended: "status.suspended",
  open: "status.open",
  paused: "status.paused",
  closed: "status.closed",
  applied: "status.applied",
  shortlisted: "status.shortlisted",
  hired: "status.hired",
  completed: "status.completed",
  withdrawn: "status.withdrawn",
  unverified: "status.unverified",
  verified: "status.verified",
  failed: "status.failed",
  resolved: "status.resolved",
  dismissed: "status.dismissed",
  deleted: "status.deleted",
  success: "status.success",
  failure: "status.failure",
};

const REPORT_REASON_KEYS: Readonly<Record<string, TranslationKey>> = {
  impersonation: "report.impersonation",
  scam: "report.scam",
  spam: "report.spam",
  "incorrect-info": "report.incorrect-info",
  other: "report.other",
};

const ENTITY_KEYS: Readonly<Record<string, TranslationKey>> = {
  campaign: "admin.targetCampaign",
  campaigns: "admin.targetCampaign",
  creator: "admin.targetCreator",
  creators: "admin.targetCreator",
  report: "admin.entityReport",
  reports: "admin.entityReport",
  application: "admin.entityApplication",
  applications: "admin.entityApplication",
  contact: "admin.entityContact",
  contacts: "admin.entityContact",
  listing: "admin.entityListing",
};

const CONTACT_KIND_KEYS: Readonly<Record<string, TranslationKey>> = {
  brand: "cont.kindBrand",
  creator: "cont.kindCreator",
  other: "cont.kindOther",
};

function unknownDynamicValue(kind: string, value: string) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`Unknown localized ${kind} value: ${value}`);
  }
}

const API_ERROR_KEYS: Record<string, TranslationKey> = {
  unauthorized: "api.unauthorized",
  login_required: "api.unauthorized",
  logout_failed: "api.requestFailed",
  forbidden: "api.forbidden",
  not_found: "api.notFound",
  invalid_request: "api.invalidRequest",
  invalid_action: "api.invalidAction",
  invalid_target: "api.invalidTarget",
  no_changes: "api.noChanges",
  request_failed: "api.requestFailed",
  service_unavailable: "api.serviceUnavailable",
  network_error: "api.network",
  load_failed: "api.loadFailed",
  invalid_cursor: "api.invalidCursor",
  invalid_pagination: "api.invalidPagination",
  invalid_sort: "api.invalidSort",
  invalid_filter: "api.invalidFilter",
  invalid_search: "api.invalidSearch",
  rate_limited: "auth.tooManyRequests",
  too_many_requests: "auth.tooManyRequests",
  bot_challenge_failed: "api.botChallengeFailed",
  invalid_bot_challenge: "api.botChallengeFailed",
  password_required: "api.passwordRequired",
  current_password_required: "account.errorCurrentPasswordRequired",
  wrong_password: "account.errorWrongPassword",
  wrong_credentials: "api.wrongCredentials",
  admin_wrong_credentials: "api.adminWrongCredentials",
  invalid_token: "api.invalidToken",
  invalid_email: "account.errorInvalidEmail",
  invalid_phone: "account.errorInvalidPhone",
  email_unchanged: "account.errorEmailUnchanged",
  email_unavailable: "account.errorEmailUnavailable",
  password_policy: "auth.passwordPolicy",
  password_breached: "auth.passwordBreached",
  password_breach_check_unavailable: "auth.passwordBreachCheckUnavailable",
  same_password: "account.errorSamePassword",
  invalid_session: "account.errorSessionNotFound",
  session_not_found: "account.errorSessionNotFound",
  current_session: "account.errorCurrentSession",
  confirmation_mismatch: "account.errorConfirmationMismatch",
  legal_consent_required: "auth.legalConsentRequired",
  name_required: "api.nameRequired",
  message_required: "api.messageRequired",
  field_too_long: "api.fieldTooLong",
  campaign_not_found: "api.campaignNotFound",
  campaign_closed: "api.campaignClosed",
  campaign_already_closed: "api.campaignAlreadyClosed",
  campaign_required_fields: "api.campaignRequiredFields",
  invalid_budget: "api.invalidBudget",
  invalid_website: "api.invalidWebsite",
  invalid_promotion_type: "api.invalidPromotionType",
  invalid_category: "api.invalidCategory",
  invalid_language: "api.invalidLanguage",
  invalid_languages: "api.invalidLanguages",
  invalid_format: "api.invalidFormat",
  invalid_content_types: "api.invalidContentTypes",
  invalid_platform: "api.invalidPlatform",
  invalid_instagram: "api.invalidInstagram",
  invalid_youtube: "api.invalidYoutube",
  invalid_profile_url: "api.invalidProfileUrl",
  profile_link_required: "api.profileLinkRequired",
  invalid_followers: "api.invalidFollowers",
  creator_profile_not_found: "api.creatorProfileNotFound",
  creator_profile_exists: "api.creatorProfileExists",
  creator_profile_incomplete: "api.creatorProfileIncomplete",
  creator_no_linked_profile: "api.creatorNoLinkedProfile",
  creator_review_required: "api.creatorReviewRequired",
  campaign_review_required: "api.campaignReviewRequired",
  campaign_must_be_open_to_pause: "api.campaignMustBeOpenToPause",
  campaign_verification_required: "api.campaignVerificationRequired",
  campaign_cannot_republish: "api.campaignCannotRepublish",
  campaign_changed: "api.campaignChanged",
  creator_profile_changed: "api.creatorProfileChanged",
  content_not_allowed: "api.contentNotAllowed",
  idempotency_key_reused: "api.idempotencyKeyReused",
  application_not_found: "api.applicationNotFound",
  own_campaign: "api.ownCampaign",
  already_applied: "camp.applyDupErr",
  contact_required: "camp.applyContactErr",
  contact_sharing_consent_required: "camp.applyConsentErr",
  application_contact_not_owned: "api.applicationContactNotOwned",
  application_status_conflict: "api.applicationStatusConflict",
  invalid_application_message: "api.invalidApplicationMessage",
  invalid_application_contact: "api.invalidApplicationContact",
  invalid_decision_note: "api.invalidDecisionNote",
  contact_not_found: "api.contactNotFound",
  report_not_found: "api.reportNotFound",
  invalid_report_reason: "api.invalidReportReason",
  target_not_public: "api.targetNotPublic",
  report_already_open: "api.reportAlreadyOpen",
  notification_not_found: "api.notificationNotFound",
  admin_not_configured: "api.adminNotConfigured",
  admin_session_revoke_failed: "api.adminSessionRevokeFailed",
  admin_login_failed: "api.adminLoginFailed",
  moderation_failed: "api.moderationFailed",
};

function apiErrorKeyFor(status?: number | null, code?: string | null, fallbackKey: TranslationKey = "api.requestFailed"): TranslationKey {
  if (code && API_ERROR_KEYS[code]) return API_ERROR_KEYS[code];
  if (status === 401) return "api.unauthorized";
  if (status === 403) return "api.forbidden";
  if (status === 404) return "api.notFound";
  if (status === 429) return "auth.tooManyRequests";
  if (status === 503) return "api.serviceUnavailable";
  if (status && status >= 500) return "api.requestFailed";
  if (status && status >= 400) return fallbackKey === "api.requestFailed" ? "api.invalidRequest" : fallbackKey;
  return fallbackKey;
}

function validationMessageFor(
  messages: Dictionary,
  locale: string,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  const validity = control.validity;
  const say = (key: TranslationKey, values: TranslationValues = {}) =>
    translateMessage(messages, locale, key, values);

  if (validity.valueMissing) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") return say("validation.checkbox");
    if (control instanceof HTMLSelectElement) return say("validation.select");
    return say("validation.required");
  }
  if (validity.typeMismatch) {
    if (control instanceof HTMLInputElement && control.type === "email") return say("validation.email");
    if (control instanceof HTMLInputElement && control.type === "url") return say("validation.url");
    return say("validation.badInput");
  }
  if (validity.patternMismatch) return say("validation.pattern");
  if (validity.tooShort) {
    const min = "minLength" in control && control.minLength > 0 ? control.minLength : 0;
    return say("validation.tooShort", { min, length: Array.from(control.value).length });
  }
  if (validity.tooLong) {
    const max = "maxLength" in control && control.maxLength > 0 ? control.maxLength : 0;
    return say("validation.tooLong", { max, length: Array.from(control.value).length });
  }
  if (validity.rangeUnderflow && control instanceof HTMLInputElement) {
    return say("validation.rangeUnderflow", { min: Number(control.min || 0) });
  }
  if (validity.rangeOverflow && control instanceof HTMLInputElement) {
    return say("validation.rangeOverflow", { max: Number(control.max || 0) });
  }
  if (validity.stepMismatch) return say("validation.step");
  if (validity.badInput) return say("validation.badInput");
  return say("validation.generic");
}

export function LangProvider({
  children,
  initialLang,
  initialLocaleData,
}: {
  children: React.ReactNode;
  initialLang: Lang;
  initialLocaleData: LocaleData;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [localeData, setLocaleData] = useState<LocaleData>(initialLocaleData);
  const [pendingLang, setPendingLang] = useState<Lang | null>(null);
  const localeCache = useRef<Partial<Record<Lang, LocaleData>>>({
    [initialLang]: initialLocaleData,
  });
  const languageRequest = useRef(0);
  const initialStorageSyncDone = useRef(false);
  const pathname = usePathname();
  const locale = LOCALES[lang];
  const messages = localeData.messages;

  const t = useCallback<Ctx["t"]>(
    (key, values = {}) => translateMessage(messages, locale, key, values),
    [locale, messages],
  );

  const setLang = useCallback<Ctx["setLang"]>(
    async (nextLang) => {
      persistLanguage(nextLang);
      if (nextLang === lang && localeCache.current[nextLang] === localeData) return;

      const requestId = ++languageRequest.current;
      setPendingLang(nextLang);
      try {
        const nextLocaleData = localeCache.current[nextLang] ?? (await loadLocale(nextLang));
        localeCache.current[nextLang] = nextLocaleData;
        if (requestId !== languageRequest.current) return;
        setLocaleData(nextLocaleData);
        setLangState(nextLang);
        try {
          document.documentElement.lang = LOCALES[nextLang];
          document.documentElement.dir = "ltr";
        } catch {}
      } catch (error) {
        if (requestId !== languageRequest.current) return;
        // Do not leave the cookie claiming a language whose bundle could not
        // be loaded in this browser. The current, working language remains.
        persistLanguage(lang);
        console.error("Could not load the selected language", error);
      } finally {
        if (requestId === languageRequest.current) setPendingLang(null);
      }
    },
    [lang, localeData],
  );

  useEffect(() => {
    if (initialStorageSyncDone.current) return;
    initialStorageSyncDone.current = true;
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (!isLang(saved)) return;
      // The root layout's early migration script normally turns a legacy
      // localStorage-only choice into the SSR cookie before the body paints.
      // This fallback covers browsers where that cookie could not be stored.
      if (saved !== initialLang) void setLang(saved);
      else persistLanguage(saved);
    } catch {}
  }, [initialLang, setLang]);

  useEffect(() => {
    try {
      document.documentElement.lang = locale;
      document.documentElement.dir = "ltr";
    } catch {}
  }, [locale]);

  useEffect(() => {
    const titleKey = pathname ? ROUTE_TITLE_KEYS[pathname] : undefined;
    try {
      document.title = titleKey ? `${t(titleKey)} · YaarLink` : `YaarLink · ${t("foot.tagline")}`;
    } catch {}
  }, [pathname, t]);

  useEffect(() => {
    const isFormControl = (value: EventTarget | null): value is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      value instanceof HTMLInputElement || value instanceof HTMLSelectElement || value instanceof HTMLTextAreaElement;

    const onInvalid = (event: Event) => {
      const control = event.target;
      if (!isFormControl(control) || control.validity.customError) return;
      control.setCustomValidity(validationMessageFor(messages, locale, control));
      control.dataset.yaarlinkLocalizedValidity = "true";
    };

    const clearLocalizedValidity = (event: Event) => {
      const control = event.target;
      if (!isFormControl(control) || control.dataset.yaarlinkLocalizedValidity !== "true") return;
      control.setCustomValidity("");
      delete control.dataset.yaarlinkLocalizedValidity;
    };

    document.querySelectorAll("input, select, textarea").forEach((control) => {
      if (isFormControl(control) && control.dataset.yaarlinkLocalizedValidity === "true") {
        control.setCustomValidity("");
        delete control.dataset.yaarlinkLocalizedValidity;
      }
    });

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", clearLocalizedValidity, true);
    document.addEventListener("change", clearLocalizedValidity, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", clearLocalizedValidity, true);
      document.removeEventListener("change", clearLocalizedValidity, true);
    };
  }, [locale, messages]);

  const value: Ctx = {
    lang,
    locale,
    languagePending: pendingLang !== null,
    pendingLang,
    setLang,
    t,
    opt: (value) => {
      if (!value) return "";
      const rawParts = typeof value === "string"
        ? value.split(",")
        : value.flatMap((item) => item.split(","));
      const localizePart = (part: string) => {
        const cleaned = part.trim().replace(/\s+/g, " ");
        if (!cleaned) return "";
        const canonical =
          normalizeCategory(cleaned) ??
          normalizeLanguage(cleaned) ??
          normalizeContentType(cleaned) ??
          cleaned;
        const label =
          localeData.categories[canonical] ??
          localeData.languages[canonical] ??
          localeData.contentTypes[canonical];
        if (label) return label;
        unknownDynamicValue("option", cleaned);
        return t("common.unknown");
      };
      const labels = [...new Set(rawParts.map(localizePart).filter((label): label is string => Boolean(label)))];
      return formatListForLocale(locale, labels);
    },
    promo: (value) => {
      if (!value) return "";
      const canonical = normalizePromotionType(value);
      if (canonical) return localeData.promotionTypes[canonical];
      unknownDynamicValue("promotion type", value);
      return t("common.unknown");
    },
    promoDetail: (value) => {
      const canonical = normalizePromotionType(value);
      return canonical ? localeData.promotionDetails[canonical] : { desc: "", example: "" };
    },
    platform: (value) => {
      const canonical = normalizePlatform(value);
      if (canonical === "Both") return t("cr.both");
      if (canonical === "Other") return t("cr.otherPlat");
      if (canonical) return canonical; // Instagram and YouTube are proper names.
      if (!value) return "";
      unknownDynamicValue("platform", value);
      return t("common.unknown");
    },
    status: (value) => {
      if (!value) return "";
      const key = STATUS_KEYS[value.trim().toLowerCase()];
      if (key) return t(key);
      unknownDynamicValue("status", value);
      return t("status.unknown");
    },
    reportReason: (value) => {
      if (!value) return "";
      const key = REPORT_REASON_KEYS[value.trim().toLowerCase()];
      if (key) return t(key);
      unknownDynamicValue("report reason", value);
      return t("common.unknown");
    },
    entity: (value) => {
      if (!value) return "";
      const key = ENTITY_KEYS[value.trim().toLowerCase()];
      if (key) return t(key);
      unknownDynamicValue("entity", value);
      return t("common.unknown");
    },
    contactKind: (value) => {
      if (!value) return "";
      const key = CONTACT_KIND_KEYS[value.trim().toLowerCase()];
      if (key) return t(key);
      unknownDynamicValue("contact kind", value);
      return t("common.unknown");
    },
    apiErrorKey: (status, code, fallbackKey) => apiErrorKeyFor(status, code, fallbackKey),
    apiError: (status, code, fallbackKey) => t(apiErrorKeyFor(status, code, fallbackKey)),
    formatNumber: (numberValue, options) => formatNumberForLocale(locale, numberValue, options),
    formatCompactNumber: (numberValue) => formatCompactNumberForLocale(locale, numberValue),
    formatCurrency: (numberValue) => formatCurrencyForLocale(locale, numberValue),
    formatList: (values, options) => formatListForLocale(locale, values, options),
    formatDate: (dateValue, options) => formatDateForLocale(locale, dateValue, options),
    formatDateTime: (dateValue) => formatDateTimeForLocale(locale, dateValue),
  };

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}

/** Alias kept so `<LanguageProvider>` in layout.tsx keeps working. */
export const LanguageProvider = LangProvider;
