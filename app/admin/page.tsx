"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/frontend/i18n";
import { ListingPagination } from "@/frontend/components/ListingState";
import { appendUniqueById, isListPagination, type ListPagination } from "@/frontend/api-json";
import {
  APPLICATION_STATUSES,
  CAMPAIGN_REVIEW_STATUSES,
  CREATOR_REVIEW_STATUSES,
  VERIFICATION_STATUSES,
} from "@/shared/constants";

type Tab = "campaigns" | "creators" | "reports" | "applications" | "contacts" | "audit";
type ModerationEntity = "campaign" | "creator" | "report" | "application" | "contact";

interface AdminCounts {
  campaigns: number;
  creators: number;
  applications: number;
  contacts: number;
  reports: number;
  auditLogs: number;
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
};
const emptyAdminCounts = (): AdminCounts => ({
  campaigns: 0,
  creators: 0,
  applications: 0,
  contacts: 0,
  reports: 0,
  auditLogs: 0,
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
});
const adminEntityForTab = (tab: Tab) => (tab === "audit" ? "auditLogs" : tab);
const adminFilterParamForTab = (tab: Tab) => (tab === "contacts" ? "kind" : tab === "audit" ? "outcome" : "status");

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
  const { t } = useLang();
  if (!status) return <span className="text-stone-400">—</span>;
  const key = `status.${status}`;
  const label = t(key);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold ${statusClass(status, isReport)}`}>
      {label === key ? status : label}
    </span>
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

function ProfileLinks({ links }: { links: Array<string | null | undefined> }) {
  const uniqueLinks = [...new Set(links.filter(Boolean) as string[])];
  if (uniqueLinks.length === 0) return <span className="text-stone-400">—</span>;
  return (
    <div className="grid max-w-[230px] gap-1">
      {uniqueLinks.map((link) => (
        <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="break-all text-[12px] font-semibold text-[#e4572e] hover:underline">
          {link}
        </a>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { t, opt, promo, platform, apiErrorKey, formatNumber, formatCurrency, formatDateTime } = useLang();
  const [listState, setListState] = useState<Record<Tab, AdminListState>>(emptyAdminListState);
  const [counts, setCounts] = useState<AdminCounts>(emptyAdminCounts);
  const [tab, setTab] = useState<Tab>("campaigns");
  const [adminDraft, setAdminDraft] = useState<AdminQuery>(() => emptyAdminQuery("campaigns"));
  const adminRequestRef = useRef<Record<string, number>>({});
  const [key, setKey] = useState("");
  const [totp, setTotp] = useState("");
  const [authed, setAuthed] = useState(false);
  const [errKey, setErrKey] = useState("");
  const [noticeKey, setNoticeKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [verifiedFollowers, setVerifiedFollowers] = useState<Record<string, string>>({});

  const clearAdminState = () => {
    setListState(emptyAdminListState());
    setCounts(emptyAdminCounts());
    setAdminDraft(emptyAdminQuery("campaigns"));
    setVerifiedFollowers({});
    setTab("campaigns");
    setKey("");
    setTotp("");
    setNoticeKey("");
    setBusyKey("");
    setAuthed(false);
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
    if ((targetTab === "campaigns" || targetTab === "creators") && activeQuery.verificationStatus) {
      params.set("verificationStatus", activeQuery.verificationStatus);
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
        if (res.status === 401 || !authed) {
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

  useEffect(() => { void Promise.resolve().then(() => load("campaigns")); }, []);

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

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrKey("");
    setNoticeKey("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: key, totp: totp.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListState(emptyAdminListState());
        setCounts(emptyAdminCounts());
        setAdminDraft(emptyAdminQuery("campaigns"));
        setVerifiedFollowers({});
        setTotp("");
        setAuthed(false);
        setErrKey(apiErrorKey(res.status, d?.code, "api.adminWrongCredentials"));
        setLoading(false);
        return;
      }
      setKey("");
      setTotp("");
      await load();
    } catch {
      setListState(emptyAdminListState());
      setCounts(emptyAdminCounts());
      setAdminDraft(emptyAdminQuery("campaigns"));
      setVerifiedFollowers({});
      setTotp("");
      setAuthed(false);
      setErrKey("api.adminLoginFailed");
      setLoading(false);
    }
  };

  const lockAdmin = async () => {
    // Remove sensitive rows from memory/DOM immediately; the browser cookie is
    // independent of React state and is still sent with the logout request.
    clearAdminState();
    setErrKey("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/logout", { method: "POST", credentials: "include", cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErrKey(apiErrorKey(res.status, d?.code, "admin.signOutFailed"));
    } catch {
      setErrKey("admin.signOutFailed");
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <form
          onSubmit={login}
          className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow"
        >
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">{t("admin.ownerOnly")}</p>
          <h1 className="font-display mt-1 text-[28px] font-black">{t("admin.loginTitle")}</h1>
          <p className="mt-1 text-[14px] text-[#78716c]">{t("admin.loginSub")}</p>
          <input
            type="password"
            maxLength={256}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("admin.passwordPlaceholder")}
            aria-label={t("admin.passwordPlaceholder")}
            autoComplete="current-password"
            className="mt-5 w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]"
          />
          <input
            type="text"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/[^0-9 ]/g, "").slice(0, 7))}
            placeholder={t("admin.totpPlaceholder")}
            aria-label={t("admin.totpPlaceholder")}
            autoComplete="one-time-code"
            inputMode="numeric"
            className="mt-3 w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]"
          />
          {errKey && <p role="alert" className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{t(errKey)}</p>}
          <button disabled={loading || !key} className="mt-4 w-full rounded-2xl bg-[#1c1917] py-3.5 text-[15.5px] font-extrabold text-white disabled:opacity-50">
            {loading ? t("admin.checking") : t("admin.open")}
          </button>
        </form>
      </div>
    );
  }

  const campaigns = listState.campaigns.rows;
  const creators = listState.creators.rows;
  const applications = listState.applications.rows;
  const contacts = listState.contacts.rows;
  const reports = listState.reports.rows;
  const auditLogs = listState.audit.rows;
  const pendingReviews = counts.pendingReviews;
  const openReports = counts.openReports;
  const activeList = listState[tab];
  const activeRows = activeList.rows;
  const activeHasFilters = Boolean(activeList.q || activeList.filter || activeList.verificationStatus || activeList.sort !== DEFAULT_ADMIN_SORT[tab]);

  const formatDate = formatDateTime;
  const statusLabel = (status?: string | null) => {
    if (!status) return "—";
    const key = `status.${status}`;
    const label = t(key);
    return label === key ? status : label;
  };
  const entityLabel = (entity?: string | null) => {
    switch (entity) {
      case "campaign":
        return t("admin.targetCampaign");
      case "creator":
        return t("admin.targetCreator");
      case "report":
        return t("admin.entityReport");
      case "application":
        return t("admin.entityApplication");
      case "contact":
        return t("admin.entityContact");
      default:
        return entity || t("admin.adminEntity");
    }
  };
  const contactKindLabel = (kind?: string | null) => {
    switch (kind) {
      case "brand":
        return t("cont.kindBrand");
      case "creator":
        return t("cont.kindCreator");
      case "other":
        return t("cont.kindOther");
      default:
        return kind || "—";
    }
  };
  const reportReasonLabel = (reason?: string | null) => {
    if (!reason) return "—";
    const key = `report.${reason}`;
    const label = t(key);
    return label === key ? reason : label;
  };
  const auditActionLabel = (action?: string | null) => {
    if (!action) return "—";
    if (action === "admin.login") return t("admin.auditLogin");
    if (action === "admin.logout") return t("admin.auditLogout");
    const match = /^moderation\.([^.]+)\.([^.]+)$/.exec(action);
    if (!match) return action;
    const actionKey = `admin.auditAction.${match[2]}`;
    const actionLabel = t(actionKey);
    return t("admin.auditModeration")
      .replace("{action}", actionLabel === actionKey ? match[2] : actionLabel)
      .replace("{entity}", entityLabel(match[1]));
  };
  const auditDetailEntries = (details?: string | null): Array<[string, string]> => {
    if (!details) return [];
    try {
      const parsed = JSON.parse(details) as Record<string, unknown>;
      return Object.entries(parsed).map(([detailKey, rawValue]) => {
        const labelKey = `admin.auditDetail.${detailKey}`;
        const label = t(labelKey);
        let value: string;
        if (rawValue === null || rawValue === undefined || rawValue === "") value = "—";
        else if (typeof rawValue === "boolean") value = rawValue ? t("admin.yes") : t("admin.no");
        else if (typeof rawValue === "number") value = formatNumber(rawValue);
        else if (detailKey === "fromStatus" || detailKey === "toStatus") {
          const text = String(rawValue);
          value = ["brand", "creator", "other"].includes(text) ? contactKindLabel(text) : statusLabel(text);
        } else if (detailKey === "targetType") value = entityLabel(String(rawValue));
        else if (detailKey === "reason") {
          const reasonKey = `admin.auditReason.${String(rawValue)}`;
          const reasonLabel = t(reasonKey);
          value = reasonLabel === reasonKey ? String(rawValue) : reasonLabel;
        } else value = String(rawValue);
        return [label === labelKey ? detailKey : label, value] as [string, string];
      });
    } catch {
      return [[t("admin.details"), details]];
    }
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
      <div className="mb-2 flex justify-end">
        <button
          onClick={lockAdmin}
          disabled={loading}
          className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("admin.lock")}
        </button>
      </div>
      <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">{t("admin.internal")}</p>
      <h1 className="font-display text-[30px] font-black sm:text-[40px]">{t("admin.overview")}</h1>
      <p className="text-[14.5px] text-[#78716c]">{t("admin.overviewSub")}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { a: counts.campaigns, b: t("admin.campaigns") },
          { a: counts.creators, b: t("admin.creators") },
          { a: counts.applications, b: t("admin.applications") },
          { a: counts.contacts, b: t("admin.messages") },
          { a: pendingReviews, b: t("admin.pendingReviews") },
          { a: openReports, b: t("admin.openReports") },
        ].map((s) => (
          <div key={s.b} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 text-center">
            <p className="font-display text-[30px] font-black">{formatNumber(s.a)}</p>
            <p className="text-[13px] font-bold text-[#78716c]">{s.b}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13.5px] leading-relaxed text-[#57534e]">
        <b className="text-[#1c1917]">{t("admin.beforeApproving")}</b> {t("admin.approvalHelp")}
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
        {([
          { id: "campaigns", label: t("admin.campaigns") },
          { id: "creators", label: t("admin.creators") },
          { id: "reports", label: `${t("admin.reports")}${openReports ? ` (${formatNumber(openReports)})` : ""}` },
          { id: "applications", label: t("admin.applications") },
          { id: "contacts", label: t("admin.contacts") },
          { id: "audit", label: t("admin.auditLog") },
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
      </div>

      <form onSubmit={applyAdminFilters} className="mt-4 grid gap-2 rounded-2xl border border-[#e9ddc3] bg-white p-3 md:grid-cols-2 xl:grid-cols-[1fr_190px_190px_190px_auto]">
        <label>
          <span className="sr-only">{t("listing.searchLabel")}</span>
          <input value={adminDraft.q} onChange={(e) => setAdminDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("listing.searchItems")} className={adminControlClass} />
        </label>
        <label>
          <span className="sr-only">{tab === "contacts" ? t("admin.type") : tab === "audit" ? t("admin.outcome") : t("listing.filterStatus")}</span>
          <select value={adminDraft.filter} onChange={(e) => setAdminDraft((current) => ({ ...current, filter: e.target.value }))} className={adminControlClass}>
            <option value="">{tab === "contacts" ? t("admin.type") : tab === "audit" ? t("admin.outcome") : t("listing.allStatuses")}</option>
            {adminFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {(tab === "campaigns" || tab === "creators") && (
          <label>
            <span className="sr-only">{t("admin.verification")}</span>
            <select value={adminDraft.verificationStatus} onChange={(e) => setAdminDraft((current) => ({ ...current, verificationStatus: e.target.value }))} className={adminControlClass}>
              <option value="">{t("listing.allVerification")}</option>
              {VERIFICATION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
          </label>
        )}
        <label>
          <span className="sr-only">{t("listing.sort")}</span>
          <select value={adminDraft.sort} onChange={(e) => setAdminDraft((current) => ({ ...current, sort: e.target.value }))} className={adminControlClass}>
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
        </div>
      </form>

      {noticeKey && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[13.5px] font-bold text-green-800">{t(noticeKey)}</p>}
      {errKey && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-bold text-red-700">{t(errKey)}</p>}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e9ddc3] bg-white">
        {tab === "campaigns" && (
          <table className="w-full min-w-[980px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
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
                return (
                  <tr key={c.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[260px] p-4">
                      <p className="font-bold">{c.title}</p>
                      {c.description && <p className="mt-1 line-clamp-3 text-[12.5px] text-[#78716c]">{c.description}</p>}
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(c.createdAt)}</p>
                    </td>
                    <td className="max-w-[230px] p-4">
                      <p className="font-semibold">{c.businessName}</p>
                      {c.contactName && <p>{c.contactName}</p>}
                      <p className="break-all text-[12px] text-[#78716c]">{c.phone || ""}{c.phone && c.email ? <br /> : null}{c.email || ""}</p>
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[12px] font-semibold text-[#e4572e] hover:underline">
                          {c.website}
                        </a>
                      )}
                    </td>
                    <td className="p-4">
                      <p className="font-bold">{formatCurrency(c.budget || 0)}</p>
                      <p className="text-[12.5px] text-[#78716c]">{[c.promotionType ? promo(c.promotionType) : "", c.category ? opt(c.category) : "", c.language ? opt(c.language) : "", c.location, c.format ? opt(c.format) : ""].filter(Boolean).join(" • ")}</p>
                    </td>
                    <td className="max-w-[220px] p-4">
                      <StatusPill status={c.verificationStatus || "unverified"} />
                      {c.verificationCode && <p className="mt-2 font-mono text-[13px] font-black tracking-wide">{c.verificationCode}</p>}
                      {c.reviewedAt && <p className="mt-1 text-[11.5px] text-[#a8a29e]">{t("admin.reviewed")} {formatDate(c.reviewedAt)}</p>}
                      {c.moderationNote && <p className="mt-1 text-[12px] text-[#78716c]">{t("admin.note")}: {c.moderationNote}</p>}
                    </td>
                    <td className="p-4"><StatusPill status={c.status} /></td>
                    <td className="p-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {c.status !== "open" && (
                          <ActionButton tone="primary" disabled={busy} onClick={() => moderate("campaign", c.id, "approve")}>{t("admin.approveOpen")}</ActionButton>
                        )}
                        {(c.status !== "pending" || !c.verificationCode) && (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("campaign", c.id, "review")}>
                            {c.status === "pending" ? t("admin.issueCode") : t("admin.sendToReview")}
                          </ActionButton>
                        )}
                        {c.status === "pending" && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("campaign", c.id, "reject")}>{t("admin.reject")}</ActionButton>
                        )}
                        {(c.status === "open" || c.status === "paused") && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("campaign", c.id, "suspend")}>{t("admin.suspend")}</ActionButton>
                        )}
                        {c.status === "open" && (
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
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
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
                return (
                  <tr key={c.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[220px] p-4">
                      <p className="font-bold">{c.name}</p>
                      <p className="break-all text-[12px] text-[#78716c]">{c.phone || ""}{c.phone && c.email ? <br /> : null}{c.email || ""}</p>
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(c.createdAt)}</p>
                    </td>
                    <td className="p-4"><ProfileLinks links={[c.profileUrl, c.instagram, c.youtube]} /></td>
                    <td className="max-w-[260px] p-4">
                      <p>{[c.platform ? platform(c.platform) : "", c.category ? opt(c.category) : "", c.languages ? opt(c.languages) : "", c.location, c.contentTypes ? opt(c.contentTypes) : ""].filter(Boolean).join(" • ")}</p>
                      {c.bio && <p className="mt-1 line-clamp-3 text-[12.5px] text-[#78716c]">{c.bio}</p>}
                    </td>
                    <td className="min-w-[170px] p-4">
                      <p className="text-[12.5px] text-[#78716c]">{t("dash.claimedFollowers")}: {formatNumber(c.followers || 0)}</p>
                      <label htmlFor={`verified-followers-${c.id}`} className="mt-2 block text-[11.5px] font-bold text-[#57534e]">
                        {t("admin.verifiedCount")}
                      </label>
                      <input
                        id={`verified-followers-${c.id}`}
                        type="number"
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
                      {c.reviewedAt && <p className="mt-1 text-[11.5px] text-[#a8a29e]">{t("admin.reviewed")} {formatDate(c.reviewedAt)}</p>}
                      {c.moderationNote && <p className="mt-1 text-[12px] text-[#78716c]">{t("admin.note")}: {c.moderationNote}</p>}
                    </td>
                    <td className="p-4"><StatusPill status={c.status} /></td>
                    <td className="p-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
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
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
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
                      <p className="break-all text-[11.5px] text-[#a8a29e]">{r.targetId}</p>
                    </td>
                    <td className="max-w-[300px] p-4">
                      <p className="font-semibold">{reportReasonLabel(r.reason)}</p>
                      {r.details && <p className="mt-1 text-[12.5px] leading-relaxed text-[#78716c]">{r.details}</p>}
                    </td>
                    <td className="max-w-[220px] p-4">
                      {r.reporterName && <p>{r.reporterName}</p>}
                      {r.reporterContact && <p className="break-all text-[12px] text-[#78716c]">{r.reporterContact}</p>}
                      {!r.reporterName && !r.reporterContact && <span className="text-stone-400">{t("admin.anonymous")}</span>}
                    </td>
                    <td className="p-4">
                      <StatusPill status={r.status} isReport />
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(r.createdAt)}</p>
                      {r.adminNote && <p className="mt-1 text-[12px] text-[#78716c]">{t("admin.note")}: {r.adminNote}</p>}
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
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
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
                    <td className="max-w-[190px] p-4">
                      <p className="font-bold">{a.creatorLabel || a.creatorName}</p>
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(a.createdAt)}</p>
                    </td>
                    <td className="max-w-[240px] p-4">{a.campaignLabel || (a.campaignMissing ? t("admin.deletedCampaign") : a.campaignId)}</td>
                    <td className="max-w-[300px] p-4">
                      {a.creatorContact && <p className="break-all font-semibold">{a.creatorContact}</p>}
                      {a.message && <p className="mt-1 text-[12.5px] leading-relaxed text-[#78716c]">{a.message}</p>}
                      {a.decisionNote && <p className="mt-1 text-[12px] text-[#78716c]">{t("dash.brandNote")}: {a.decisionNote}</p>}
                    </td>
                    <td className="p-4">
                      <StatusPill status={a.status} />
                      {a.decisionAt && <p className="mt-1 text-[11.5px] text-[#a8a29e]">{t("dash.updatedOn")} {formatDate(a.decisionAt)}</p>}
                    </td>
                    <td className="p-4">
                      <ActionButton tone="danger" disabled={busy} onClick={() => moderate("application", a.id, "delete")}>
                        {t("admin.deleteSpam")}
                      </ActionButton>
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
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
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
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(c.createdAt)}</p>
                    </td>
                    <td className="p-4">{contactKindLabel(c.kind)}</td>
                    <td className="max-w-[320px] p-4">{c.message}</td>
                    <td className="max-w-[220px] break-all p-4">{c.phone || c.email}</td>
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
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
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
                    <td className="whitespace-nowrap p-4 text-[12.5px] text-[#78716c]">{formatDate(log.createdAt)}</td>
                    <td className="p-4 text-[12.5px] font-bold">{auditActionLabel(log.action)}</td>
                    <td className="p-4"><StatusPill status={log.outcome} /></td>
                    <td className="max-w-[220px] p-4">
                      {log.entity ? <p className="font-semibold">{entityLabel(log.entity)}</p> : <span className="text-stone-400">{t("admin.adminEntity")}</span>}
                      {log.entityId && <p className="mt-1 break-all text-[11.5px] text-[#a8a29e]">{log.entityId}</p>}
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
                      {log.ipAddress && <p className="mt-1 text-[11.5px] text-[#a8a29e]">{t("admin.ipAddress")}: {log.ipAddress}</p>}
                      {detailEntries.length === 0 && !log.ipAddress && <span className="text-stone-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {activeRows.length === 0 && (
          <p className="p-8 text-center text-[14px] text-[#a8a29e]">{loading ? t("common.loading") : activeHasFilters ? t("listing.noMatches") : t("admin.empty")}</p>
        )}
      </div>
      <ListingPagination
        loaded={activeRows.length}
        total={activeList.pagination?.total ?? activeRows.length}
        hasMore={Boolean(activeList.pagination?.hasMore)}
        loading={loading}
        onLoadMore={loadMoreAdminRows}
      />
    </div>
  );
}
