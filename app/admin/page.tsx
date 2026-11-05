"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLang, type TranslationKey } from "@/frontend/i18n";
import { ListingPagination } from "@/frontend/components/ListingState";
import { appendUniqueById, isListPagination, type ListPagination } from "@/frontend/api-json";
import {
  APPLICATION_STATUSES,
  CAMPAIGN_DEFAULT_EXPIRY_DAYS,
  CAMPAIGN_MAX_EXPIRY_DAYS,
  CAMPAIGN_REVIEW_STATUSES,
  CREATOR_REVIEW_STATUSES,
  VERIFICATION_STATUSES,
} from "@/shared/constants";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/shared/social-url";
import {
  DEFAULT_SITE_AVAILABILITY,
  SITE_AVAILABILITY_MODES,
  effectiveSiteAvailability,
  parseSiteAvailabilitySettings,
  type SiteAvailabilityMode,
  type SiteAvailabilitySettings,
} from "@/shared/site-availability";
import { contactLinks } from "@/shared/contact-links";
import { USER_ROLES } from "@/shared/user-roles";

type Tab = "campaigns" | "creators" | "reports" | "applications" | "contacts" | "audit" | "activity" | "users" | "brands";
type ModerationEntity = "campaign" | "creator" | "report" | "application" | "contact" | "user" | "brand" | "setting";
type PlatformSettings = { defaultExpiryDays: number; maxExpiryDays: number };
type SiteAvailabilityForm = { mode: SiteAvailabilityMode; message: string; startsAt: string; endsAt: string };

interface AdminCounts {
  campaigns: number;
  creators: number;
  applications: number;
  contacts: number;
  reports: number;
  auditLogs: number;
  activity: number;
  activityEvents: number;
  expiredCampaigns: number;
  users: number;
  brands: number;
  pendingCampaigns: number;
  pendingCreators: number;
  pendingReviews: number;
  openReports: number;
}

type AdminQuery = { q: string; filter: string; verificationStatus: string; sort: string };
type AdminListState = AdminQuery & { rows: any[]; pagination: ListPagination | null; loaded: boolean };

const ADMIN_PAGE_SIZE = 50;
const DEFAULT_ADMIN_SORT: Record<Tab, string> = {
  campaigns: "review",
  creators: "review",
  reports: "triage",
  applications: "newest",
  contacts: "newest",
  audit: "newest",
  activity: "newest",
  users: "newest",
  brands: "newest",
};
const AUDIT_ACTION_KEYS: Readonly<Record<string, TranslationKey>> = {
  approve: "admin.auditAction.approve",
  review: "admin.auditAction.review",
  reject: "admin.auditAction.reject",
  suspend: "admin.auditAction.suspend",
  close: "admin.auditAction.close",
  delete: "admin.auditAction.delete",
  resolve: "admin.auditAction.resolve",
  dismiss: "admin.auditAction.dismiss",
  reopen: "admin.auditAction.reopen",
  revoke_sessions: "admin.auditAction.revoke_sessions",
  sync: "admin.auditAction.sync",
  availability: "admin.auditAction.availability",
};

const AUDIT_DETAIL_KEYS: Readonly<Record<string, TranslationKey>> = {
  fromStatus: "admin.auditDetail.fromStatus",
  toStatus: "admin.auditDetail.toStatus",
  verifiedFollowers: "admin.auditDetail.verifiedFollowers",
  notePresent: "admin.auditDetail.notePresent",
  codeIssued: "admin.auditDetail.codeIssued",
  campaignId: "admin.auditDetail.campaignId",
  targetType: "admin.auditDetail.targetType",
  targetId: "admin.auditDetail.targetId",
  reason: "admin.auditDetail.reason",
  mfaConfigured: "admin.auditDetail.mfaConfigured",
  mfaUsed: "admin.auditDetail.mfaUsed",
  priorFailures: "admin.auditDetail.priorFailures",
  sessionVersion: "admin.auditDetail.sessionVersion",
  revokedAllSessions: "admin.auditDetail.revokedAllSessions",
  sessionsRevoked: "admin.auditDetail.sessionsRevoked",
  emailChanged: "admin.auditDetail.emailChanged",
  phoneChanged: "admin.auditDetail.phoneChanged",
  rows: "admin.auditDetail.rows",
  total: "admin.auditDetail.total",
  format: "admin.auditDetail.format",
  startsAt: "admin.availabilityStarts",
  endsAt: "admin.availabilityEnds",
};

const AUDIT_REASON_KEYS: Readonly<Record<string, TranslationKey>> = {
  missing_password: "admin.auditReason.missing_password",
  wrong_password: "admin.auditReason.wrong_password",
  invalid_totp: "admin.auditReason.invalid_totp",
  server_error: "admin.auditReason.server_error",
};

const PLATFORM_SETTINGS_ENTITY_ID = "00000000-0000-4000-8000-000000000001";
const ACTIVITY_ENTITY_TYPES = ["user", "brand", "creator_profile", "campaign", "application", "report", "contact", "setting"] as const;
const ACTIVITY_ACTOR_TYPES = ["user", "admin", "system"] as const;
const ACTIVITY_ACTION_KEYS: Readonly<Record<string, TranslationKey>> = {
  created: "admin.activityAction.created",
  updated: "admin.activityAction.updated",
  deleted: "admin.activityAction.deleted",
  status_changed: "admin.activityAction.status_changed",
  expired: "admin.activityAction.expired",
  completed: "admin.activityAction.completed",
  contact_synced: "admin.activityAction.contact_synced",
  email_changed: "admin.activityAction.email_changed",
  phone_changed: "admin.activityAction.phone_changed",
  sessions_revoked: "admin.activityAction.sessions_revoked",
};
const ACTIVITY_FIELD_KEYS: Readonly<Record<string, TranslationKey>> = {
  name: "admin.name",
  email: "brand.email",
  phone: "brand.phone",
  status: "admin.status",
  title: "brand.titleLabel",
  businessName: "brand.businessName",
  contactName: "brand.contactName",
  description: "brand.descLabel",
  budget: "brand.budget",
  location: "brand.location",
  language: "brand.language",
  languages: "brand.language",
  format: "brand.format",
  contentTypes: "cr.content",
  category: "brand.category",
  promotionType: "brand.promoting",
  website: "brand.website",
  targetAudience: "brand.audience",
  deadlineAt: "admin.deadlineDate",
  expiresAt: "admin.expiresDate",
  expiredAt: "dash.expiredOn",
  listedAt: "admin.listedDate",
  followers: "admin.followers",
  verifiedFollowers: "dash.verifiedFollowers",
  platform: "cr.platform",
  bio: "cr.bio",
  instagram: "cr.instagram",
  youtube: "cr.youtube",
  profileUrl: "cr.profileLink",
  creatorContact: "dash.contactForBrand",
  creatorName: "admin.creator",
  creatorId: "admin.creator",
  campaignId: "admin.campaign",
  userId: "admin.userContact",
  message: "admin.message",
  quoteAmount: "dash.quote",
  proposedTimelineDays: "dash.proposedTimeline",
  proposedTimeline: "dash.proposedTimeline",
  creatorProfileSnapshot: "dash.profileSnapshot",
  snapshotCapturedAt: "dash.profileSnapshot",
  decisionNote: "dash.decisionNote",
  decisionAt: "dash.updatedOn",
  verificationStatus: "admin.verification",
  verificationCode: "dash.verificationCode",
  emailVerifiedAt: "account.emailVerified",
  moderationNote: "admin.note",
  adminNote: "admin.note",
  reviewedAt: "admin.reviewed",
  emailSource: "admin.contactSource",
  phoneSource: "admin.contactSource",
  brandId: "admin.entityBrand",
  campaignDefaultExpiryDays: "admin.defaultExpiryDays",
  campaignMaxExpiryDays: "admin.maxExpiryDays",
  defaultExpiryDays: "admin.defaultExpiryDays",
  maxExpiryDays: "admin.maxExpiryDays",
  siteAvailabilityMode: "admin.availabilityMode",
  siteAvailabilityMessage: "admin.availabilityMessage",
  siteAvailabilityStartsAt: "admin.availabilityStarts",
  siteAvailabilityEndsAt: "admin.availabilityEnds",
  tokenVersion: "admin.auditDetail.sessionVersion",
  updatedAt: "dash.updatedOn",
  resolvedAt: "status.resolved",
  targetType: "admin.auditDetail.targetType",
  targetId: "admin.auditDetail.targetId",
  reason: "admin.auditDetail.reason",
  details: "admin.details",
  kind: "admin.type",
  role: "account.role",
};

const emptyAdminCounts = (): AdminCounts => ({
  campaigns: 0,
  creators: 0,
  applications: 0,
  contacts: 0,
  reports: 0,
  auditLogs: 0,
  activity: 0,
  activityEvents: 0,
  expiredCampaigns: 0,
  users: 0,
  brands: 0,
  pendingCampaigns: 0,
  pendingCreators: 0,
  pendingReviews: 0,
  openReports: 0,
});
const emptyAdminQuery = (tab: Tab): AdminQuery => ({ q: "", filter: "", verificationStatus: "", sort: DEFAULT_ADMIN_SORT[tab] });
const emptyAdminListState = (): Record<Tab, AdminListState> => ({
  campaigns: { ...emptyAdminQuery("campaigns"), rows: [], pagination: null, loaded: false },
  creators: { ...emptyAdminQuery("creators"), rows: [], pagination: null, loaded: false },
  reports: { ...emptyAdminQuery("reports"), rows: [], pagination: null, loaded: false },
  applications: { ...emptyAdminQuery("applications"), rows: [], pagination: null, loaded: false },
  contacts: { ...emptyAdminQuery("contacts"), rows: [], pagination: null, loaded: false },
  audit: { ...emptyAdminQuery("audit"), rows: [], pagination: null, loaded: false },
  activity: { ...emptyAdminQuery("activity"), rows: [], pagination: null, loaded: false },
  users: { ...emptyAdminQuery("users"), rows: [], pagination: null, loaded: false },
  brands: { ...emptyAdminQuery("brands"), rows: [], pagination: null, loaded: false },
});
const adminEntityForTab = (tab: Tab) => (tab === "audit" ? "auditLogs" : tab);
const adminFilterParamForTab = (tab: Tab) =>
  tab === "contacts" ? "kind" : tab === "audit" ? "outcome" : tab === "activity" ? "entityType" : tab === "users" ? "role" : "status";

function dateHasPassed(value: string | null | undefined, now: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= now;
}

function statusClass(status?: string | null, isReport = false) {
  if (isReport && status === "open") return "bg-red-100 text-red-800";
  switch (status) {
    case "approved":
    case "open":
    case "verified":
    case "resolved":
    case "success":
    case "hired":
    case "completed":
      return "bg-green-100 text-green-800";
    case "shortlisted":
      return "bg-sky-100 text-sky-900";
    case "pending":
    case "paused":
    case "applied":
      return "bg-amber-100 text-amber-900";
    case "rejected":
    case "suspended":
    case "failed":
    case "failure":
      return "bg-red-100 text-red-800";
    default:
      return "bg-stone-100 text-stone-700";
  }
}

function StatusPill({ status, isReport = false }: { status?: string | null; isReport?: boolean }) {
  const { status: localizeStatus } = useLang();
  if (!status) return <span className="text-stone-600">—</span>;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold ${statusClass(status, isReport)}`}>
      {localizeStatus(status)}
    </span>
  );
}

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function availabilityFormFromSettings(settings: SiteAvailabilitySettings): SiteAvailabilityForm {
  return {
    mode: settings.mode,
    message: settings.message ?? "",
    startsAt: toDateTimeLocalValue(settings.startsAt),
    endsAt: toDateTimeLocalValue(settings.endsAt),
  };
}

function LivePageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="whitespace-nowrap rounded-lg border border-[#bfd8c6] bg-[#eef7f0] px-3 py-2 text-[12.5px] font-bold text-[#17452e] hover:bg-[#dff0e5]"
    >
      {children} ↗
    </a>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger" | "warning" | "neutral";
}) {
  const classes =
    tone === "primary"
      ? "bg-[#17452e] text-white hover:bg-[#123623]"
      : tone === "danger"
        ? "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
        : tone === "warning"
          ? "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
          : "border border-[#e9ddc3] bg-white text-[#1c1917] hover:bg-[#fffbf1]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      {children}
    </button>
  );
}

function ProfileLinks({
  links,
  platform,
}: {
  links: Array<{ value?: string | null; kind: "profile" | "instagram" | "youtube" }>;
  platform?: string | null;
}) {
  const uniqueLinks = [
    ...new Map(
      links
        .filter((link): link is { value: string; kind: "profile" | "instagram" | "youtube" } => Boolean(link.value))
        .map((link) => [link.value, link] as const),
    ).values(),
  ];
  if (uniqueLinks.length === 0) return <span className="text-stone-600">—</span>;
  return (
    <div className="grid max-w-[230px] gap-1">
      {uniqueLinks.map(({ value: link, kind }) => {
        const safeLink =
          kind === "instagram"
            ? normalizeInstagramUrl(link)
            : kind === "youtube"
              ? normalizeYouTubeUrl(link)
              : normalizeProfileUrl(link, platform ?? undefined);
        return safeLink ? (
          <a key={link} href={safeLink} target="_blank" rel="noopener noreferrer" className="break-all text-[12px] font-semibold text-[#c7431f] hover:underline">
            {link}
          </a>
        ) : (
          <span key={link} className="break-all text-[12px] font-semibold text-stone-600">
            {link}
          </span>
        );
      })}
    </div>
  );
}

function ContactValue({ value, platform }: { value?: string | null; platform?: string | null }) {
  const { t } = useLang();
  const links = contactLinks(value, platform);
  if (!links.display) return <span className="text-stone-600">—</span>;
  const primaryHref =
    links.kind === "whatsapp"
      ? links.whatsappHref
      : links.kind === "phone"
        ? links.telHref
        : links.mailtoHref ?? links.profileHref;
  const external = Boolean(links.profileHref || links.kind === "whatsapp");
  const actionClass = "rounded-md border border-[#e9ddc3] bg-white px-2 py-0.5 text-[11px] font-bold text-[#1c1917] hover:bg-[#fff4de]";
  return (
    <div>
      {primaryHref ? (
        <a
          href={primaryHref}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="break-all text-[12px] font-semibold text-[#c7431f] hover:underline"
        >
          {links.display}
        </a>
      ) : (
        <span className="break-all text-[12px] font-semibold text-stone-700">{links.display}</span>
      )}
      {(links.kind === "phone" || links.kind === "whatsapp") && (links.telHref || links.whatsappHref) && (
        <span className="mt-1 flex flex-wrap gap-1">
          {links.telHref && <a href={links.telHref} className={actionClass}>{t("contact.call")}</a>}
          {links.whatsappHref && (
            <a href={links.whatsappHref} target="_blank" rel="noopener noreferrer" className={actionClass}>
              {t("contact.whatsapp")}
            </a>
          )}
        </span>
      )}
    </div>
  );
}

export default function AdminPage() {
  const {
    t,
    opt,
    promo,
    platform,
    status: localizeStatus,
    reportReason: localizeReportReason,
    entity: localizeEntity,
    contactKind: localizeContactKind,
    apiErrorKey,
    formatNumber,
    formatCurrency,
    formatDateTime,
  } = useLang();
  const router = useRouter();
  const authRedirectingRef = useRef(false);
  const [listState, setListState] = useState<Record<Tab, AdminListState>>(emptyAdminListState);
  const [counts, setCounts] = useState<AdminCounts>(emptyAdminCounts);
  const [tab, setTab] = useState<Tab>("campaigns");
  const [adminDraft, setAdminDraft] = useState<AdminQuery>(() => emptyAdminQuery("campaigns"));
  const adminRequestRef = useRef<Record<string, number>>({});
  const [authed, setAuthed] = useState(false);
  const [adminProfile, setAdminProfile] = useState<{
    name?: string | null;
    email?: string;
    role?: string;
    lastLoginAt?: string | null;
  } | null>(null);
  const [errKey, setErrKey] = useState<TranslationKey | "">("");
  const [noticeKey, setNoticeKey] = useState<TranslationKey | "">("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [verifiedFollowers, setVerifiedFollowers] = useState<Record<string, string>>({});
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    defaultExpiryDays: CAMPAIGN_DEFAULT_EXPIRY_DAYS,
    maxExpiryDays: CAMPAIGN_MAX_EXPIRY_DAYS,
  });
  const [settingsForm, setSettingsForm] = useState({
    defaultExpiryDays: String(CAMPAIGN_DEFAULT_EXPIRY_DAYS),
    maxExpiryDays: String(CAMPAIGN_MAX_EXPIRY_DAYS),
  });
  const settingsDirtyRef = useRef(false);
  const [siteAvailability, setSiteAvailability] = useState<SiteAvailabilitySettings>(DEFAULT_SITE_AVAILABILITY);
  const [availabilityForm, setAvailabilityForm] = useState<SiteAvailabilityForm>(() =>
    availabilityFormFromSettings(DEFAULT_SITE_AVAILABILITY),
  );
  const availabilityDirtyRef = useRef(false);
  const [clientNow, setClientNow] = useState<number | null>(null);

  const redirectForAdminAccess = async () => {
    if (authRedirectingRef.current) return;
    authRedirectingRef.current = true;
    try {
      const response = await fetch("/api/admin/identity/me", { credentials: "include", cache: "no-store" });
      const data = (await response.json().catch(() => null)) as {
        admin?: { role?: string };
        session?: { mfaSatisfied?: boolean };
      } | null;
      if (!response.ok || !data?.admin) {
        router.replace("/admin/sign-in");
        return;
      }
      setAdminProfile(data.admin);
      // Stage 1 simple mode reports the password session as satisfied, so a
      // signed-in Super Admin simply stays on the dashboard.
      if (data.session?.mfaSatisfied && data.admin.role === "super_admin") return;
      if (!data.session?.mfaSatisfied && data.admin.role === "super_admin") {
        window.sessionStorage.setItem("yl-admin-after-mfa", "/admin");
      }
      router.replace("/admin/security");
    } catch {
      authRedirectingRef.current = false;
    }
  };

  const clearAdminState = () => {
    setListState(emptyAdminListState());
    setCounts(emptyAdminCounts());
    setAdminDraft(emptyAdminQuery("campaigns"));
    setVerifiedFollowers({});
    setPlatformSettings({ defaultExpiryDays: CAMPAIGN_DEFAULT_EXPIRY_DAYS, maxExpiryDays: CAMPAIGN_MAX_EXPIRY_DAYS });
    setSettingsForm({ defaultExpiryDays: String(CAMPAIGN_DEFAULT_EXPIRY_DAYS), maxExpiryDays: String(CAMPAIGN_MAX_EXPIRY_DAYS) });
    settingsDirtyRef.current = false;
    setSiteAvailability(DEFAULT_SITE_AVAILABILITY);
    setAvailabilityForm(availabilityFormFromSettings(DEFAULT_SITE_AVAILABILITY));
    availabilityDirtyRef.current = false;
    setTab("campaigns");
    setNoticeKey("");
    setBusyKey("");
    setExporting(false);
    setAuthed(false);
    setAdminProfile(null);
  };

  const load = async (
    targetTab: Tab = tab,
    {
      append = false,
      cursor = null,
      query,
    }: { append?: boolean; cursor?: string | null; query?: AdminQuery } = {},
  ) => {
    const requestId = (adminRequestRef.current[targetTab] = (adminRequestRef.current[targetTab] ?? 0) + 1);
    const activeQuery = query ?? listState[targetTab];
    const entity = adminEntityForTab(targetTab);
    const params = new URLSearchParams({ entity, limit: String(ADMIN_PAGE_SIZE), sort: activeQuery.sort });
    if (activeQuery.q.trim()) params.set("q", activeQuery.q.trim());
    if (activeQuery.filter) params.set(adminFilterParamForTab(targetTab), activeQuery.filter);
    if ((targetTab === "campaigns" || targetTab === "creators" || targetTab === "users") && activeQuery.verificationStatus) {
      params.set("verificationStatus", activeQuery.verificationStatus);
    }
    if (targetTab === "activity" && activeQuery.verificationStatus) {
      params.set("actorType", activeQuery.verificationStatus);
    }
    if (cursor) params.set("cursor", cursor);

    setLoading(true);
    setErrKey("");
    try {
      const res = await fetch(`/api/admin/data?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (adminRequestRef.current[targetTab] !== requestId) return;
      if (!res.ok) {
        const nextErrorKey = apiErrorKey(res.status, d?.code, "api.loadFailed");
        if (res.status === 401 || res.status === 403) {
          clearAdminState();
          void redirectForAdminAccess();
        } else if (!authed) {
          clearAdminState();
        }
        setErrKey(nextErrorKey);
        return;
      }
      const rows = Array.isArray(d?.[entity]) ? d[entity] : null;
      if (!rows || !isListPagination(d?.pagination) || !d?.counts || typeof d.counts !== "object") {
        setErrKey("api.loadFailed");
        return;
      }
      if (
        d.platformSettings &&
        Number.isSafeInteger(d.platformSettings.defaultExpiryDays) &&
        Number.isSafeInteger(d.platformSettings.maxExpiryDays)
      ) {
        const nextSettings = {
          defaultExpiryDays: d.platformSettings.defaultExpiryDays,
          maxExpiryDays: d.platformSettings.maxExpiryDays,
        };
        setPlatformSettings(nextSettings);
        if (!settingsDirtyRef.current) {
          setSettingsForm({
            defaultExpiryDays: String(nextSettings.defaultExpiryDays),
            maxExpiryDays: String(nextSettings.maxExpiryDays),
          });
        }
      }
      const nextSiteAvailability = parseSiteAvailabilitySettings(d?.siteAvailability?.settings);
      if (nextSiteAvailability) {
        setSiteAvailability(nextSiteAvailability);
        if (!availabilityDirtyRef.current) setAvailabilityForm(availabilityFormFromSettings(nextSiteAvailability));
      }
      setCounts({ ...emptyAdminCounts(), ...d.counts });
      setListState((current) => ({
        ...current,
        [targetTab]: {
          ...current[targetTab],
          ...activeQuery,
          q: activeQuery.q.trim(),
          rows: append ? appendUniqueById(current[targetTab].rows, rows) : rows,
          pagination: d.pagination,
          loaded: true,
        },
      }));
      setAuthed(true);
    } catch {
      if (adminRequestRef.current[targetTab] !== requestId) return;
      if (!authed) clearAdminState();
      setErrKey("api.loadFailed");
    } finally {
      if (adminRequestRef.current[targetTab] === requestId) setLoading(false);
    }
  };

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const switchTab = (nextTab: Tab) => {
    setTab(nextTab);
    const nextQuery = listState[nextTab];
    setAdminDraft({
      q: nextQuery.q,
      filter: nextQuery.filter,
      verificationStatus: nextQuery.verificationStatus,
      sort: nextQuery.sort,
    });
    if (authed) void load(nextTab);
  };

  const applyAdminFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const query = { ...adminDraft, q: adminDraft.q.trim() };
    setAdminDraft(query);
    void load(tab, { query });
  };

  const clearAdminFilters = () => {
    const query = emptyAdminQuery(tab);
    setAdminDraft(query);
    void load(tab, { query });
  };

  const loadMoreAdminRows = () => {
    const cursor = listState[tab].pagination?.nextCursor;
    if (!cursor || loading) return;
    void load(tab, { append: true, cursor });
  };

  const openAdminTabWithSearch = (nextTab: Tab, q: string) => {
    const query = { ...emptyAdminQuery(nextTab), q };
    setTab(nextTab);
    setAdminDraft(query);
    if (authed) void load(nextTab, { query });
  };

  const exportAdminRows = async () => {
    if (exporting || loading) return;
    const entity = adminEntityForTab(tab);
    const query = { ...adminDraft, q: adminDraft.q.trim() };
    const params = new URLSearchParams({ entity, format: "csv", sort: query.sort });
    if (query.q) params.set("q", query.q);
    if (query.filter) params.set(adminFilterParamForTab(tab), query.filter);
    if ((tab === "campaigns" || tab === "creators" || tab === "users") && query.verificationStatus) {
      params.set("verificationStatus", query.verificationStatus);
    }
    if (tab === "activity" && query.verificationStatus) {
      params.set("actorType", query.verificationStatus);
    }

    setExporting(true);
    setErrKey("");
    setNoticeKey("");
    try {
      const res = await fetch(`/api/admin/data?${params.toString()}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrKey(apiErrorKey(res.status, d?.code, "admin.exportFailed"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `yaarlink-admin-${entity}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNoticeKey("admin.exportReady");
    } catch {
      setErrKey("admin.exportFailed");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const updateNow = () => setClientNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => { void Promise.resolve().then(() => loadRef.current("campaigns")); }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/admin/identity/me", { credentials: "include", cache: "no-store" });
        const data = (await response.json().catch(() => null)) as {
          admin?: { name?: string | null; email?: string; role?: string; lastLoginAt?: string | null };
        } | null;
        if (!cancelled && response.ok && data?.admin) setAdminProfile(data.admin);
      } catch {
        // The data load above remains the authority for access redirects.
      }
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const savePlatformSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const defaultExpiryDays = Number(settingsForm.defaultExpiryDays);
    const maxExpiryDays = Number(settingsForm.maxExpiryDays);
    if (
      !Number.isSafeInteger(defaultExpiryDays) ||
      !Number.isSafeInteger(maxExpiryDays) ||
      defaultExpiryDays < 7 ||
      defaultExpiryDays > 90 ||
      maxExpiryDays < defaultExpiryDays ||
      maxExpiryDays > 365
    ) {
      setErrKey("api.invalidPlatformSetting");
      return;
    }

    setBusyKey("setting:update");
    setErrKey("");
    setNoticeKey("");
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entity: "setting",
          id: PLATFORM_SETTINGS_ENTITY_ID,
          action: "update",
          campaignDefaultExpiryDays: defaultExpiryDays,
          campaignMaxExpiryDays: maxExpiryDays,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrKey(apiErrorKey(res.status, d?.code, "api.invalidPlatformSetting"));
        return;
      }
      const nextSettings =
        d.settings && Number.isSafeInteger(d.settings.defaultExpiryDays) && Number.isSafeInteger(d.settings.maxExpiryDays)
          ? { defaultExpiryDays: d.settings.defaultExpiryDays, maxExpiryDays: d.settings.maxExpiryDays }
          : { defaultExpiryDays, maxExpiryDays };
      settingsDirtyRef.current = false;
      setPlatformSettings(nextSettings);
      setSettingsForm({
        defaultExpiryDays: String(nextSettings.defaultExpiryDays),
        maxExpiryDays: String(nextSettings.maxExpiryDays),
      });
      setNoticeKey("admin.settingsSaved");
      await load(tab);
    } catch {
      setErrKey("api.invalidPlatformSetting");
    } finally {
      setBusyKey("");
    }
  };

  const saveSiteAvailability = async (event: React.FormEvent) => {
    event.preventDefault();
    const candidate = {
      mode: availabilityForm.mode,
      message: availabilityForm.message.trim() || null,
      startsAt: availabilityForm.startsAt ? new Date(availabilityForm.startsAt).toISOString() : null,
      endsAt: availabilityForm.endsAt ? new Date(availabilityForm.endsAt).toISOString() : null,
      updatedAt: siteAvailability.updatedAt,
    };
    const nextAvailability = parseSiteAvailabilitySettings(candidate);
    if (!nextAvailability) {
      setErrKey("api.invalidSiteAvailability");
      return;
    }
    if (nextAvailability.mode !== "online" && !window.confirm(t("admin.availabilityConfirm"))) return;

    setBusyKey("setting:availability");
    setErrKey("");
    setNoticeKey("");
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entity: "setting",
          id: PLATFORM_SETTINGS_ENTITY_ID,
          action: "availability",
          availability: nextAvailability,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrKey(apiErrorKey(res.status, d?.code, "api.invalidSiteAvailability"));
        return;
      }
      const savedAvailability = parseSiteAvailabilitySettings(d?.siteAvailability?.settings) ?? nextAvailability;
      availabilityDirtyRef.current = false;
      setSiteAvailability(savedAvailability);
      setAvailabilityForm(availabilityFormFromSettings(savedAvailability));
      setNoticeKey("admin.availabilitySaved");
      await load(tab);
    } catch {
      setErrKey("api.invalidSiteAvailability");
    } finally {
      setBusyKey("");
    }
  };

  const moderate = async (entity: ModerationEntity, id: string, action: string, extra: Record<string, unknown> = {}) => {
    if (action === "delete") {
      const label =
        entity === "application"
          ? t("admin.entityApplication")
          : entity === "contact"
            ? t("admin.entityContact")
            : entity === "report"
              ? t("admin.entityReport")
              : t("admin.entityListing");
      if (!window.confirm(t("admin.confirmDelete").replace("{entity}", label))) return;
    }
    if (action === "approve") {
      const confirmed = window.confirm(
        entity === "creator" ? t("admin.confirmCreatorApprove") : t("admin.confirmCampaignApprove"),
      );
      if (!confirmed) return;
    }
    if (action === "revoke_sessions" && !window.confirm(t("admin.confirmRevokeSessions"))) return;
    if (action === "sync" && !window.confirm(t("admin.confirmSyncBrand"))) return;

    let note: string | undefined;
    if (["reject", "suspend", "close", "review"].includes(action)) {
      const entered = window.prompt(t("admin.notePrompt"), "");
      if (entered === null) return;
      note = entered.trim() || undefined;
    }

    const actionKey = `${entity}:${id}:${action}`;
    setBusyKey(actionKey);
    setErrKey("");
    setNoticeKey("");
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entity, id, action, note, ...extra }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrKey(apiErrorKey(res.status, d?.code, "api.moderationFailed"));
        return;
      }
      await load();
      setNoticeKey("admin.moderationUpdated");
    } catch {
      setErrKey("api.moderationFailed");
    } finally {
      setBusyKey("");
    }
  };

  const lockAdmin = async () => {
    // Remove sensitive rows from memory/DOM immediately; the browser cookie is
    // independent of React state and is still sent with the logout request.
    clearAdminState();
    setErrKey("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/identity/logout", { method: "POST", credentials: "include", cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrKey(apiErrorKey(res.status, d?.code, "admin.signOutFailed"));
        return;
      }
      router.replace("/admin/sign-in");
      router.refresh();
    } catch {
      setErrKey("admin.signOutFailed");
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <section className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow" aria-labelledby="admin-dashboard-sign-in-title">
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("adminIdentity.eyebrow")}</p>
          <h1 id="admin-dashboard-sign-in-title" className="font-display mt-1 text-[28px] font-black">{t("adminIdentity.signInTitle")}</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">
            {loading ? t("admin.checking") : t("adminIdentity.signInSub")}
          </p>
          {errKey && <p role="alert" className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{t(errKey)}</p>}
          <a href="/admin/sign-in" className="mt-5 block rounded-2xl bg-[#1c1917] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-black">
            {t("adminIdentity.accountSignInLink")}
          </a>
          <a href="/admin/security" className="mt-3 block text-center text-[14px] font-bold text-[#c7431f]">
            {t("adminIdentity.securityTitle")}
          </a>
        </section>
      </div>
    );
  }

  const campaigns = listState.campaigns.rows;
  const creators = listState.creators.rows;
  const applications = listState.applications.rows;
  const contacts = listState.contacts.rows;
  const reports = listState.reports.rows;
  const auditLogs = listState.audit.rows;
  const activityRows = listState.activity.rows;
  const userRows = listState.users.rows;
  const brandRows = listState.brands.rows;
  const pendingReviews = counts.pendingReviews;
  const openReports = counts.openReports;
  const activeList = listState[tab];
  const activeRows = activeList.rows;
  const activeHasFilters = Boolean(activeList.q || activeList.filter || activeList.verificationStatus || activeList.sort !== DEFAULT_ADMIN_SORT[tab]);
  const currentSiteAvailability = effectiveSiteAvailability(siteAvailability, clientNow ? new Date(clientNow) : new Date());
  const availabilityModeLabel = (mode: SiteAvailabilityMode) =>
    mode === "maintenance"
      ? t("admin.availabilityMaintenance")
      : mode === "emergency"
        ? t("admin.availabilityEmergency")
        : t("admin.availabilityOnline");
  const availabilityStateLabel = currentSiteAvailability.isUnavailable
    ? `${availabilityModeLabel(currentSiteAvailability.effectiveMode)} · ${t("admin.availabilityActiveNow")}`
    : currentSiteAvailability.isScheduled
      ? `${availabilityModeLabel(siteAvailability.mode)} · ${t("admin.availabilityScheduled")}`
      : t("admin.availabilityOnlineNow");

  const formatDate = formatDateTime;
  const statusLabel = (status?: string | null) => (status ? localizeStatus(status) : "—");
  const roleLabel = (role?: string | null) =>
    role === "brand" ? t("dash.brandAccount") : role === "creator" ? t("dash.creatorAccount") : "—";
  const entityLabel = (entity?: string | null) =>
    entity ? localizeEntity(entity) : t("admin.adminEntity");
  const contactKindLabel = (kind?: string | null) => (kind ? localizeContactKind(kind) : "—");
  const reportReasonLabel = (reason?: string | null) =>
    reason ? localizeReportReason(reason) : "—";
  const auditActionLabel = (action?: string | null, entity?: string | null) => {
    if (!action) return "—";
    if (action === "admin.login") return t("admin.auditLogin");
    if (action === "admin.logout") return t("admin.auditLogout");
    if (action === "admin.export") return t("admin.auditExport", { entity: entityLabel(entity) });
    const match = /^moderation\.([^.]+)\.([^.]+)$/.exec(action);
    if (!match) return t("admin.auditAction.unknown");
    const actionKey = AUDIT_ACTION_KEYS[match[2]];
    return t("admin.auditModeration", {
      action: actionKey ? t(actionKey) : t("admin.auditAction.unknown"),
      entity: entityLabel(match[1]),
    });
  };
  const auditDetailEntries = (details?: string | null): Array<[string, string]> => {
    if (!details) return [];
    try {
      const parsed = JSON.parse(details) as Record<string, unknown>;
      return Object.entries(parsed).map(([detailKey, rawValue]) => {
        const labelKey = AUDIT_DETAIL_KEYS[detailKey];
        const label = labelKey ? t(labelKey) : t("admin.details");
        let value: string;
        if (rawValue === null || rawValue === undefined || rawValue === "") value = "—";
        else if (typeof rawValue === "boolean") value = rawValue ? t("admin.yes") : t("admin.no");
        else if (typeof rawValue === "number") value = formatNumber(rawValue);
        else if (detailKey === "fromStatus" || detailKey === "toStatus") {
          const text = String(rawValue);
          value = ["brand", "creator", "other"].includes(text) ? contactKindLabel(text) : statusLabel(text);
        } else if (detailKey === "targetType") value = entityLabel(String(rawValue));
        else if (detailKey === "reason") {
          const reasonKey = AUDIT_REASON_KEYS[String(rawValue)];
          value = reasonKey ? t(reasonKey) : t("common.unknown");
        } else if (detailKey === "targetId" || detailKey === "campaignId") value = String(rawValue);
        else if (detailKey === "format" && /^[a-z0-9_-]{1,20}$/i.test(String(rawValue))) value = String(rawValue).toUpperCase();
        else value = t("common.unknown");
        return [label, value] as [string, string];
      });
    } catch {
      return [[t("admin.details"), t("common.unknown")]];
    }
  };

  const activityActionLabel = (action?: string | null, entityType?: string | null) => {
    if (!action) return "—";
    const suffix = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
    const actionKey = ACTIVITY_ACTION_KEYS[suffix];
    return t("admin.activityActionFor", {
      action: actionKey ? t(actionKey) : t("admin.activityAction.unknown"),
      entity: entityLabel(entityType),
    });
  };
  const actorTypeLabel = (actorType?: string | null) =>
    actorType === "admin"
      ? t("admin.actorAdmin")
      : actorType === "system"
        ? t("admin.actorSystem")
        : actorType === "user"
          ? t("admin.actorUser")
          : "—";
  const contactSourceLabel = (source?: string | null) =>
    source === "account"
      ? t("admin.sourceAccount")
      : source === "profile"
        ? t("admin.sourceProfile")
        : source === "campaign"
          ? t("admin.sourceCampaign")
          : "—";
  const activityFieldLabels = (fields: unknown): string[] => {
    if (!Array.isArray(fields)) return [];
    return fields
      .filter((field): field is string => typeof field === "string")
      .map((field) => {
        const labelKey = ACTIVITY_FIELD_KEYS[field];
        return labelKey ? t(labelKey).replace(/\s*\*$/, "") : t("common.unknown");
      });
  };
  const activityMetadataEntries = (metadata: unknown): Array<[string, string]> => {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const entries: Array<[string, string]> = [];
    for (const [detailKey, rawValue] of Object.entries(metadata as Record<string, unknown>)) {
      const fieldKey = ACTIVITY_FIELD_KEYS[detailKey];
      const auditKey = AUDIT_DETAIL_KEYS[detailKey];
      const label = detailKey === "reviewRequired"
        ? t("admin.reviewRequired")
        : detailKey === "lifecycleAction"
          ? t("admin.action")
          : fieldKey
            ? t(fieldKey).replace(/\s*\*$/, "")
            : auditKey
              ? t(auditKey)
              : null;
      if (!label) continue;
      let value: string;
      if (rawValue === null || rawValue === undefined || rawValue === "") value = "—";
      else if (typeof rawValue === "boolean") value = rawValue ? t("admin.yes") : t("admin.no");
      else if (typeof rawValue === "number") value = formatNumber(rawValue);
      else if (detailKey === "targetType") value = entityLabel(String(rawValue));
      else if (detailKey === "lifecycleAction") {
        const action = String(rawValue);
        value = action === "pause"
          ? statusLabel("paused")
          : action === "close"
            ? statusLabel("closed")
            : action === "republish"
              ? t("dash.republishCampaign")
              : t("common.unknown");
      } else if (detailKey === "targetId") value = String(rawValue);
      else continue;
      entries.push([label, value]);
    }
    return entries;
  };

  const adminFilterOptions =
    tab === "campaigns"
      ? CAMPAIGN_REVIEW_STATUSES.map((value) => ({ value, label: statusLabel(value) }))
      : tab === "creators"
        ? CREATOR_REVIEW_STATUSES.map((value) => ({ value, label: statusLabel(value) }))
        : tab === "reports"
          ? ["open", "resolved", "dismissed"].map((value) => ({ value, label: statusLabel(value) }))
          : tab === "applications"
            ? APPLICATION_STATUSES.map((value) => ({ value, label: statusLabel(value) }))
            : tab === "contacts"
              ? ["brand", "creator", "other"].map((value) => ({ value, label: contactKindLabel(value) }))
              : tab === "activity"
                ? ACTIVITY_ENTITY_TYPES.map((value) => ({ value, label: entityLabel(value) }))
                : tab === "users"
                ? USER_ROLES.map((value) => ({ value, label: roleLabel(value) }))
                : tab === "brands"
                  ? ["active"].map((value) => ({ value, label: statusLabel(value) }))
                  : ["success", "failure"].map((value) => ({ value, label: statusLabel(value) }));
  const adminSortOptions =
    tab === "campaigns"
      ? [
          { value: "review", label: t("listing.sortReview") },
          { value: "newest", label: t("listing.sortNewest") },
          { value: "oldest", label: t("listing.sortOldest") },
          { value: "title", label: t("listing.sortTitle") },
          { value: "budget_desc", label: t("listing.sortBudgetDesc") },
          { value: "budget_asc", label: t("listing.sortBudgetAsc") },
          { value: "status", label: t("listing.sortStatus") },
        ]
      : tab === "creators"
        ? [
            { value: "review", label: t("listing.sortReview") },
            { value: "newest", label: t("listing.sortNewest") },
            { value: "oldest", label: t("listing.sortOldest") },
            { value: "name", label: t("listing.sortName") },
            { value: "followers_desc", label: t("listing.sortFollowersDesc") },
            { value: "followers_asc", label: t("listing.sortFollowersAsc") },
            { value: "status", label: t("listing.sortStatus") },
          ]
        : tab === "reports"
          ? [
              { value: "triage", label: t("listing.sortTriage") },
              { value: "newest", label: t("listing.sortNewest") },
              { value: "oldest", label: t("listing.sortOldest") },
              { value: "status", label: t("listing.sortStatus") },
            ]
          : tab === "applications"
            ? [
                { value: "newest", label: t("listing.sortNewest") },
                { value: "oldest", label: t("listing.sortOldest") },
                { value: "updated", label: t("listing.sortUpdated") },
                { value: "status", label: t("listing.sortStatus") },
              ]
            : tab === "contacts"
              ? [
                  { value: "newest", label: t("listing.sortNewest") },
                  { value: "oldest", label: t("listing.sortOldest") },
                  { value: "name", label: t("listing.sortName") },
                  { value: "kind", label: t("admin.type") },
                ]
              : tab === "activity"
                ? [
                    { value: "newest", label: t("listing.sortNewest") },
                    { value: "oldest", label: t("listing.sortOldest") },
                    { value: "action", label: t("admin.action") },
                  ]
                : tab === "users"
                ? [
                    { value: "newest", label: t("listing.sortNewest") },
                    { value: "oldest", label: t("listing.sortOldest") },
                    { value: "name", label: t("listing.sortName") },
                    { value: "email", label: t("brand.email") },
                    { value: "role", label: t("account.role") },
                  ]
                : tab === "brands"
                  ? [
                      { value: "newest", label: t("listing.sortNewest") },
                      { value: "oldest", label: t("listing.sortOldest") },
                      { value: "name", label: t("listing.sortName") },
                      { value: "status", label: t("listing.sortStatus") },
                    ]
                  : [
                  { value: "newest", label: t("listing.sortNewest") },
                  { value: "oldest", label: t("listing.sortOldest") },
                  { value: "action", label: t("admin.action") },
                  { value: "outcome", label: t("admin.outcome") },
                ];
  const adminDraftHasFilters = Boolean(
    adminDraft.q || adminDraft.filter || adminDraft.verificationStatus || adminDraft.sort !== DEFAULT_ADMIN_SORT[tab],
  );
  const adminControlClass = "w-full min-w-0 rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-3.5 py-2.5 text-[13.5px] font-semibold outline-none focus:border-[#1c1917]";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-2 flex flex-wrap justify-end gap-2">
        <a
          href="/admin/security"
          className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold"
        >
          {t("adminIdentity.securityTitle")}
        </a>
        <button
          onClick={lockAdmin}
          disabled={loading}
          className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("admin.lock")}
        </button>
      </div>
      <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("admin.internal")}</p>
      <h1 className="font-display text-[30px] font-black sm:text-[40px]">{t("admin.overview")}</h1>
      <p className="text-[14.5px] text-[#6f6862]">{t("admin.overviewSub")}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { a: counts.users, b: t("admin.users") },
          { a: counts.brands, b: t("admin.brands") },
          { a: counts.campaigns, b: t("admin.campaigns") },
          { a: counts.creators, b: t("admin.creators") },
          { a: counts.applications, b: t("admin.applications") },
          { a: counts.contacts, b: t("admin.messages") },
          { a: pendingReviews, b: t("admin.pendingReviews") },
          { a: openReports, b: t("admin.openReports") },
          { a: counts.expiredCampaigns, b: t("admin.expiredCampaigns") },
          { a: counts.activityEvents, b: t("admin.activityEvents") },
        ].map((s) => (
          <div key={s.b} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 text-center">
            <p className="font-display text-[30px] font-black">{formatNumber(s.a)}</p>
            <p className="text-[13px] font-bold text-[#6f6862]">{s.b}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13.5px] leading-relaxed text-[#57534e]">
        <b className="text-[#1c1917]">{t("admin.beforeApproving")}</b> {t("admin.approvalHelp")}
      </div>

      <section className="mt-4 rounded-2xl border border-[#e9ddc3] bg-white p-4" aria-labelledby="platform-settings-heading">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="platform-settings-heading" className="text-[16px] font-extrabold">{t("admin.platformSettings")}</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#6f6862]">{t("admin.platformSettingsHelp")}</p>
          </div>
          <p className="rounded-full bg-[#fff4de] px-3 py-1 text-[12px] font-bold text-[#6f6862]">
            {formatNumber(platformSettings.defaultExpiryDays)} / {formatNumber(platformSettings.maxExpiryDays)}
          </p>
        </div>
        <form onSubmit={savePlatformSettings} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label htmlFor="admin-default-expiry-days" className="grid gap-1 text-[12.5px] font-bold text-[#57534e]">
            {t("admin.defaultExpiryDays")}
            <input
              id="admin-default-expiry-days"
              name="campaignDefaultExpiryDays"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              required
              min={7}
              max={90}
              step={1}
              value={settingsForm.defaultExpiryDays}
              onChange={(e) => {
                settingsDirtyRef.current = true;
                setSettingsForm((current) => ({ ...current, defaultExpiryDays: e.target.value }));
              }}
              className={adminControlClass}
            />
          </label>
          <label htmlFor="admin-MaxExpiry" className="grid gap-1 text-[12.5px] font-bold text-[#57534e]">
            {t("admin.maxExpiryDays")}
            <input
              id="admin-MaxExpiry"
              name="campaignMaxExpiryDays"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              required
              min={7}
              max={365}
              step={1}
              value={settingsForm.maxExpiryDays}
              onChange={(e) => {
                settingsDirtyRef.current = true;
                setSettingsForm((current) => ({ ...current, maxExpiryDays: e.target.value }));
              }}
              className={adminControlClass}
            />
          </label>
          <button type="submit" disabled={busyKey === "setting:update" || loading} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50 sm:self-end">
            {busyKey === "setting:update" ? t("dash.saving") : t("admin.saveSettings")}
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-2xl border border-[#e9ddc3] bg-white p-4" aria-labelledby="website-availability-heading">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="website-availability-heading" className="text-[16px] font-extrabold">{t("admin.websiteAvailability")}</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#6f6862]">{t("admin.websiteAvailabilityHelp")}</p>
          </div>
          <p className={`rounded-full px-3 py-1 text-[12px] font-bold ${currentSiteAvailability.isUnavailable ? "bg-red-100 text-red-800" : currentSiteAvailability.isScheduled ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}>
            {t("admin.availabilityCurrent")}: {availabilityStateLabel}
          </p>
        </div>
        <form onSubmit={saveSiteAvailability} className="mt-3 grid gap-2 lg:grid-cols-[190px_1fr_210px_210px_auto]">
          <label htmlFor="admin-availability-mode" className="grid gap-1 text-[12.5px] font-bold text-[#57534e]">
            {t("admin.availabilityMode")}
            <select
              id="admin-availability-mode"
              name="siteAvailabilityMode"
              value={availabilityForm.mode}
              onChange={(e) => {
                availabilityDirtyRef.current = true;
                setAvailabilityForm((current) => ({ ...current, mode: e.target.value as SiteAvailabilityMode }));
              }}
              className={adminControlClass}
            >
              {SITE_AVAILABILITY_MODES.map((mode) => (
                <option key={mode} value={mode}>{availabilityModeLabel(mode)}</option>
              ))}
            </select>
          </label>
          <label htmlFor="admin-availability-message" className="grid gap-1 text-[12.5px] font-bold text-[#57534e]">
            {t("admin.availabilityMessage")}
            <input
              id="admin-availability-message"
              name="siteAvailabilityMessage"
              type="text"
              autoComplete="off"
              maxLength={500}
              value={availabilityForm.message}
              placeholder={t("admin.availabilityMessagePlaceholder")}
              onChange={(e) => {
                availabilityDirtyRef.current = true;
                setAvailabilityForm((current) => ({ ...current, message: e.target.value }));
              }}
              className={adminControlClass}
            />
          </label>
          <label htmlFor="admin-availability-starts" className="grid gap-1 text-[12.5px] font-bold text-[#57534e]">
            {t("admin.availabilityStarts")}
            <input
              id="admin-availability-starts"
              name="siteAvailabilityStartsAt"
              type="datetime-local"
              autoComplete="off"
              value={availabilityForm.startsAt}
              onChange={(e) => {
                availabilityDirtyRef.current = true;
                setAvailabilityForm((current) => ({ ...current, startsAt: e.target.value }));
              }}
              className={adminControlClass}
            />
          </label>
          <label htmlFor="admin-availability-ends" className="grid gap-1 text-[12.5px] font-bold text-[#57534e]">
            {t("admin.availabilityEnds")}
            <input
              id="admin-availability-ends"
              name="siteAvailabilityEndsAt"
              type="datetime-local"
              autoComplete="off"
              value={availabilityForm.endsAt}
              onChange={(e) => {
                availabilityDirtyRef.current = true;
                setAvailabilityForm((current) => ({ ...current, endsAt: e.target.value }));
              }}
              className={adminControlClass}
            />
          </label>
          <button type="submit" disabled={busyKey === "setting:availability" || loading} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50 lg:self-end">
            {busyKey === "setting:availability" ? t("dash.saving") : t("admin.saveAvailability")}
          </button>
        </form>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[#e9ddc3] bg-white p-3 lg:sticky lg:top-5" aria-label={t("admin.internal")}>
          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1" aria-label={t("admin.overview")}>
        {([
          { id: "campaigns", label: t("admin.campaigns") },
          { id: "creators", label: t("admin.creators") },
          { id: "users", label: t("admin.users") },
          { id: "brands", label: t("admin.brands") },
          { id: "reports", label: `${t("admin.reports")}${openReports ? ` (${formatNumber(openReports)})` : ""}` },
          { id: "applications", label: t("admin.applications") },
          { id: "contacts", label: t("admin.contacts") },
          { id: "audit", label: t("admin.auditLog") },
          { id: "activity", label: t("admin.activityEvents") },
        ] as Array<{ id: Tab; label: string }>).map((item) => (
          <button
            key={item.id}
            onClick={() => switchTab(item.id)}
            aria-pressed={tab === item.id}
            className={`shrink-0 rounded-full px-5 py-2.5 text-[14px] font-bold ${tab === item.id ? "bg-[#1c1917] text-white" : "bg-white border border-[#e9ddc3]"}`}
          >
            {item.label}
          </button>
        ))}
          </nav>
        </aside>
        <main className="min-w-0">
      <form onSubmit={applyAdminFilters} className="mt-4 grid gap-2 rounded-2xl border border-[#e9ddc3] bg-white p-3 md:grid-cols-2 xl:grid-cols-[1fr_190px_190px_190px_auto]">
        <label htmlFor="admin-search">
          <span className="sr-only">{t("listing.searchLabel")}</span>
          <input id="admin-search" name="q" type="search" autoComplete="off" value={adminDraft.q} onChange={(e) => setAdminDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("listing.searchItems")} className={adminControlClass} />
        </label>
        <label htmlFor="admin-filter">
          <span className="sr-only">{tab === "contacts" ? t("admin.type") : tab === "audit" ? t("admin.outcome") : tab === "activity" ? t("admin.entity") : tab === "users" ? t("account.role") : t("listing.filterStatus")}</span>
          <select id="admin-filter" name="filter" autoComplete="off" value={adminDraft.filter} onChange={(e) => setAdminDraft((current) => ({ ...current, filter: e.target.value }))} className={adminControlClass}>
            <option value="">{tab === "contacts" ? t("admin.type") : tab === "audit" ? t("admin.outcome") : tab === "activity" ? t("admin.allEntityTypes") : tab === "users" ? t("admin.allRoles") : t("listing.allStatuses")}</option>
            {adminFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {(tab === "campaigns" || tab === "creators" || tab === "users" || tab === "activity") && (
          <label htmlFor="admin-verification-filter">
            <span className="sr-only">{tab === "activity" ? t("admin.actor") : t("admin.verification")}</span>
            <select id="admin-verification-filter" name={tab === "activity" ? "actorType" : "verificationStatus"} autoComplete="off" value={adminDraft.verificationStatus} onChange={(e) => setAdminDraft((current) => ({ ...current, verificationStatus: e.target.value }))} className={adminControlClass}>
              <option value="">{tab === "activity" ? t("admin.allActorTypes") : t("listing.allVerification")}</option>
              {tab === "activity"
                ? ACTIVITY_ACTOR_TYPES.map((actorType) => <option key={actorType} value={actorType}>{actorTypeLabel(actorType)}</option>)
                : (tab === "users" ? ["verified", "unverified"] : VERIFICATION_STATUSES).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
          </label>
        )}
        <label htmlFor="admin-sort">
          <span className="sr-only">{t("listing.sort")}</span>
          <select id="admin-sort" name="sort" autoComplete="off" value={adminDraft.sort} onChange={(e) => setAdminDraft((current) => ({ ...current, sort: e.target.value }))} className={adminControlClass}>
            {adminSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={loading} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">
            {loading ? t("common.loading") : t("listing.searchLabel")}
          </button>
          {(adminDraftHasFilters || activeHasFilters) && (
            <button type="button" disabled={loading} onClick={clearAdminFilters} className="rounded-xl border border-[#e9ddc3] px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50">
              {t("listing.clearFilters")}
            </button>
          )}
          <button type="button" disabled={loading || exporting} onClick={() => void exportAdminRows()} className="rounded-xl border border-[#1c1917] bg-white px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50">
            {exporting ? t("admin.exporting") : t("admin.exportCsv")}
          </button>
        </div>
      </form>

      {noticeKey && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[13.5px] font-bold text-green-800">{t(noticeKey)}</p>}
      {errKey && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-bold text-red-700">{t(errKey)}</p>}

      {tab === "activity" && (
        <p className="mt-4 rounded-xl border border-[#d9e8dc] bg-[#f7fbf7] px-4 py-3 text-[13.5px] font-semibold leading-relaxed text-[#31543b]">
          {t("admin.activityHelp")}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e9ddc3] bg-white">
        {tab === "campaigns" && (
          <table className="w-full min-w-[980px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.campaign")}</th>
                <th scope="col" className="p-4">{t("admin.businessContact")}</th>
                <th scope="col" className="p-4">{t("admin.budgetDetails")}</th>
                <th scope="col" className="p-4">{t("admin.verification")}</th>
                <th scope="col" className="p-4">{t("admin.status")}</th>
                <th scope="col" className="p-4">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c: any) => {
                const busy = busyKey.startsWith(`campaign:${c.id}:`);
                const websiteLink = c.website ? normalizeProfileUrl(c.website, "Instagram") : null;
                const effectiveDeadline = c.deadlineAt ?? c.expiresAt;
                const deadlinePassed = dateHasPassed(c.expiresAt, clientNow ?? 0);
                const campaignExpired =
                  c.status === "expired" || (["pending", "open", "paused"].includes(c.status) && deadlinePassed);
                return (
                  <tr key={c.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[260px] p-4">
                      <p className="font-bold">{c.title}</p>
                      {c.description && <p className="mt-1 line-clamp-3 text-[12.5px] text-[#6f6862]">{c.description}</p>}
                      <p className="mt-1 text-[11.5px] text-[#6f6862]">{formatDate(c.createdAt)}</p>
                      {effectiveDeadline && (
                        <p className="mt-1 text-[11.5px] font-semibold text-[#6f6862]">
                          {t(campaignExpired ? "dash.expiredOn" : "admin.deadlineDate")}: {formatDate(effectiveDeadline)}
                        </p>
                      )}
                      {c.updatedAt && <p className="mt-0.5 text-[11.5px] text-[#6f6862]">{t("dash.updatedOn")}: {formatDate(c.updatedAt)}</p>}
                      {c.brandId && <p className="mt-0.5 break-all text-[11px] text-[#6f6862]">{t("admin.entityBrand")}: {c.brandId}</p>}
                    </td>
                    <td className="max-w-[230px] p-4">
                      <p className="font-semibold">{c.businessName}</p>
                      {c.contactName && <p>{c.contactName}</p>}
                      <div className="grid gap-1">
                        {c.phone && <ContactValue value={c.phone} />}
                        {c.email && <ContactValue value={c.email} />}
                      </div>
                      {(c.emailSource || c.phoneSource) && (
                        <p className="mt-1 text-[11.5px] font-semibold text-[#6f6862]">
                          {t("admin.contactSource")}: {[c.emailSource ? `${t("brand.email")} — ${contactSourceLabel(c.emailSource)}` : "", c.phoneSource ? `${t("brand.phone")} — ${contactSourceLabel(c.phoneSource)}` : ""].filter(Boolean).join(" • ")}
                        </p>
                      )}
                      {c.website && (
                        websiteLink ? (
                          <a href={websiteLink} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[12px] font-semibold text-[#c7431f] hover:underline">
                            {c.website}
                          </a>
                        ) : (
                          <span className="mt-1 block break-all text-[12px] font-semibold text-stone-600">{c.website}</span>
                        )
                      )}
                    </td>
                    <td className="p-4">
                      <p className="font-bold">{formatCurrency(c.budget || 0)}</p>
                      <p className="text-[12.5px] text-[#6f6862]">{[c.promotionType ? promo(c.promotionType) : "", c.category ? opt(c.category) : "", c.language ? opt(c.language) : "", c.location, c.format ? opt(c.format) : ""].filter(Boolean).join(" • ")}</p>
                    </td>
                    <td className="max-w-[220px] p-4">
                      <StatusPill status={c.verificationStatus || "unverified"} />
                      {c.verificationCode && <p className="mt-2 font-mono text-[13px] font-black tracking-wide">{c.verificationCode}</p>}
                      {c.reviewedAt && <p className="mt-1 text-[11.5px] text-[#6f6862]">{t("admin.reviewed")} {formatDate(c.reviewedAt)}</p>}
                      {c.moderationNote && <p className="mt-1 text-[12px] text-[#6f6862]">{t("admin.note")}: {c.moderationNote}</p>}
                    </td>
                    <td className="p-4"><StatusPill status={campaignExpired ? "expired" : c.status} /></td>
                    <td className="p-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {c.publicLive === true && !campaignExpired && (
                          <LivePageLink href={`/campaigns/${c.id}`}>{t("detail.viewCampaign")}</LivePageLink>
                        )}
                        {!deadlinePassed && c.status !== "open" && (
                          <ActionButton tone="primary" disabled={busy} onClick={() => moderate("campaign", c.id, "approve")}>{t("admin.approveOpen")}</ActionButton>
                        )}
                        {!deadlinePassed && (c.status !== "pending" || !c.verificationCode) && (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("campaign", c.id, "review")}>
                            {c.status === "pending" ? t("admin.issueCode") : t("admin.sendToReview")}
                          </ActionButton>
                        )}
                        {c.status === "pending" && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("campaign", c.id, "reject")}>{t("admin.reject")}</ActionButton>
                        )}
                        {!campaignExpired && (c.status === "open" || c.status === "paused") && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("campaign", c.id, "suspend")}>{t("admin.suspend")}</ActionButton>
                        )}
                        {!campaignExpired && c.status === "open" && (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("campaign", c.id, "close")}>{t("admin.close")}</ActionButton>
                        )}
                        <ActionButton tone="danger" disabled={busy} onClick={() => moderate("campaign", c.id, "delete")}>{t("admin.delete")}</ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "creators" && (
          <table className="w-full min-w-[1120px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.creatorContact")}</th>
                <th scope="col" className="p-4">{t("admin.socialProfiles")}</th>
                <th scope="col" className="p-4">{t("admin.details")}</th>
                <th scope="col" className="p-4">{t("admin.followers")}</th>
                <th scope="col" className="p-4">{t("admin.verification")}</th>
                <th scope="col" className="p-4">{t("admin.status")}</th>
                <th scope="col" className="p-4">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c: any) => {
                const busy = busyKey.startsWith(`creator:${c.id}:`);
                const followerValue = verifiedFollowers[c.id] ?? String(c.verifiedFollowers ?? c.followers ?? 0);
                const creatorLive = c.publicLive === true;
                return (
                  <tr key={c.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[220px] p-4">
                      <p className="font-bold">{c.name}</p>
                      <div className="grid gap-1">
                        {c.phone && <ContactValue value={c.phone} />}
                        {c.email && <ContactValue value={c.email} />}
                      </div>
                      {(c.emailSource || c.phoneSource) && (
                        <p className="mt-1 text-[11.5px] font-semibold text-[#6f6862]">
                          {t("admin.contactSource")}: {[c.emailSource ? `${t("brand.email")} — ${contactSourceLabel(c.emailSource)}` : "", c.phoneSource ? `${t("brand.phone")} — ${contactSourceLabel(c.phoneSource)}` : ""].filter(Boolean).join(" • ")}
                        </p>
                      )}
                      <p className="mt-1 text-[11.5px] text-[#6f6862]">{formatDate(c.createdAt)}</p>
                      {(c.listedAt || c.status !== "incomplete") && (
                        <p className="mt-0.5 text-[11.5px] font-semibold text-[#6f6862]">{t("admin.listedDate")}: {formatDate(c.listedAt ?? c.createdAt)}</p>
                      )}
                      {c.updatedAt && <p className="mt-0.5 text-[11.5px] text-[#6f6862]">{t("dash.updatedOn")}: {formatDate(c.updatedAt)}</p>}
                    </td>
                    <td className="p-4"><ProfileLinks links={[{ value: c.profileUrl, kind: "profile" }, { value: c.instagram, kind: "instagram" }, { value: c.youtube, kind: "youtube" }]} platform={c.platform} /></td>
                    <td className="max-w-[260px] p-4">
                      <p>{[c.platform ? platform(c.platform) : "", c.category ? opt(c.category) : "", c.languages ? opt(c.languages) : "", c.location, c.contentTypes ? opt(c.contentTypes) : ""].filter(Boolean).join(" • ")}</p>
                      {c.bio && <p className="mt-1 line-clamp-3 text-[12.5px] text-[#6f6862]">{c.bio}</p>}
                    </td>
                    <td className="min-w-[170px] p-4">
                      <p className="text-[12.5px] text-[#6f6862]">{t("dash.claimedFollowers")}: {formatNumber(c.followers || 0)}</p>
                      <label htmlFor={`verified-followers-${c.id}`} className="mt-2 block text-[11.5px] font-bold text-[#57534e]">
                        {t("admin.verifiedCount")}
                      </label>
                      <input
                        id={`verified-followers-${c.id}`}
                        name="verifiedFollowers"
                        autoComplete="off"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100000000}
                        value={followerValue}
                        onChange={(e) => setVerifiedFollowers((values) => ({ ...values, [c.id]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-[#e9ddc3] px-2.5 py-2 text-[13px]"
                      />
                    </td>
                    <td className="max-w-[220px] p-4">
                      <StatusPill status={c.verificationStatus || "unverified"} />
                      {c.verificationCode && <p className="mt-2 font-mono text-[13px] font-black tracking-wide">{c.verificationCode}</p>}
                      {c.reviewedAt && <p className="mt-1 text-[11.5px] text-[#6f6862]">{t("admin.reviewed")} {formatDate(c.reviewedAt)}</p>}
                      {c.moderationNote && <p className="mt-1 text-[12px] text-[#6f6862]">{t("admin.note")}: {c.moderationNote}</p>}
                    </td>
                    <td className="p-4"><StatusPill status={c.status} /></td>
                    <td className="p-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {creatorLive && <LivePageLink href={`/creators/${c.id}`}>{t("detail.viewCreator")}</LivePageLink>}
                        {c.status !== "approved" && c.status !== "incomplete" && (
                          <ActionButton
                            tone="primary"
                            disabled={busy}
                            onClick={() => moderate("creator", c.id, "approve", { verifiedFollowers: followerValue })}
                          >
                            {t("admin.approvePublish")}
                          </ActionButton>
                        )}
                        {c.status !== "incomplete" && (c.status !== "pending" || !c.verificationCode) && (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("creator", c.id, "review")}>
                            {c.status === "pending" ? t("admin.issueCode") : t("admin.sendToReview")}
                          </ActionButton>
                        )}
                        {c.status === "pending" && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("creator", c.id, "reject")}>{t("admin.reject")}</ActionButton>
                        )}
                        {c.status === "approved" && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("creator", c.id, "suspend")}>{t("admin.suspend")}</ActionButton>
                        )}
                        <ActionButton tone="danger" disabled={busy} onClick={() => moderate("creator", c.id, "delete")}>{t("admin.delete")}</ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "reports" && (
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.target")}</th>
                <th scope="col" className="p-4">{t("admin.reasonDetails")}</th>
                <th scope="col" className="p-4">{t("admin.reporter")}</th>
                <th scope="col" className="p-4">{t("admin.status")}</th>
                <th scope="col" className="p-4">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r: any) => {
                const busy = busyKey.startsWith(`report:${r.id}:`);
                const targetBusy = busyKey.startsWith(`${r.targetType}:${r.targetId}:`);
                const targetDeleted = Boolean(r.targetMissing ?? !r.targetLabel);
                return (
                  <tr key={r.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[240px] p-4">
                      <p className="font-bold">{entityLabel(r.targetType)}</p>
                      <p>{r.targetLabel || (r.targetType === "campaign" ? t("admin.deletedCampaign") : t("admin.deletedCreator"))}</p>
                      <p className="break-all text-[11.5px] text-[#6f6862]">{r.targetId}</p>
                    </td>
                    <td className="max-w-[300px] p-4">
                      <p className="font-semibold">{reportReasonLabel(r.reason)}</p>
                      {r.details && <p className="mt-1 text-[12.5px] leading-relaxed text-[#6f6862]">{r.details}</p>}
                    </td>
                    <td className="max-w-[220px] p-4">
                      {r.reporterName && <p>{r.reporterName}</p>}
                      {r.reporterContact && <ContactValue value={r.reporterContact} />}
                      {!r.reporterName && !r.reporterContact && <span className="text-stone-600">{t("admin.anonymous")}</span>}
                    </td>
                    <td className="p-4">
                      <StatusPill status={r.status} isReport />
                      <p className="mt-1 text-[11.5px] text-[#6f6862]">{formatDate(r.createdAt)}</p>
                      {r.adminNote && <p className="mt-1 text-[12px] text-[#6f6862]">{t("admin.note")}: {r.adminNote}</p>}
                    </td>
                    <td className="p-4">
                      <div className="flex max-w-[190px] flex-wrap gap-1.5">
                        {r.status === "open" ? (
                          <>
                            {!targetDeleted && r.targetType === "campaign" && (
                              <>
                                <ActionButton tone="danger" disabled={targetBusy} onClick={() => moderate("campaign", r.targetId, "suspend")}>{t("admin.suspendCampaign")}</ActionButton>
                                <ActionButton tone="warning" disabled={targetBusy} onClick={() => moderate("campaign", r.targetId, "close")}>{t("admin.closeCampaign")}</ActionButton>
                              </>
                            )}
                            {!targetDeleted && r.targetType === "creator" && (
                              <ActionButton tone="danger" disabled={targetBusy} onClick={() => moderate("creator", r.targetId, "suspend")}>{t("admin.suspendCreator")}</ActionButton>
                            )}
                            <ActionButton tone="primary" disabled={busy} onClick={() => moderate("report", r.id, "resolve")}>{t("admin.resolve")}</ActionButton>
                            <ActionButton disabled={busy} onClick={() => moderate("report", r.id, "dismiss")}>{t("admin.dismiss")}</ActionButton>
                          </>
                        ) : (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("report", r.id, "reopen")}>{t("admin.reopen")}</ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "applications" && (
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.creator")}</th>
                <th scope="col" className="p-4">{t("admin.campaign")}</th>
                <th scope="col" className="p-4">{t("admin.contactMessage")}</th>
                <th scope="col" className="p-4">{t("admin.status")}</th>
                <th scope="col" className="p-4">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a: any) => {
                const busy = busyKey.startsWith(`application:${a.id}:`);
                return (
                  <tr key={a.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[220px] p-4">
                      <p className="text-[10.5px] font-bold uppercase tracking-widest text-[#6f6862]">{t("dash.submittedName")}</p>
                      <p className="font-bold">{a.creatorName || a.creatorLabel}</p>
                      {a.currentCreatorProfile && (
                        <p className="mt-1 text-[12px] font-semibold text-[#57534e]">
                          {t("dash.currentCreatorProfile")}: {a.currentCreatorProfile.name}
                        </p>
                      )}
                      <p className="mt-1 text-[11.5px] text-[#6f6862]">{formatDate(a.createdAt)}</p>
                      {a.updatedAt && <p className="mt-0.5 text-[11.5px] text-[#6f6862]">{t("dash.updatedOn")}: {formatDate(a.updatedAt)}</p>}
                    </td>
                    <td className="max-w-[240px] p-4">{a.campaignLabel || (a.campaignMissing ? t("admin.deletedCampaign") : a.campaignId)}</td>
                    <td className="max-w-[300px] p-4">
                      {a.creatorContact && <ContactValue value={a.creatorContact} />}
                      {a.message && <p className="mt-1 text-[12.5px] leading-relaxed text-[#6f6862]">{a.message}</p>}
                      {a.quoteAmount != null && <p className="mt-1 text-[12.5px] font-semibold"><b>{t("dash.quote")}:</b> {formatCurrency(a.quoteAmount)}</p>}
                      {(a.proposedTimelineDays != null || a.proposedTimeline) && (
                        <p className="mt-1 text-[12.5px] leading-relaxed">
                          <b>{t("dash.proposedTimeline")}:</b>{" "}
                          {[a.proposedTimelineDays == null ? null : a.proposedTimelineDays === 1 ? t("dash.oneDay") : t("dash.daysCount", { days: a.proposedTimelineDays }), a.proposedTimeline].filter(Boolean).join(" • ")}
                        </p>
                      )}
                      {a.quoteAmount == null && a.proposedTimelineDays == null && !a.proposedTimeline && (
                        <p className="mt-1 text-[12px] font-semibold text-[#6f6862]">{t("dash.noProposal")}</p>
                      )}
                      {a.creatorProfileSnapshot ? (
                        <div className="mt-2 rounded-lg border border-[#d9e8dc] bg-[#f7fbf7] p-2 text-[12px] leading-relaxed">
                          <p className="font-bold text-[#31543b]">{t("dash.profileSnapshot")}</p>
                          <p className="mt-0.5 font-semibold">{a.creatorProfileSnapshot.name}</p>
                          <p>{[platform(a.creatorProfileSnapshot.platform), opt(a.creatorProfileSnapshot.category), opt(a.creatorProfileSnapshot.languages), a.creatorProfileSnapshot.location].filter(Boolean).join(" • ")}</p>
                          <p>{a.creatorProfileSnapshot.verifiedFollowers != null ? t("dash.verifiedFollowers") : t("dash.claimedFollowers")}: {formatNumber(a.creatorProfileSnapshot.effectiveFollowers ?? a.creatorProfileSnapshot.followers ?? 0)}</p>
                          {(a.snapshotCapturedAt || a.creatorProfileSnapshot.capturedAt) && (
                            <p className="text-[#6f6862]">{t("dash.snapshotCaptured", { date: formatDate(a.snapshotCapturedAt || a.creatorProfileSnapshot.capturedAt) })}</p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-[12px] font-semibold text-[#6f6862]">{t("dash.snapshotUnavailable")}</p>
                      )}
                      {a.decisionNote && <p className="mt-1 text-[12px] text-[#6f6862]">{t("dash.brandNote")}: {a.decisionNote}</p>}
                    </td>
                    <td className="p-4">
                      <StatusPill status={a.status} />
                      {a.decisionAt && <p className="mt-1 text-[11.5px] text-[#6f6862]">{t("dash.updatedOn")} {formatDate(a.decisionAt)}</p>}
                      {Array.isArray(a.statusHistory) && a.statusHistory.length > 0 && (
                        <div className="mt-2 min-w-[190px]">
                          <p className="text-[10.5px] font-bold uppercase tracking-widest text-[#6f6862]">{t("dash.statusHistory")}</p>
                          <ol className="mt-1 grid gap-1">
                            {a.statusHistory.map((event: any, index: number) => (
                              <li key={`${event.status}-${event.at}-${index}`} className="flex flex-wrap justify-between gap-x-2 text-[11px]">
                                <span className="font-bold">{statusLabel(event.status)}</span>
                                <time dateTime={event.at} className="text-[#6f6862]">{formatDate(event.at)}</time>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex max-w-[210px] flex-wrap gap-1.5">
                        {a.creatorId && (
                          <ActionButton disabled={loading} onClick={() => openAdminTabWithSearch("creators", a.creatorId)}>
                            {t("dash.viewCurrentProfile")}
                          </ActionButton>
                        )}
                        <ActionButton tone="danger" disabled={busy} onClick={() => moderate("application", a.id, "delete")}>
                          {t("admin.deleteSpam")}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "contacts" && (
          <table className="w-full min-w-[860px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.name")}</th>
                <th scope="col" className="p-4">{t("admin.type")}</th>
                <th scope="col" className="p-4">{t("admin.message")}</th>
                <th scope="col" className="p-4">{t("admin.contact")}</th>
                <th scope="col" className="p-4">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c: any) => {
                const busy = busyKey.startsWith(`contact:${c.id}:`);
                return (
                  <tr key={c.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[190px] p-4">
                      <p className="font-bold">{c.name}</p>
                      <p className="mt-1 text-[11.5px] text-[#6f6862]">{formatDate(c.createdAt)}</p>
                    </td>
                    <td className="p-4">{contactKindLabel(c.kind)}</td>
                    <td className="max-w-[320px] p-4">{c.message}</td>
                    <td className="max-w-[220px] p-4">
                      <div className="grid gap-1">
                        {c.phone && <ContactValue value={c.phone} />}
                        {c.email && <ContactValue value={c.email} />}
                        {!c.phone && !c.email && <span className="text-stone-600">—</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      <ActionButton tone="danger" disabled={busy} onClick={() => moderate("contact", c.id, "delete")}>
                        {t("admin.deleteSpam")}
                      </ActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "audit" && (
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.time")}</th>
                <th scope="col" className="p-4">{t("admin.action")}</th>
                <th scope="col" className="p-4">{t("admin.outcome")}</th>
                <th scope="col" className="p-4">{t("admin.target")}</th>
                <th scope="col" className="p-4">{t("admin.details")}</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log: any) => {
                const detailEntries = auditDetailEntries(log.details);
                return (
                  <tr key={log.id} className="border-b border-[#faf3e0] align-top">
                    <td className="whitespace-nowrap p-4 text-[12.5px] text-[#6f6862]">{formatDate(log.createdAt)}</td>
                    <td className="p-4 text-[12.5px] font-bold">{auditActionLabel(log.action, log.entity)}</td>
                    <td className="p-4"><StatusPill status={log.outcome} /></td>
                    <td className="max-w-[220px] p-4">
                      {log.entity ? <p className="font-semibold">{entityLabel(log.entity)}</p> : <span className="text-stone-600">{t("admin.adminEntity")}</span>}
                      {log.entityId && <p className="mt-1 break-all text-[11.5px] text-[#6f6862]">{log.entityId}</p>}
                    </td>
                    <td className="max-w-[360px] p-4">
                      {detailEntries.length > 0 && (
                        <dl className="grid gap-1 text-[11.5px] leading-relaxed text-[#57534e]">
                          {detailEntries.map(([label, value]) => (
                            <div key={`${label}:${value}`} className="flex flex-wrap gap-x-1.5">
                              <dt className="font-bold">{label}:</dt>
                              <dd className="break-all">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {log.ipAddress && <p className="mt-1 text-[11.5px] text-[#6f6862]">{t("admin.ipAddress")}: {log.ipAddress}</p>}
                      {detailEntries.length === 0 && !log.ipAddress && <span className="text-stone-600">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "activity" && (
          <table className="w-full min-w-[1180px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.time")}</th>
                <th scope="col" className="p-4">{t("admin.action")}</th>
                <th scope="col" className="p-4">{t("admin.actor")}</th>
                <th scope="col" className="p-4">{t("admin.owner")}</th>
                <th scope="col" className="p-4">{t("admin.entity")}</th>
                <th scope="col" className="p-4">{t("admin.statusChange")}</th>
                <th scope="col" className="p-4">{t("admin.changedFields")}</th>
              </tr>
            </thead>
            <tbody>
              {activityRows.map((event: any) => {
                const fields = activityFieldLabels(event.changedFields);
                const metadataEntries = activityMetadataEntries(event.metadata);
                return (
                  <tr key={event.id} className="border-b border-[#faf3e0] align-top">
                    <td className="whitespace-nowrap p-4 text-[12.5px] text-[#6f6862]">{formatDate(event.createdAt)}</td>
                    <td className="max-w-[220px] p-4 text-[12.5px] font-bold">{activityActionLabel(event.action, event.entityType)}</td>
                    <td className="max-w-[220px] p-4">
                      <p className="font-semibold">{actorTypeLabel(event.actorType)}</p>
                      {event.actorName && <p className="mt-0.5">{event.actorName}</p>}
                      {event.actorEmail && <p className="mt-0.5 break-all text-[11.5px] text-[#6f6862]">{event.actorEmail}</p>}
                      {event.actorUserId && <p className="mt-0.5 break-all text-[11px] text-[#6f6862]">{event.actorUserId}</p>}
                    </td>
                    <td className="max-w-[220px] p-4">
                      {event.ownerName ? <p className="font-semibold">{event.ownerName}</p> : <span className="text-stone-600">—</span>}
                      {event.ownerEmail && <p className="mt-0.5 break-all text-[11.5px] text-[#6f6862]">{event.ownerEmail}</p>}
                      {event.ownerUserId && <p className="mt-0.5 break-all text-[11px] text-[#6f6862]">{event.ownerUserId}</p>}
                    </td>
                    <td className="max-w-[220px] p-4">
                      <p className="font-semibold">{entityLabel(event.entityType)}</p>
                      <p className="mt-0.5 break-all text-[11px] text-[#6f6862]"><span className="font-bold">{t("admin.entityId")}:</span> {event.entityId}</p>
                    </td>
                    <td className="min-w-[150px] p-4">
                      {(event.fromStatus || event.toStatus) ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {event.fromStatus && <StatusPill status={event.fromStatus} />}
                          {event.fromStatus && event.toStatus && <span aria-hidden="true">→</span>}
                          {event.toStatus && <StatusPill status={event.toStatus} />}
                        </div>
                      ) : <span className="text-stone-600">—</span>}
                    </td>
                    <td className="max-w-[340px] p-4">
                      {fields.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {fields.map((field: string, index: number) => (
                            <span key={`${field}-${index}`} className="rounded-full bg-[#fff4de] px-2 py-0.5 text-[11px] font-bold text-[#57534e]">{field}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] font-semibold text-[#6f6862]">{t("admin.noChangedFields")}</p>
                      )}
                      {metadataEntries.length > 0 && (
                        <dl className="mt-2 grid gap-1 text-[11.5px] leading-relaxed text-[#57534e]">
                          {metadataEntries.map(([label, value]) => (
                            <div key={`${label}:${value}`} className="flex flex-wrap gap-x-1.5">
                              <dt className="font-bold">{label}:</dt>
                              <dd className="break-all">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "users" && (
          <table className="w-full min-w-[980px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.userContact")}</th>
                <th scope="col" className="p-4">{t("admin.account")}</th>
                <th scope="col" className="p-4">{t("admin.activity")}</th>
                <th scope="col" className="p-4">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {userRows.map((u: any) => {
                const busy = busyKey.startsWith(`user:${u.id}:`);
                return (
                  <tr key={u.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[250px] p-4">
                      <p className="font-bold">{u.name}</p>
                      <div className="mt-1 grid gap-1">
                        <ContactValue value={u.email} />
                        {u.phone && <ContactValue value={u.phone} />}
                      </div>
                      <p className="mt-1 text-[11.5px] text-[#6f6862]">{formatDate(u.createdAt)}</p>
                      {u.updatedAt && <p className="mt-0.5 text-[11.5px] text-[#6f6862]">{t("dash.updatedOn")}: {formatDate(u.updatedAt)}</p>}
                      <p className="break-all text-[11px] text-[#6f6862]">{u.id}</p>
                    </td>
                    <td className="max-w-[260px] p-4">
                      <p className="font-semibold">{roleLabel(u.role)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-bold text-[#6f6862]">{t("brand.email")}:</span>
                        <StatusPill status={u.emailVerifiedAt ? "verified" : "unverified"} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-bold text-[#6f6862]">{t("admin.brandProfile")}:</span>
                        {u.hasBrandProfile ? <StatusPill status={u.brandStatus || "active"} /> : <span>{t("admin.no")}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-bold text-[#6f6862]">{t("admin.creatorProfile")}:</span>
                        {u.creatorProfile ? (
                          <>
                            <StatusPill status={u.creatorProfile.status} />
                            <StatusPill status={u.creatorProfile.verificationStatus} />
                          </>
                        ) : <span>{t("admin.no")}</span>}
                      </div>
                    </td>
                    <td className="min-w-[180px] p-4">
                      <p>{t("admin.campaignCount", { count: formatNumber(u.campaignCount || 0) })}</p>
                      <p className="mt-1">{t("admin.applicationCount", { count: formatNumber(u.applicationCount || 0) })}</p>
                      <p className="mt-1">{t("admin.activeSessions", { count: formatNumber(u.activeSessionCount || 0) })}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        <ActionButton tone="danger" disabled={busy} onClick={() => moderate("user", u.id, "revoke_sessions")}>
                          {t("admin.revokeSessions")}
                        </ActionButton>
                        {u.hasBrandProfile && (
                          <ActionButton disabled={loading} onClick={() => openAdminTabWithSearch("brands", u.brandProfileId ?? u.id)}>
                            {t("admin.viewBrand")}
                          </ActionButton>
                        )}
                        {u.creatorProfile && (
                          <ActionButton disabled={loading} onClick={() => openAdminTabWithSearch("creators", u.creatorProfile.id)}>
                            {t("detail.viewCreator")}
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "brands" && (
          <table className="w-full min-w-[980px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#6f6862]">
                <th scope="col" className="p-4">{t("admin.brandContact")}</th>
                <th scope="col" className="p-4">{t("admin.linkedAccount")}</th>
                <th scope="col" className="p-4">{t("admin.activity")}</th>
                <th scope="col" className="p-4">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {brandRows.map((b: any) => {
                const busy = busyKey.startsWith(`brand:${b.id}:`) || busyKey.startsWith(`user:${b.userId}:`);
                return (
                  <tr key={b.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[250px] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{b.name}</p>
                        <StatusPill status={b.status} />
                      </div>
                      <div className="mt-1 grid gap-1">
                        {b.phone && <ContactValue value={b.phone} />}
                        {b.email && <ContactValue value={b.email} />}
                        {!b.phone && !b.email && <span className="text-stone-600">—</span>}
                      </div>
                      <p className="mt-1 text-[11.5px] font-semibold text-[#6f6862]">{t("admin.contactSource")}: {contactSourceLabel("account")}</p>
                      <p className="mt-1 text-[11.5px] text-[#6f6862]">{formatDate(b.createdAt)}</p>
                      {b.updatedAt && <p className="mt-0.5 text-[11.5px] text-[#6f6862]">{t("dash.updatedOn")}: {formatDate(b.updatedAt)}</p>}
                      <p className="break-all text-[11px] text-[#6f6862]">{b.id}</p>
                    </td>
                    <td className="max-w-[260px] p-4">
                      <p className="font-semibold">{b.accountName}</p>
                      <p className="mt-0.5 text-[12.5px] text-[#57534e]">{roleLabel(b.accountRole)}</p>
                      <div className="mt-1 grid gap-1">
                        <ContactValue value={b.accountEmail} />
                        {b.accountPhone && <ContactValue value={b.accountPhone} />}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-bold text-[#6f6862]">{t("brand.email")}:</span>
                        <StatusPill status={b.accountEmailVerifiedAt ? "verified" : "unverified"} />
                      </div>
                    </td>
                    <td className="min-w-[190px] p-4">
                      <p>{t("admin.campaignCount", { count: formatNumber(b.campaignCount || 0) })}</p>
                      <p className="mt-1">{t("admin.receivedApplicationCount", { count: formatNumber(b.applicationsReceivedCount || 0) })}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex max-w-[230px] flex-wrap gap-1.5">
                        <ActionButton tone="warning" disabled={busy} onClick={() => moderate("brand", b.id, "sync")}>
                          {t("admin.syncBrandContact")}
                        </ActionButton>
                        <ActionButton tone="danger" disabled={busy} onClick={() => moderate("user", b.userId, "revoke_sessions")}>
                          {t("admin.revokeSessions")}
                        </ActionButton>
                        <ActionButton disabled={loading} onClick={() => openAdminTabWithSearch("users", b.userId)}>
                          {t("admin.viewUser")}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {activeRows.length === 0 && (
          <p className="p-8 text-center text-[14px] text-[#6f6862]">{loading ? t("common.loading") : activeHasFilters ? t("listing.noMatches") : t("admin.empty")}</p>
        )}
      </div>
      <ListingPagination
        loaded={activeRows.length}
        total={activeList.pagination?.total ?? activeRows.length}
        hasMore={Boolean(activeList.pagination?.hasMore)}
        loading={loading}
        onLoadMore={loadMoreAdminRows}
      />
        </main>
      </div>
    </div>
  );
}
