"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { APPLICATION_STATUSES, CAMPAIGN_REVIEW_STATUSES, CATEGORIES, CONTENT_TYPES, LANGUAGES, PLATFORMS, PROMOTION_TYPES } from "@/shared/constants";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/shared/social-url";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import { ListingError, ListingPagination } from "@/frontend/components/ListingState";
import { appendUniqueById } from "@/frontend/api-json";
import { requestLogout } from "@/frontend/session";
import { buildAuthPath } from "@/shared/return-to";
import { normalizeUserRole, USER_ROLES, type UserRole } from "@/shared/user-roles";

type User = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  primaryRole?: UserRole;
  availableRoles?: UserRole[];
  emailVerifiedAt?: string | null;
  createdAt?: string;
};
type Campaign = {
  id: string;
  title: string;
  businessName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  location: string | null;
  language: string | null;
  format: string | null;
  budget: number | null;
  status: string | null;
  promotionType?: string | null;
  category?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  website?: string | null;
  verificationCode?: string | null;
  verificationStatus?: string | null;
  moderationNote?: string | null;
  updatedAt?: string | null;
};
type Application = {
  id: string;
  campaignId: string | null;
  creatorName?: string | null;
  creatorContact?: string | null;
  message: string | null;
  status: string | null;
  decisionNote?: string | null;
  decisionAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  campaignTitle?: string | null;
  businessName?: string | null;
  format?: string | null;
};
type Profile = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  category: string | null;
  followers: number | null;
  languages: string | null;
  contentTypes?: string | null;
  bio?: string | null;
  status: string | null;
  platform?: string | null;
  location?: string | null;
  profileUrl?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  verificationCode?: string | null;
  verificationStatus?: string | null;
  verifiedFollowers?: number | null;
  moderationNote?: string | null;
  updatedAt?: string | null;
};
type Notification = {
  id: string;
  kind: string;
  campaignTitle: string;
  actorName?: string | null;
  applicationStatus?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
};
interface PaginationMeta {
  limit: number;
  total: number;
  returned: number;
  hasMore: boolean;
  nextCursor: string | null;
}
type DashboardCounts = {
  campaigns?: number;
  applications?: number;
  campaignBudgetTotal?: number;
  profiles?: number;
  completedProfiles?: number;
  openCampaigns?: number;
  notifications?: number;
  unreadNotifications?: number;
};
type DashboardPagination = {
  campaigns?: PaginationMeta;
  applications?: PaginationMeta;
  profiles?: PaginationMeta;
  openCampaigns?: PaginationMeta;
  notifications?: PaginationMeta;
};
type Data = {
  user: User;
  activeView?: UserRole;
  campaigns?: Campaign[];
  applications: Application[];
  profiles?: Profile[];
  openCampaigns?: Campaign[];
  applicationContactOptions?: string[];
  notifications?: Notification[];
  unreadNotificationCount?: number;
  counts?: DashboardCounts;
  pagination?: DashboardPagination;
  applicationCountsByCampaign?: Record<string, number>;
  applicationPaginationByCampaign?: Record<string, PaginationMeta>;
};
type ListQuery = { q: string; status: string; sort: string };
type CampaignForm = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  title: string;
  promotionType: string;
  category: string;
  website: string;
  targetAudience: string;
  location: string;
  language: string;
  format: string;
  description: string;
  budget: string;
};
type ProfileForm = {
  name: string;
  phone: string;
  email: string;
  platform: string;
  instagram: string;
  youtube: string;
  profileUrl: string;
  followers: string;
  category: string;
  languages: string[];
  location: string;
  contentTypes: string[];
  bio: string;
};

const inputClass = "w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 text-[14px] outline-none focus:border-[#1c1917]";
const labelClass = "grid gap-1.5 text-[13.5px] font-bold";

class DisplayKeyError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl border border-[#e9ddc3] bg-white p-5 text-center">
      <p className="font-display text-[30px] font-black">{value}</p>
      <p className="text-[13px] font-bold text-[#6f6862]">{label}</p>
    </div>
  );
}

function statusPillClass(status: string | null | undefined) {
  switch (status) {
    case "approved":
    case "open":
    case "hired":
    case "completed":
      return "bg-[#17452e] text-white";
    case "shortlisted":
      return "bg-sky-100 text-sky-900";
    case "pending":
    case "paused":
    case "applied":
      return "bg-amber-100 text-amber-900";
    case "rejected":
    case "suspended":
      return "bg-red-100 text-red-800";
    default:
      return "bg-stone-100 text-stone-700";
  }
}

function splitList(value: string | null | undefined) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function campaignToForm(c: Campaign): CampaignForm {
  return {
    businessName: c.businessName ?? "",
    contactName: c.contactName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    title: c.title ?? "",
    promotionType: c.promotionType ?? "Product",
    category: c.category ?? "",
    website: c.website ?? "",
    targetAudience: c.targetAudience ?? "",
    location: c.location ?? "",
    language: c.language ?? "English",
    format: c.format ?? "Story",
    description: c.description ?? "",
    budget: String(c.budget ?? 5000),
  };
}

function profileToForm(p: Profile): ProfileForm {
  return {
    name: p.name ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    platform: p.platform ?? "Instagram",
    instagram: p.instagram ?? "",
    youtube: p.youtube ?? "",
    profileUrl: p.profileUrl ?? "",
    followers: String(p.followers ?? 0),
    category: p.category ?? "",
    languages: splitList(p.languages),
    location: p.location ?? "",
    contentTypes: splitList(p.contentTypes),
    bio: p.bio ?? "",
  };
}

export default function DashboardClient({
  initialView = "brand",
  returnTo = "/dashboard",
  initialSessionUnavailable = false,
}: {
  initialView?: UserRole;
  returnTo?: string;
  initialSessionUnavailable?: boolean;
} = {}) {
  const router = useRouter();
  const { t, opt, promo, platform: platformLabel, apiErrorKey, formatNumber, formatCurrency, formatDate } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [activeView, setActiveView] = useState<UserRole>(initialView);
  const activeViewRef = useRef<UserRole>(initialView);
  const [errorKey, setErrorKey] = useState(initialSessionUnavailable ? "api.serviceUnavailable" : "");
  const [noticeKey, setNoticeKey] = useState("");
  const [actionErrorKey, setActionErrorKey] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [editingCampaignId, setEditingCampaignId] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignForm | null>(null);
  const [editingProfileId, setEditingProfileId] = useState("");
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [editingApplicationId, setEditingApplicationId] = useState("");
  const [reactivatingApplicationId, setReactivatingApplicationId] = useState("");
  const [applicationForm, setApplicationForm] = useState({ creatorContact: "", message: "" });
  const [applicationConsent, setApplicationConsent] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [campaignDraft, setCampaignDraft] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [campaignQuery, setCampaignQuery] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [applicationDraft, setApplicationDraft] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [applicationQuery, setApplicationQuery] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [openSort, setOpenSort] = useState("newest");
  const [listBusyKey, setListBusyKey] = useState("");
  const sectionRequestRef = useRef<Record<string, number>>({});

  const fetchData = useCallback(
    async (
      extra: Record<string, string> = {},
      overrides: { campaignQuery?: ListQuery; applicationQuery?: ListQuery; openSort?: string; view?: UserRole } = {},
    ): Promise<Data | null> => {
      const requestedView = overrides.view ?? activeViewRef.current;
      const activeCampaignQuery = overrides.campaignQuery ?? campaignQuery;
      const activeApplicationQuery = overrides.applicationQuery ?? applicationQuery;
      const params = new URLSearchParams({
        view: requestedView,
        campaignLimit: "10",
        campaignSort: activeCampaignQuery.sort,
        applicationLimit: "10",
        applicationSort: activeApplicationQuery.sort,
        profileLimit: "10",
        profileSort: "newest",
        openLimit: "6",
        openSort: overrides.openSort ?? openSort,
        notificationLimit: "20",
        notificationSort: "newest",
      });
      if (activeCampaignQuery.q) params.set("campaignQ", activeCampaignQuery.q);
      if (activeCampaignQuery.status) params.set("campaignStatus", activeCampaignQuery.status);
      if (activeApplicationQuery.q) params.set("applicationQ", activeApplicationQuery.q);
      if (activeApplicationQuery.status) params.set("applicationStatus", activeApplicationQuery.status);
      for (const [key, value] of Object.entries(extra)) params.set(key, value);

      let r: Response;
      try {
        r = await fetch(`/api/me/dashboard?${params.toString()}`, { cache: "no-store" });
      } catch {
        throw new DisplayKeyError("api.network");
      }
      if (r.status === 401) {
        const destination = requestedView === initialView ? returnTo : `/dashboard?view=${requestedView}`;
        router.replace(buildAuthPath("/login", { returnTo: destination }));
        return null;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new DisplayKeyError(apiErrorKey(r.status, d?.code, "api.loadFailed"));
      if (!d || typeof d !== "object" || !d.user || typeof d.user !== "object" || typeof d.user.id !== "string") {
        throw new DisplayKeyError("api.loadFailed");
      }
      // A slower response for the previous workspace must not overwrite the
      // workspace the user has since selected.
      if (activeViewRef.current !== requestedView) return null;
      const result = d as Data;
      if (result.activeView && result.activeView !== requestedView) return null;
      return result;
    },
    [apiErrorKey, applicationQuery, campaignQuery, initialView, openSort, returnTo, router],
  );
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  const acceptDashboardData = useCallback((next: Data) => {
    const nextView =
      normalizeUserRole(next.activeView) ??
      normalizeUserRole(next.user.primaryRole ?? next.user.role) ??
      activeViewRef.current;
    activeViewRef.current = nextView;
    setActiveView(nextView);
    setData({ ...next, activeView: nextView });
  }, []);

  const mergeDashboardData = (
    next: Data,
    append: Partial<Record<"campaigns" | "applications" | "profiles" | "openCampaigns" | "notifications", boolean>> = {},
  ) => {
    setData((current) => {
      if (!current) return { ...next, applications: next.applications ?? [] };
      return {
        ...current,
        ...next,
        user: next.user ?? current.user,
        counts: next.counts ?? current.counts,
        campaigns: next.campaigns
          ? append.campaigns
            ? appendUniqueById(current.campaigns ?? [], next.campaigns)
            : next.campaigns
          : current.campaigns,
        applications: next.applications
          ? append.applications
            ? appendUniqueById(current.applications, next.applications)
            : next.applications
          : current.applications,
        profiles: next.profiles
          ? append.profiles
            ? appendUniqueById(current.profiles ?? [], next.profiles)
            : next.profiles
          : current.profiles,
        openCampaigns: next.openCampaigns
          ? append.openCampaigns
            ? appendUniqueById(current.openCampaigns ?? [], next.openCampaigns)
            : next.openCampaigns
          : current.openCampaigns,
        notifications: next.notifications
          ? append.notifications
            ? appendUniqueById(current.notifications ?? [], next.notifications)
            : next.notifications
          : current.notifications,
        applicationCountsByCampaign: {
          ...(current.applicationCountsByCampaign ?? {}),
          ...(next.applicationCountsByCampaign ?? {}),
        },
        applicationPaginationByCampaign: {
          ...(current.applicationPaginationByCampaign ?? {}),
          ...(next.applicationPaginationByCampaign ?? {}),
        },
        pagination: { ...(current.pagination ?? {}), ...(next.pagination ?? {}) },
      };
    });
  };

  const loadDashboardSection = async (
    section: string,
    extra: Record<string, string> = {},
    append: Partial<Record<"campaigns" | "applications" | "profiles" | "openCampaigns" | "notifications", boolean>> = {},
    overrides: { campaignQuery?: ListQuery; applicationQuery?: ListQuery; openSort?: string; view?: UserRole } = {},
  ) => {
    const requestKey = extra.applicationCampaignId ? `${section}:${extra.applicationCampaignId}` : section;
    const requestId = (sectionRequestRef.current[requestKey] = (sectionRequestRef.current[requestKey] ?? 0) + 1);
    setListBusyKey(requestKey);
    setActionErrorKey("");
    try {
      const next = await fetchData({ section, ...extra }, overrides);
      if (next && sectionRequestRef.current[requestKey] === requestId) {
        mergeDashboardData(next, append);
        setErrorKey("");
      }
    } catch (e) {
      if (sectionRequestRef.current[requestKey] === requestId) {
        setActionErrorKey(e instanceof DisplayKeyError ? e.key : "api.loadFailed");
      }
    } finally {
      if (sectionRequestRef.current[requestKey] === requestId) {
        setListBusyKey((current) => (current === requestKey ? "" : current));
      }
    }
  };

  const applyBrandFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const nextCampaignQuery = { ...campaignDraft, q: campaignDraft.q.trim() };
    const nextApplicationQuery = { ...applicationDraft, q: applicationDraft.q.trim() };
    setCampaignDraft(nextCampaignQuery);
    setApplicationDraft(nextApplicationQuery);
    setCampaignQuery(nextCampaignQuery);
    setApplicationQuery(nextApplicationQuery);
    void loadDashboardSection("campaigns", {}, {}, { campaignQuery: nextCampaignQuery, applicationQuery: nextApplicationQuery });
  };

  const clearBrandFilters = () => {
    const empty: ListQuery = { q: "", status: "", sort: "newest" };
    setCampaignDraft(empty);
    setApplicationDraft(empty);
    setCampaignQuery(empty);
    setApplicationQuery(empty);
    void loadDashboardSection("campaigns", {}, {}, { campaignQuery: empty, applicationQuery: empty });
  };

  const loadMoreCampaigns = () => {
    const cursor = data?.pagination?.campaigns?.nextCursor;
    if (!cursor || listBusyKey === "campaigns") return;
    void loadDashboardSection("campaigns", { campaignCursor: cursor }, { campaigns: true, applications: true });
  };

  const loadMoreBrandApplications = (campaignId: string) => {
    const cursor = data?.applicationPaginationByCampaign?.[campaignId]?.nextCursor;
    const busyKey = `applications:${campaignId}`;
    if (!cursor || listBusyKey === busyKey) return;
    void loadDashboardSection(
      "applications",
      { applicationCampaignId: campaignId, applicationCursor: cursor },
      { applications: true },
    );
  };

  const applyCreatorApplicationFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const nextApplicationQuery = { ...applicationDraft, q: applicationDraft.q.trim() };
    setApplicationDraft(nextApplicationQuery);
    setApplicationQuery(nextApplicationQuery);
    void loadDashboardSection("applications", {}, {}, { applicationQuery: nextApplicationQuery });
  };

  const clearCreatorApplicationFilters = () => {
    const empty: ListQuery = { q: "", status: "", sort: "newest" };
    setApplicationDraft(empty);
    setApplicationQuery(empty);
    void loadDashboardSection("applications", {}, {}, { applicationQuery: empty });
  };

  const loadMoreCreatorApplications = () => {
    const cursor = data?.pagination?.applications?.nextCursor;
    if (!cursor || listBusyKey === "applications") return;
    void loadDashboardSection("applications", { applicationCursor: cursor }, { applications: true });
  };

  const loadMoreProfiles = () => {
    const cursor = data?.pagination?.profiles?.nextCursor;
    if (!cursor || listBusyKey === "profiles") return;
    void loadDashboardSection("profiles", { profileCursor: cursor }, { profiles: true });
  };

  const loadMoreOpenCampaigns = () => {
    const cursor = data?.pagination?.openCampaigns?.nextCursor;
    if (!cursor || listBusyKey === "openCampaigns") return;
    void loadDashboardSection("openCampaigns", { openCursor: cursor }, { openCampaigns: true });
  };

  const changeOpenSort = (value: string) => {
    setOpenSort(value);
    void loadDashboardSection("openCampaigns", {}, {}, { openSort: value });
  };

  const loadMoreNotifications = () => {
    const cursor = data?.pagination?.notifications?.nextCursor;
    if (!cursor || listBusyKey === "notifications") return;
    void loadDashboardSection("notifications", { notificationCursor: cursor }, { notifications: true });
  };

  const loadData = async () => {
    const d = await fetchData();
    if (d) {
      acceptDashboardData(d);
      setErrorKey("");
    }
  };

  const fetchInitial = useCallback(async () => {
    try {
      const d = await fetchDataRef.current();
      if (d) {
        acceptDashboardData(d);
        setErrorKey("");
      }
    } catch (e: unknown) {
      // Keep any previously loaded dashboard visible; the render below only
      // replaces the page with this error when there is no data yet.
      setErrorKey(e instanceof DisplayKeyError ? e.key : "api.loadFailed");
    }
  }, [acceptDashboardData]);

  const retryInitialLoad = useCallback(async () => {
    setErrorKey("");
    await fetchInitial();
  }, [fetchInitial]);

  const switchWorkspace = async (view: UserRole) => {
    if (view === activeViewRef.current || busyKey === "workspace") return;
    const emptyQuery: ListQuery = { q: "", status: "", sort: "newest" };

    activeViewRef.current = view;
    setActiveView(view);
    setBusyKey("workspace");
    setData(null);
    setErrorKey("");
    setNoticeKey("");
    setActionErrorKey("");
    setEditingCampaignId("");
    setCampaignForm(null);
    setEditingProfileId("");
    setProfileForm(null);
    setEditingApplicationId("");
    setReactivatingApplicationId("");
    setApplicationForm({ creatorContact: "", message: "" });
    setApplicationConsent(false);
    setDecisionNotes({});
    setCampaignDraft(emptyQuery);
    setCampaignQuery(emptyQuery);
    setApplicationDraft(emptyQuery);
    setApplicationQuery(emptyQuery);
    setOpenSort("newest");
    setListBusyKey("");
    window.history.replaceState(null, "", `/dashboard?view=${view}`);

    try {
      const next = await fetchDataRef.current(
        {},
        { view, campaignQuery: emptyQuery, applicationQuery: emptyQuery, openSort: "newest" },
      );
      if (next && activeViewRef.current === view) {
        acceptDashboardData(next);
        setErrorKey("");
      }
    } catch (e: unknown) {
      if (activeViewRef.current === view) {
        setErrorKey(e instanceof DisplayKeyError ? e.key : "api.loadFailed");
      }
    } finally {
      setBusyKey((current) => (current === "workspace" ? "" : current));
    }
  };

  useEffect(() => {
    let alive = true;
    fetchDataRef
      .current()
      .then((d) => {
        if (alive && d) {
          acceptDashboardData(d);
          setErrorKey("");
        }
      })
      .catch((e: unknown) => {
        if (alive) setErrorKey(e instanceof DisplayKeyError ? e.key : "api.loadFailed");
      });
    return () => {
      alive = false;
    };
  }, [acceptDashboardData]);

  useEffect(() => {
    const id = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const jsonRequest = (url: string, method: string, body?: Record<string, unknown>) =>
    fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

  const runAction = async (key: string, request: () => Promise<Response>, after?: () => void) => {
    setBusyKey(key);
    setNoticeKey("");
    setActionErrorKey("");
    try {
      const res = await request();
      if (res.status === 401) {
        router.replace(buildAuthPath("/login", { returnTo: `/dashboard?view=${activeViewRef.current}` }));
        return;
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionErrorKey(apiErrorKey(res.status, result?.code, "dash.actionFailed"));
        return;
      }
      await loadData();
      after?.();
      setNoticeKey("dash.saved");
    } catch (e) {
      setActionErrorKey(e instanceof DisplayKeyError ? e.key : "dash.actionFailed");
    } finally {
      setBusyKey("");
    }
  };

  const logout = async () => {
    if (busyKey === "logout") return;
    setBusyKey("logout");
    setNoticeKey("");
    setActionErrorKey("");
    const loggedOut = await requestLogout();
    if (!loggedOut) {
      // Keep the private dashboard and authenticated controls visible when
      // logout could not be confirmed; the user can retry from this state.
      setActionErrorKey("session.logoutFailed");
      setBusyKey("");
      return;
    }
    router.push("/");
    router.refresh();
  };

  if (errorKey && !data) {
    return (
      <div className="mx-auto max-w-4xl p-10">
        <ListingError errorKey={errorKey} onRetry={() => void retryInitialLoad()} />
      </div>
    );
  }
  if (!data)
    return (
      <div role="status" aria-live="polite" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <span className="sr-only">{t("common.loading")}</span>
        <div aria-hidden="true" className="h-10 w-64 animate-pulse rounded-xl bg-[#f0e6cc]" />
        <div aria-hidden="true" className="mt-6 grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#f0e6cc]/70" />)}
        </div>
      </div>
    );

  const { user } = data;
  const renderedView = normalizeUserRole(data.activeView) ?? activeView;
  const isBrand = renderedView === "brand";
  const greetingKey =
    currentHour >= 5 && currentHour < 12
      ? "dash.goodMorning"
      : currentHour >= 12 && currentHour < 17
        ? "dash.goodAfternoon"
        : currentHour >= 17 && currentHour < 22
          ? "dash.goodEvening"
          : "dash.goodNight";
  const accountLabel = t("dash.bothAccount");
  const completedProfiles = (data.profiles ?? []).filter((profile) => profile.status !== "incomplete");
  const completedProfileCount = data.counts?.completedProfiles ?? completedProfiles.length;
  const notifications = data.notifications ?? [];
  const unreadCount = data.unreadNotificationCount ?? data.counts?.unreadNotifications ?? notifications.filter((n) => !n.readAt).length;
  const brandHasFilters = Boolean(
    campaignQuery.q || campaignQuery.status || campaignQuery.sort !== "newest" ||
    applicationQuery.q || applicationQuery.status || applicationQuery.sort !== "newest",
  );
  const creatorApplicationHasFilters = Boolean(applicationQuery.q || applicationQuery.status || applicationQuery.sort !== "newest");
  const statusLabel = (status: string | null | undefined) => (status ? t(`status.${status}`) : "");
  const notificationText = (n: Notification) => {
    const template = t(
      n.kind === "application_received" ? "notify.received" : n.kind === "application_withdrawn" ? "notify.withdrawn" : "notify.status",
    );
    return template
      .replace("{actor}", n.actorName ?? "")
      .replace("{campaign}", n.campaignTitle)
      .replace("{status}", statusLabel(n.applicationStatus));
  };

  const renderNotifications = () => (
    <section className="mt-8 rounded-[24px] border border-[#e9ddc3] bg-white p-5 card-shadow" aria-labelledby="notifications-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications-heading" className="text-[19px] font-extrabold">
          {t("notify.title")} {unreadCount > 0 && <span className="ml-1 rounded-full bg-[#c7431f] px-2.5 py-1 text-[12px] text-white">{formatNumber(unreadCount)} {t("notify.unread")}</span>}
        </h2>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={busyKey === "notifications:all"}
            onClick={() => runAction("notifications:all", () => jsonRequest("/api/me/notifications", "PATCH", { all: true }))}
            className="rounded-xl border border-[#e9ddc3] px-4 py-2 text-[13px] font-bold disabled:opacity-50"
          >
            {t("notify.markAllRead")}
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="mt-3 text-[14px] text-[#6f6862]">{t("notify.empty")}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {notifications.map((n) => (
            <div key={n.id} className={`rounded-xl border p-3 ${n.readAt ? "border-[#f0e6cc] bg-white" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold">{notificationText(n)}</p>
                  <p className="mt-0.5 text-[12px] text-[#6f6862]">{formatDate(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <button
                    type="button"
                    disabled={busyKey === `notification:${n.id}`}
                    onClick={() => runAction(`notification:${n.id}`, () => jsonRequest("/api/me/notifications", "PATCH", { id: n.id }))}
                    className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
                  >
                    {t("notify.markRead")}
                  </button>
                )}
              </div>
            </div>
          ))}
          <ListingPagination
            loaded={notifications.length}
            total={data.pagination?.notifications?.total ?? data.counts?.notifications ?? notifications.length}
            hasMore={Boolean(data.pagination?.notifications?.hasMore)}
            loading={listBusyKey === "notifications"}
            onLoadMore={loadMoreNotifications}
            className="mt-3 flex flex-col items-center gap-2"
            buttonClassName="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      )}
    </section>
  );

  const renderCampaignEdit = (c: Campaign) => {
    if (editingCampaignId !== c.id || !campaignForm) return null;
    const busy = busyKey === `campaign:${c.id}:edit`;
    const set = (field: keyof CampaignForm, value: string) => setCampaignForm((f) => (f ? { ...f, [field]: value } : f));
    return (
      <form
        id={`dashboard-campaign-${c.id}-edit-form`}
        className="mt-4 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          document.getElementById(`dashboard-campaign-${c.id}-edit-toggle`)?.focus();
          setEditingCampaignId("");
          setCampaignForm(null);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          runAction(
            `campaign:${c.id}:edit`,
            () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, ...campaignForm, expectedUpdatedAt: c.updatedAt ?? undefined }),
            () => {
              setEditingCampaignId("");
              setCampaignForm(null);
            },
          );
        }}
      >
        <h3 className="text-[16px] font-extrabold">{t("dash.editCampaign")}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6f6862]">{t("dash.editReviewWarning")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-business-name`}>{t("brand.businessName")}<input autoFocus id={`dashboard-campaign-${c.id}-business-name`} value={campaignForm.businessName} onChange={(e) => set("businessName", e.target.value)} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-contact-name`}>{t("brand.contactName")}<input id={`dashboard-campaign-${c.id}-contact-name`} value={campaignForm.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`} htmlFor={`dashboard-campaign-${c.id}-title`}>{t("brand.titleLabel")}<input id={`dashboard-campaign-${c.id}-title`} value={campaignForm.title} onChange={(e) => set("title", e.target.value)} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-promotion-type`}>{t("brand.promoting")}
            <select id={`dashboard-campaign-${c.id}-promotion-type`} value={campaignForm.promotionType} onChange={(e) => set("promotionType", e.target.value)} className={inputClass}>
              {PROMOTION_TYPES.map((p) => <option key={p.id} value={p.id}>{promo(p.title)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-category`}>{t("brand.category")}
            <select id={`dashboard-campaign-${c.id}-category`} value={campaignForm.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
              <option value="">—</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{opt(category)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-website`}>{t("brand.website")}<input id={`dashboard-campaign-${c.id}-website`} value={campaignForm.website} onChange={(e) => set("website", e.target.value)} placeholder={t("brand.phWebsite")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-target-audience`}>{t("brand.audience")}<input id={`dashboard-campaign-${c.id}-target-audience`} value={campaignForm.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder={t("brand.phAudience")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-location`}>{t("brand.location")}<input id={`dashboard-campaign-${c.id}-location`} value={campaignForm.location} onChange={(e) => set("location", e.target.value)} placeholder={t("brand.phLocation")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-budget`}>{t("brand.budget")}<input id={`dashboard-campaign-${c.id}-budget`} inputMode="numeric" value={campaignForm.budget} onChange={(e) => set("budget", e.target.value)} placeholder={t("brand.budgetPlaceholder")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-language`}>{t("brand.language")}
            <select id={`dashboard-campaign-${c.id}-language`} value={campaignForm.language} onChange={(e) => set("language", e.target.value)} className={inputClass}>
              {LANGUAGES.map((language) => <option key={language} value={language}>{opt(language)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-format`}>{t("brand.format")}
            <select id={`dashboard-campaign-${c.id}-format`} value={campaignForm.format} onChange={(e) => set("format", e.target.value)} className={inputClass}>
              {CONTENT_TYPES.map((format) => <option key={format} value={format}>{opt(format)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-phone`}>{t("brand.phone")}<input id={`dashboard-campaign-${c.id}-phone`} value={campaignForm.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-email`}>{t("brand.email")}<input id={`dashboard-campaign-${c.id}-email`} value={campaignForm.email} onChange={(e) => set("email", e.target.value)} placeholder={t("brand.phEmail")} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`} htmlFor={`dashboard-campaign-${c.id}-description`}>{t("brand.descLabel")}<textarea id={`dashboard-campaign-${c.id}-description`} value={campaignForm.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder={t("brand.phDesc")} className={inputClass} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">{busy ? t("dash.saving") : t("dash.saveChanges")}</button>
          <button type="button" disabled={busy} onClick={() => { document.getElementById(`dashboard-campaign-${c.id}-edit-toggle`)?.focus(); setEditingCampaignId(""); setCampaignForm(null); }} className="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">{t("dash.cancel")}</button>
        </div>
      </form>
    );
  };

  const renderBrandApplication = (a: Application) => {
    const actionable = a.status === "applied" || a.status === "shortlisted" || a.status === "hired";
    const decide = (action: string) => {
      if (action === "reject" && !window.confirm(t("dash.confirmRejectApplication"))) return;
      runAction(
        `application:${a.id}:${action}`,
        () => jsonRequest("/api/applications", "PATCH", { id: a.id, action, decisionNote: decisionNotes[a.id] ?? a.decisionNote ?? "" }),
        () => setDecisionNotes((notes) => { const next = { ...notes }; delete next[a.id]; return next; }),
      );
    };
    return (
      <div key={a.id} className="rounded-lg bg-white p-3 text-[13.5px]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold">{a.creatorName}</p>
            {a.creatorContact && (
              <>
                <p className="break-all text-[#c7431f]">{a.creatorContact}</p>
                <p className="mt-0.5 text-[11.5px] font-semibold text-[#6f6862]">🔒 {t("dash.brandContactUse")}</p>
              </>
            )}
            <p className="mt-0.5 text-[12px] text-[#6f6862]">{t("dash.appliedOn")}: {formatDate(a.createdAt)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${statusPillClass(a.status)}`}>{statusLabel(a.status)}</span>
        </div>
        {a.message && <p className="mt-2 text-[#57534e]">“{a.message}”</p>}
        {a.decisionNote && <p className="mt-2 rounded-lg bg-[#fffbf1] p-2 text-[12.5px] text-[#57534e]"><b>{t("dash.brandNote")}:</b> {a.decisionNote}</p>}
        {actionable && (
          <div className="mt-3 grid gap-2">
            {a.status === "hired" && (
              <p role="note" className="rounded-lg bg-[#faf6ed] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#9a3412]">
                {t("dash.offPlatformHiredNote")}
              </p>
            )}
            <label className="grid gap-1 text-[12.5px] font-bold" htmlFor={`dashboard-decision-note-${a.id}`}>
              {t("dash.decisionNote")}
              <textarea id={`dashboard-decision-note-${a.id}`}
                value={decisionNotes[a.id] ?? a.decisionNote ?? ""}
                onChange={(e) => setDecisionNotes((notes) => ({ ...notes, [a.id]: e.target.value }))}
                rows={2}
                placeholder={t("dash.decisionNotePh")}
                className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-3 py-2 text-[13px] font-normal outline-none focus:border-[#1c1917]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {a.status === "applied" && <button type="button" disabled={busyKey === `application:${a.id}:shortlist`} onClick={() => decide("shortlist")} className="rounded-lg bg-sky-700 px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{t("dash.shortlist")}</button>}
              {(a.status === "applied" || a.status === "shortlisted") && <button type="button" disabled={busyKey === `application:${a.id}:hire`} onClick={() => decide("hire")} className="rounded-lg bg-[#17452e] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{t("dash.hire")}</button>}
              {a.status === "hired" && <button type="button" disabled={busyKey === `application:${a.id}:complete`} onClick={() => decide("complete")} className="rounded-lg bg-[#17452e] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{t("dash.completeApplication")}</button>}
              {(a.status === "applied" || a.status === "shortlisted") && <button type="button" disabled={busyKey === `application:${a.id}:reject`} onClick={() => decide("reject")} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-bold text-red-800 disabled:opacity-50">{t("dash.rejectApplication")}</button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProfileEdit = (profile: Profile) => {
    if (editingProfileId !== profile.id || !profileForm) return null;
    const busy = busyKey === `profile:${profile.id}:edit`;
    const set = (field: keyof ProfileForm, value: string | string[]) => setProfileForm((f) => (f ? { ...f, [field]: value } : f));
    const toggle = (field: "languages" | "contentTypes", value: string) =>
      setProfileForm((f) => {
        if (!f) return f;
        const values = f[field].includes(value) ? f[field].filter((x) => x !== value) : [...f[field], value];
        return { ...f, [field]: values };
      });
    return (
      <form
        id={`dashboard-profile-${profile.id}-edit-form`}
        className="mt-4 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          document.getElementById(`dashboard-profile-${profile.id}-edit-toggle`)?.focus();
          setEditingProfileId("");
          setProfileForm(null);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (profileForm.languages.length === 0) {
            setActionErrorKey("cr.err");
            return;
          }
          runAction(`profile:${profile.id}:edit`, () => jsonRequest("/api/creators", "PATCH", { ...profileForm, expectedUpdatedAt: profile.updatedAt ?? undefined }), () => {
            setEditingProfileId("");
            setProfileForm(null);
          });
        }}
      >
        <h3 className="text-[16px] font-extrabold">{t("dash.editProfile")}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6f6862]">{t("dash.editReviewWarning")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-name`}>{t("cr.name")}<input autoFocus id={`dashboard-profile-${profile.id}-name`} value={profileForm.name} onChange={(e) => set("name", e.target.value)} placeholder={t("cr.phName")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-phone`}>{t("cr.phone")}<input id={`dashboard-profile-${profile.id}-phone`} value={profileForm.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-email`}>{t("cr.email")}<input id={`dashboard-profile-${profile.id}-email`} value={profileForm.email} onChange={(e) => set("email", e.target.value)} placeholder={t("cr.phEmail")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-location`}>{t("cr.city")}<input id={`dashboard-profile-${profile.id}-location`} value={profileForm.location} onChange={(e) => set("location", e.target.value)} placeholder={t("cr.phCity")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-platform`}>{t("cr.platform")}
            <select id={`dashboard-profile-${profile.id}-platform`} value={profileForm.platform} onChange={(e) => set("platform", e.target.value)} className={inputClass}>
              {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platformLabel(platform)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-profile-url`}>{t("cr.profileLink")}<input id={`dashboard-profile-${profile.id}-profile-url`} value={profileForm.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder={t("cr.phProfile")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-instagram`}>{t("cr.instagram")}<input id={`dashboard-profile-${profile.id}-instagram`} value={profileForm.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder={t("cr.phIg")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-youtube`}>{t("cr.youtube")}<input id={`dashboard-profile-${profile.id}-youtube`} value={profileForm.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder={t("cr.phYt")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-followers`}>{t("cr.followers")}<input id={`dashboard-profile-${profile.id}-followers`} value={profileForm.followers} onChange={(e) => set("followers", e.target.value)} placeholder={t("cr.phFollowers")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-category`}>{t("cr.category")}
            <select id={`dashboard-profile-${profile.id}-category`} value={profileForm.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
              <option value="">—</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{opt(category)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4">
          <p id={`dashboard-profile-${profile.id}-languages-label`} className="text-[13.5px] font-bold">{t("cr.langs")}</p>
          <div role="group" aria-labelledby={`dashboard-profile-${profile.id}-languages-label`} className="mt-2 flex flex-wrap gap-2">
            {LANGUAGES.map((language) => (
              <button key={language} type="button" onClick={() => toggle("languages", language)} aria-pressed={profileForm.languages.includes(language)} className={`rounded-full border px-4 py-2 text-[13px] font-bold ${profileForm.languages.includes(language) ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-white"}`}>{opt(language)}</button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p id={`dashboard-profile-${profile.id}-content-types-label`} className="text-[13.5px] font-bold">{t("cr.content")}</p>
          <div role="group" aria-labelledby={`dashboard-profile-${profile.id}-content-types-label`} className="mt-2 flex flex-wrap gap-2">
            {CONTENT_TYPES.map((contentType) => (
              <button key={contentType} type="button" onClick={() => toggle("contentTypes", contentType)} aria-pressed={profileForm.contentTypes.includes(contentType)} className={`rounded-full border px-4 py-2 text-[13px] font-bold ${profileForm.contentTypes.includes(contentType) ? "border-[#c7431f] bg-[#c7431f] text-white" : "border-[#e9ddc3] bg-white"}`}>{opt(contentType)}</button>
            ))}
          </div>
        </div>
        <label className={`${labelClass} mt-4`} htmlFor={`dashboard-profile-${profile.id}-bio`}>{t("cr.bio")}<textarea id={`dashboard-profile-${profile.id}-bio`} value={profileForm.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder={t("cr.phBio")} className={inputClass} /></label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">{busy ? t("dash.saving") : t("dash.saveChanges")}</button>
          <button type="button" disabled={busy} onClick={() => { document.getElementById(`dashboard-profile-${profile.id}-edit-toggle`)?.focus(); setEditingProfileId(""); setProfileForm(null); }} className="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">{t("dash.cancel")}</button>
        </div>
      </form>
    );
  };

  const renderCreatorApplication = (a: Application) => {
    const editing = editingApplicationId === a.id;
    const reactivating = reactivatingApplicationId === a.id;
    const applicationFormOpen = editing || reactivating;
    const canEdit = a.status === "applied" || a.status === "shortlisted";
    const canWithdraw = canEdit || a.status === "hired";
    return (
      <div key={a.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold">{a.campaignTitle ?? t("nav.campaigns")}</p>
            <p className="truncate text-[13px] text-[#6f6862]">{[a.businessName, opt(a.format)].filter(Boolean).join(" · ")}</p>
            <p className="mt-0.5 text-[12px] text-[#6f6862]">{t("dash.appliedOn")}: {formatDate(a.createdAt)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${statusPillClass(a.status)}`}>{statusLabel(a.status)}</span>
        </div>
        {a.message && <p className="mt-3 text-[13.5px] text-[#57534e]"><b>{t("dash.yourMessage")}:</b> “{a.message}”</p>}
        {a.creatorContact && (
          <p className="mt-2 break-all text-[13px] text-[#57534e]">
            <b>{t("dash.sharedContact")}:</b> {a.creatorContact}
          </p>
        )}
        {a.decisionNote && <p className="mt-2 rounded-xl bg-[#fffbf1] p-3 text-[13px] text-[#57534e]"><b>{t("dash.brandNote")}:</b> {a.decisionNote}</p>}
        {a.status === "hired" && (
          <p role="note" className="mt-3 rounded-lg bg-[#faf6ed] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#9a3412]">
            {t("dash.offPlatformHiredNote")}
          </p>
        )}

        {applicationFormOpen ? (
          <form
            id={`dashboard-application-${a.id}-edit-form`}
            className="mt-3 grid gap-3 rounded-xl border border-[#e9ddc3] bg-[#fffbf1] p-3"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              const wasReactivating = reactivating;
              setEditingApplicationId("");
              setReactivatingApplicationId("");
              setApplicationConsent(false);
              requestAnimationFrame(() => document.getElementById(`dashboard-application-${a.id}-${wasReactivating ? "reactivate" : "edit"}-toggle`)?.focus());
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (reactivating) {
                runAction(
                  `application:${a.id}:reactivate`,
                  () =>
                    jsonRequest("/api/applications", "PATCH", {
                      id: a.id,
                      action: "reactivate",
                      ...applicationForm,
                      contactSharingConsent: applicationConsent,
                    }),
                  () => {
                    setReactivatingApplicationId("");
                    setApplicationConsent(false);
                  },
                );
                return;
              }
              runAction(
                `application:${a.id}:edit`,
                () => jsonRequest("/api/applications", "PATCH", { id: a.id, action: "edit", ...applicationForm }),
                () => setEditingApplicationId(""),
              );
            }}
          >
            <PrivacyNotice textKey={reactivating ? "dash.reactivateNotice" : "privacy.applicationEditNotice"} compact />
            <label className={labelClass} htmlFor={`dashboard-application-${a.id}-contact`}>
              {t("dash.contactForBrand")}
              <input autoFocus id={`dashboard-application-${a.id}-contact`}
                value={applicationForm.creatorContact}
                onChange={(e) => setApplicationForm((f) => ({ ...f, creatorContact: e.target.value }))}
                required
                minLength={3}
                aria-describedby={`dashboard-application-${a.id}-contact-note`}
                list={`dashboard-application-contacts-${a.id}`}
                placeholder={t("camp.applyContact")}
                className={inputClass}
              />
              <datalist id={`dashboard-application-contacts-${a.id}`}>
                {(data.applicationContactOptions ?? []).map((option) => <option key={option} value={option} />)}
              </datalist>
              <span id={`dashboard-application-${a.id}-contact-note`} className="text-[12.5px] font-semibold leading-relaxed text-[#6f6862]">{t("camp.contactMustBeYours")}</span>
            </label>
            <label className={labelClass} htmlFor={`dashboard-application-${a.id}-message`}>{t("dash.yourMessage")}<textarea id={`dashboard-application-${a.id}-message`} value={applicationForm.message} onChange={(e) => setApplicationForm((f) => ({ ...f, message: e.target.value }))} rows={3} placeholder={t("camp.applyPhMsg")} className={inputClass} /></label>
            {reactivating && (
              <label htmlFor={`reactivate-consent-${a.id}`} className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-3 text-[13px] font-semibold leading-relaxed text-[#57534e]">
                <input
                  id={`reactivate-consent-${a.id}`}
                  type="checkbox"
                  checked={applicationConsent}
                  onChange={(e) => setApplicationConsent(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 flex-none accent-[#c7431f]"
                />
                <span className="min-w-0 flex-1">{t("dash.reactivateConsent")}</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={
                  applicationForm.creatorContact.trim().length < 3 ||
                  (reactivating && !applicationConsent) ||
                  busyKey === `application:${a.id}:${reactivating ? "reactivate" : "edit"}`
                }
                className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {reactivating ? t("dash.reactivateApplication") : t("dash.saveChanges")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const wasReactivating = reactivating;
                  setEditingApplicationId("");
                  setReactivatingApplicationId("");
                  setApplicationConsent(false);
                  requestAnimationFrame(() => document.getElementById(`dashboard-application-${a.id}-${wasReactivating ? "reactivate" : "edit"}-toggle`)?.focus());
                }}
                className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold"
              >
                {t("dash.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                id={`dashboard-application-${a.id}-edit-toggle`}
                aria-expanded={false}
                aria-controls={`dashboard-application-${a.id}-edit-form`}
                onClick={() => {
                  setEditingApplicationId(a.id);
                  setReactivatingApplicationId("");
                  setApplicationConsent(false);
                  setApplicationForm({ creatorContact: a.creatorContact ?? "", message: a.message ?? "" });
                }}
                className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white"
              >
                {t("dash.editApplication")}
              </button>
            )}
            {canWithdraw && (
              <button
                type="button"
                disabled={busyKey === `application:${a.id}:withdraw`}
                onClick={() => {
                  if (window.confirm(t("dash.confirmWithdraw"))) {
                    runAction(`application:${a.id}:withdraw`, () => jsonRequest("/api/applications", "PATCH", { id: a.id, action: "withdraw" }));
                  }
                }}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-red-800 disabled:opacity-50"
              >
                {t("dash.withdrawApplication")}
              </button>
            )}
            {a.status === "withdrawn" && (
              <button
                type="button"
                id={`dashboard-application-${a.id}-reactivate-toggle`}
                aria-expanded={false}
                aria-controls={`dashboard-application-${a.id}-edit-form`}
                disabled={busyKey === `application:${a.id}:reactivate`}
                onClick={() => {
                  setEditingApplicationId("");
                  setReactivatingApplicationId(a.id);
                  setApplicationConsent(false);
                  setApplicationForm({ creatorContact: a.creatorContact ?? "", message: a.message ?? "" });
                }}
                className="rounded-xl bg-[#c7431f] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {t("dash.reactivateApplication")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t(greetingKey)}, {user.name.split(" ")[0]} 🙏</p>
          <h1 className="font-display text-[30px] font-black sm:text-[40px]">{t("dash.title")}</h1>
          <p className="text-[14.5px] text-[#6f6862]">{user.email} · <span className="font-bold">{accountLabel}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={isBrand ? "/brands" : "/campaigns"} className="rounded-2xl bg-[#c7431f] px-5 py-3 text-[14.5px] font-bold text-white hover:bg-[#a93618]">
            {isBrand ? t("dash.newCampaign") : t("dash.findCampaigns")}
          </Link>
          <Link href="/account" className="rounded-2xl border border-[#1c1917] bg-white px-5 py-3 text-[14.5px] font-bold">{t("dash.accountSettings")}</Link>
          <button type="button" onClick={() => void logout()} disabled={busyKey === "logout"} aria-busy={busyKey === "logout"} className="rounded-2xl border border-[#e9ddc3] bg-white px-5 py-3 text-[14.5px] font-bold disabled:opacity-60">{busyKey === "logout" ? t("session.loggingOut") : t("dash.logout")}</button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#e9ddc3] bg-white p-3 card-shadow sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[14px] font-extrabold">{t("dash.workspaceLabel")}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#6f6862]">{t("dash.workspaceHint")}</p>
        </div>
        <div role="group" aria-label={t("dash.workspaceLabel")} className="grid shrink-0 grid-cols-2 gap-1 rounded-2xl bg-[#fff4de] p-1">
          {USER_ROLES.map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={renderedView === view}
              disabled={busyKey === "workspace" || busyKey === "logout"}
              onClick={() => void switchWorkspace(view)}
              className={`rounded-xl px-4 py-2.5 text-[13.5px] font-extrabold disabled:opacity-60 ${renderedView === view ? "bg-[#1c1917] text-white" : "text-[#57534e] hover:bg-white"}`}
            >
              {t(view === "brand" ? "dash.brandWorkspace" : "dash.creatorWorkspace")}
            </button>
          ))}
        </div>
      </div>

      {noticeKey && <p role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[14px] font-bold text-green-800">{t(noticeKey)}</p>}
      {errorKey && (
        <div className="mt-5">
          <ListingError errorKey={errorKey} onRetry={() => void retryInitialLoad()} />
        </div>
      )}
      {actionErrorKey && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-700">{t(actionErrorKey)}</p>}

      {!user.emailVerifiedAt && (
        <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[14.5px] font-extrabold text-amber-950">{t("dash.emailNotVerified")}</p>
            <p className="mt-0.5 text-[13.5px] text-[#57534e]">{t("dash.emailNotVerifiedHelp")}</p>
          </div>
          <Link href="/account" className="shrink-0 rounded-xl bg-[#1c1917] px-4 py-2.5 text-center text-[13.5px] font-bold text-white">{t("dash.verifyNow")}</Link>
        </div>
      )}

      {renderNotifications()}

      {isBrand ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat value={formatNumber(data.counts?.campaigns ?? data.campaigns?.length ?? 0)} label={t("dash.statCampaigns")} />
            <Stat value={formatNumber(data.counts?.applications ?? data.applications.length)} label={t("dash.statApps")} />
            <Stat value={formatCurrency(data.counts?.campaignBudgetTotal ?? (data.campaigns ?? []).reduce((s, c) => s + (c.budget || 0), 0))} label={t("dash.statBudget")} />
          </div>


          <form onSubmit={applyBrandFilters} className="mt-6 grid gap-2 rounded-2xl border border-[#e9ddc3] bg-white p-3 card-shadow">
            <div className="grid gap-2 md:grid-cols-[1fr_190px_190px]">
              <label htmlFor="dashboard-campaign-search">
                <span className="sr-only">{t("dash.yourCampaigns")}</span>
                <input id="dashboard-campaign-search" value={campaignDraft.q} onChange={(e) => setCampaignDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("camp.search")} className={inputClass} />
              </label>
              <label htmlFor="dashboard-campaign-status-filter">
                <span className="sr-only">{t("listing.filterStatus")}</span>
                <select id="dashboard-campaign-status-filter" value={campaignDraft.status} onChange={(e) => setCampaignDraft((current) => ({ ...current, status: e.target.value }))} className={inputClass}>
                  <option value="">{t("listing.allStatuses")}</option>
                  {CAMPAIGN_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </label>
              <label htmlFor="dashboard-campaign-sort">
                <span className="sr-only">{t("listing.sort")}</span>
                <select id="dashboard-campaign-sort" value={campaignDraft.sort} onChange={(e) => setCampaignDraft((current) => ({ ...current, sort: e.target.value }))} className={inputClass}>
                  <option value="newest">{t("listing.sortNewest")}</option>
                  <option value="oldest">{t("listing.sortOldest")}</option>
                  <option value="title">{t("listing.sortTitle")}</option>
                  <option value="budget_desc">{t("listing.sortBudgetDesc")}</option>
                  <option value="budget_asc">{t("listing.sortBudgetAsc")}</option>
                  <option value="status">{t("listing.sortStatus")}</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_190px_190px]">
              <label htmlFor="dashboard-brand-application-search">
                <span className="sr-only">{t("dash.applications")}</span>
                <input id="dashboard-brand-application-search" value={applicationDraft.q} onChange={(e) => setApplicationDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("listing.searchItems")} className={inputClass} />
              </label>
              <label htmlFor="dashboard-brand-application-status-filter">
                <span className="sr-only">{t("listing.filterStatus")}</span>
                <select id="dashboard-brand-application-status-filter" value={applicationDraft.status} onChange={(e) => setApplicationDraft((current) => ({ ...current, status: e.target.value }))} className={inputClass}>
                  <option value="">{t("listing.allStatuses")}</option>
                  {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </label>
              <label htmlFor="dashboard-brand-application-sort">
                <span className="sr-only">{t("listing.sort")}</span>
                <select id="dashboard-brand-application-sort" value={applicationDraft.sort} onChange={(e) => setApplicationDraft((current) => ({ ...current, sort: e.target.value }))} className={inputClass}>
                  <option value="newest">{t("listing.sortNewest")}</option>
                  <option value="oldest">{t("listing.sortOldest")}</option>
                  <option value="updated">{t("listing.sortUpdated")}</option>
                  <option value="status">{t("listing.sortStatus")}</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={listBusyKey === "campaigns"} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">
                {listBusyKey === "campaigns" ? t("common.loading") : t("listing.searchLabel")}
              </button>
              {brandHasFilters && (
                <button type="button" disabled={listBusyKey === "campaigns"} onClick={clearBrandFilters} className="rounded-xl border border-[#e9ddc3] px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">
                  {t("listing.clearFilters")}
                </button>
              )}
            </div>
          </form>

          <h2 className="mt-10 text-[19px] font-extrabold">{t("dash.yourCampaigns")}</h2>
          <div className="mt-3 grid gap-3">
            {(data.campaigns ?? []).length === 0 && (
              brandHasFilters ? (
                <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-8 text-center">
                  <p className="text-[15px] font-bold">{t("listing.noCampaignMatches")}</p>
                  <button type="button" onClick={clearBrandFilters} className="mt-4 rounded-xl border border-[#1c1917] px-5 py-2.5 text-[14px] font-bold">
                    {t("listing.clearFilters")}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-8 text-center">
                  <p className="text-[15px] font-bold">{t("dash.noCampaigns")}</p>
                  <p className="mt-1 text-[14px] text-[#6f6862]">{t("dash.noCampaignsSub")}</p>
                  <Link href="/brands" className="mt-4 inline-block rounded-xl bg-[#1c1917] px-5 py-2.5 text-[14px] font-bold text-white">{t("dash.create")}</Link>
                </div>
              )
            )}
            {(data.campaigns ?? []).map((c) => {
              const apps = data.applications.filter((a) => a.campaignId === c.id);
              const campaignApplicationCount = data.applicationCountsByCampaign?.[c.id] ?? apps.length;
              const campaignApplicationPagination = data.applicationPaginationByCampaign?.[c.id];
              const campaignBusy = busyKey.startsWith(`campaign:${c.id}:`);
              return (
                <div key={c.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[16px] font-extrabold">{c.title}</p>
                      <p className="text-[13px] text-[#6f6862]">{[c.businessName, c.location, opt(c.language), opt(c.format)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="rounded-full bg-[#fff4de] px-3 py-1 text-[12.5px] font-bold">🔒 {formatCurrency(c.budget || 0)}</span>
                      <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${statusPillClass(c.status)}`}>{statusLabel(c.status)}</span>
                    </div>
                  </div>

                  {(c.status !== "open" || c.verificationStatus !== "verified" || c.moderationNote) && (
                    <div className={`mt-3 rounded-xl border p-3 ${c.status === "rejected" || c.status === "suspended" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                      <p className="text-[13.5px] font-semibold text-[#44403c]">
                        {c.status === "pending" ? t("dash.campaignInReview") : c.status === "paused" ? t("dash.campaignPaused") : t("verify.notPublic")}
                      </p>
                      {c.status === "pending" && c.verificationCode && (
                        <>
                          <p className="mt-2 text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("dash.verificationCode")}</p>
                          <p className="font-mono text-[18px] font-black tracking-wider">{c.verificationCode}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-[#57534e]">{t("verify.businessHelp")}</p>
                        </>
                      )}
                      {c.moderationNote && <p className="mt-2 text-[13px] text-[#57534e]"><b>{t("dash.reviewNote")}:</b> {c.moderationNote}</p>}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      id={`dashboard-campaign-${c.id}-edit-toggle`}
                      aria-expanded={editingCampaignId === c.id}
                      aria-controls={`dashboard-campaign-${c.id}-edit-form`}
                      onClick={() => {
                        setEditingCampaignId(c.id);
                        setCampaignForm(campaignToForm(c));
                      }}
                      className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white"
                    >
                      {t("dash.editCampaign")}
                    </button>
                    {c.status === "open" && (
                      <button type="button" disabled={campaignBusy} onClick={() => runAction(`campaign:${c.id}:pause`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "pause" }))} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-bold text-amber-900 disabled:opacity-50">{t("dash.pauseCampaign")}</button>
                    )}
                    {(c.status === "paused" || c.status === "closed" || c.status === "rejected") && (
                      <button type="button" disabled={campaignBusy} onClick={() => runAction(`campaign:${c.id}:republish`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "republish" }))} className="rounded-xl bg-[#17452e] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                        {c.status === "paused" ? t("dash.republishCampaign") : t("dash.resubmitCampaign")}
                      </button>
                    )}
                    {c.status !== "closed" && (
                      <button
                        type="button"
                        disabled={campaignBusy}
                        onClick={() => {
                          if (window.confirm(t("dash.confirmCloseCampaign"))) {
                            runAction(`campaign:${c.id}:close`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "close" }));
                          }
                        }}
                        className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold disabled:opacity-50"
                      >
                        {t("dash.closeCampaign")}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={campaignBusy}
                      onClick={() => {
                        if (window.confirm(t("dash.confirmDeleteCampaign"))) {
                          runAction(`campaign:${c.id}:delete`, () => jsonRequest("/api/campaigns", "DELETE", { id: c.id }), () => {
                            if (editingCampaignId === c.id) {
                              setEditingCampaignId("");
                              setCampaignForm(null);
                            }
                          });
                        }
                      }}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-red-800 disabled:opacity-50"
                    >
                      {t("dash.deleteCampaign")}
                    </button>
                  </div>

                  {renderCampaignEdit(c)}

                  <div className="mt-4 rounded-xl border border-[#f0e6cc] bg-[#fffbf1] p-3">
                    <p className="text-[12px] font-bold uppercase tracking-widest text-[#6f6862]">{formatNumber(campaignApplicationCount)} {t("dash.applications")}</p>
                    {apps.length === 0 ? (
                      <p className="mt-1 text-[13.5px] text-[#6f6862]">{t("dash.noApps")}</p>
                    ) : (
                      <div className="mt-2 grid gap-2">{apps.map(renderBrandApplication)}</div>
                    )}
                    {campaignApplicationPagination?.hasMore && (
                      <ListingPagination
                        loaded={apps.length}
                        total={campaignApplicationCount}
                        hasMore
                        loading={listBusyKey === `applications:${c.id}`}
                        onLoadMore={() => loadMoreBrandApplications(c.id)}
                        className="mt-3 flex flex-col items-center gap-2"
                        buttonClassName="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ListingPagination
            loaded={(data.campaigns ?? []).length}
            total={data.pagination?.campaigns?.total ?? (data.campaigns ?? []).length}
            hasMore={Boolean(data.pagination?.campaigns?.hasMore)}
            loading={listBusyKey === "campaigns"}
            onLoadMore={loadMoreCampaigns}
          />
        </>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat value={formatNumber(completedProfileCount)} label={t("dash.statProfiles")} />
            <Stat value={formatNumber(data.counts?.applications ?? data.applications.length)} label={t("dash.statApplied")} />
            <Stat value={formatNumber(data.counts?.openCampaigns ?? data.openCampaigns?.length ?? 0)} label={t("dash.statOpen")} />
          </div>

          {completedProfileCount === 0 && (
            <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl bg-[#ffc53d] p-5 sm:flex-row sm:items-center">
              <p className="text-[15px] font-bold">{t("dash.completeProfile")}</p>
              <Link href="/creators" className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[14px] font-bold text-white">{t("dash.completeBtn")}</Link>
            </div>
          )}

          {completedProfiles.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[19px] font-extrabold">{t("dash.profileStatus")}</h2>
              <div className="mt-3 grid gap-3">
                {completedProfiles.map((profile) => {
                  const profileLink = [
                    normalizeProfileUrl(profile.profileUrl, profile.platform ?? undefined),
                    normalizeInstagramUrl(profile.instagram),
                    normalizeYouTubeUrl(profile.youtube),
                  ].find((link): link is string => Boolean(link));
                  const followerCount = profile.verifiedFollowers ?? profile.followers ?? 0;
                  return (
                    <div key={profile.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[16px] font-extrabold">{profile.name}</p>
                          <p className="text-[13px] text-[#6f6862]">{[platformLabel(profile.platform), opt(profile.category), opt(profile.languages), profile.location].filter(Boolean).join(" · ")}</p>
                          <p className="mt-1 text-[13px] font-semibold text-[#57534e]">
                            {profile.verifiedFollowers != null ? t("dash.verifiedFollowers") : t("dash.claimedFollowers")}: {formatNumber(followerCount)}
                          </p>
                          {profileLink && (
                            <a href={profileLink} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[13px] font-semibold text-[#c7431f]">{profileLink}</a>
                          )}
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${statusPillClass(profile.status)}`}>{statusLabel(profile.status)}</span>
                      </div>

                      {(profile.status !== "approved" || profile.verificationStatus !== "verified" || profile.moderationNote) && (
                        <div className={`mt-3 rounded-xl border p-3 ${profile.status === "rejected" || profile.status === "suspended" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                          <p className="text-[13.5px] font-semibold text-[#44403c]">{profile.status === "pending" ? t("dash.creatorInReview") : t("verify.notPublic")}</p>
                          {profile.status === "pending" && profile.verificationCode && (
                            <>
                              <p className="mt-2 text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("dash.verificationCode")}</p>
                              <p className="font-mono text-[18px] font-black tracking-wider">{profile.verificationCode}</p>
                              <p className="mt-1 text-[13px] leading-relaxed text-[#57534e]">{t("verify.creatorHelp")}</p>
                            </>
                          )}
                          {profile.moderationNote && <p className="mt-2 text-[13px] text-[#57534e]"><b>{t("dash.reviewNote")}:</b> {profile.moderationNote}</p>}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          id={`dashboard-profile-${profile.id}-edit-toggle`}
                          aria-expanded={editingProfileId === profile.id}
                          aria-controls={`dashboard-profile-${profile.id}-edit-form`}
                          onClick={() => {
                            setEditingProfileId(profile.id);
                            setProfileForm(profileToForm(profile));
                          }}
                          className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white"
                        >
                          {t("dash.editProfile")}
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `profile:${profile.id}:delete`}
                          onClick={() => {
                            if (window.confirm(t("dash.confirmDeleteProfile"))) {
                              runAction(`profile:${profile.id}:delete`, () => jsonRequest("/api/creators", "DELETE"), () => {
                                if (editingProfileId === profile.id) {
                                  setEditingProfileId("");
                                  setProfileForm(null);
                                }
                              });
                            }
                          }}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-red-800 disabled:opacity-50"
                        >
                          {t("dash.deleteProfile")}
                        </button>
                      </div>

                      {renderProfileEdit(profile)}
                    </div>
                  );
                })}
              </div>
              <ListingPagination
                loaded={(data.profiles ?? []).length}
                total={data.pagination?.profiles?.total ?? data.counts?.profiles ?? (data.profiles ?? []).length}
                hasMore={Boolean(data.pagination?.profiles?.hasMore)}
                loading={listBusyKey === "profiles"}
                onLoadMore={loadMoreProfiles}
              />
            </section>
          )}

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-[19px] font-extrabold">{t("dash.yourApps")}</h2>
              <form onSubmit={applyCreatorApplicationFilters} className="mt-3 grid gap-2 rounded-2xl border border-[#e9ddc3] bg-white p-3">
                <label htmlFor="dashboard-creator-application-search">
                  <span className="sr-only">{t("listing.searchLabel")}</span>
                  <input id="dashboard-creator-application-search" value={applicationDraft.q} onChange={(e) => setApplicationDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("listing.searchItems")} className={inputClass} />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label htmlFor="dashboard-creator-application-status-filter">
                    <span className="sr-only">{t("listing.filterStatus")}</span>
                    <select id="dashboard-creator-application-status-filter" value={applicationDraft.status} onChange={(e) => setApplicationDraft((current) => ({ ...current, status: e.target.value }))} className={inputClass}>
                      <option value="">{t("listing.allStatuses")}</option>
                      {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                  </label>
                  <label htmlFor="dashboard-creator-application-sort">
                    <span className="sr-only">{t("listing.sort")}</span>
                    <select id="dashboard-creator-application-sort" value={applicationDraft.sort} onChange={(e) => setApplicationDraft((current) => ({ ...current, sort: e.target.value }))} className={inputClass}>
                      <option value="newest">{t("listing.sortNewest")}</option>
                      <option value="oldest">{t("listing.sortOldest")}</option>
                      <option value="updated">{t("listing.sortUpdated")}</option>
                      <option value="status">{t("listing.sortStatus")}</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={listBusyKey === "applications"} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">
                    {listBusyKey === "applications" ? t("common.loading") : t("listing.searchLabel")}
                  </button>
                  {creatorApplicationHasFilters && (
                    <button type="button" disabled={listBusyKey === "applications"} onClick={clearCreatorApplicationFilters} className="rounded-xl border border-[#e9ddc3] px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">
                      {t("listing.clearFilters")}
                    </button>
                  )}
                </div>
              </form>
              <div className="mt-3 grid gap-3">
                {data.applications.length === 0 && (
                  creatorApplicationHasFilters ? (
                    <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-center">
                      <p className="text-[14px] font-bold text-[#6f6862]">{t("listing.noMatches")}</p>
                      <button type="button" onClick={clearCreatorApplicationFilters} className="mt-3 rounded-xl border border-[#1c1917] px-4 py-2 text-[13px] font-bold">
                        {t("listing.clearFilters")}
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14px] text-[#6f6862]">
                      {t("dash.noAppsYet")} <Link href="/campaigns" className="font-bold text-[#c7431f]">{t("dash.browse")}</Link>
                    </p>
                  )
                )}
                {data.applications.map(renderCreatorApplication)}
              </div>
              <ListingPagination
                loaded={data.applications.length}
                total={data.pagination?.applications?.total ?? data.applications.length}
                hasMore={Boolean(data.pagination?.applications?.hasMore)}
                loading={listBusyKey === "applications"}
                onLoadMore={loadMoreCreatorApplications}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[19px] font-extrabold">{t("dash.fresh")}</h2>
                <label htmlFor="dashboard-open-campaign-sort">
                  <span className="sr-only">{t("listing.sort")}</span>
                  <select id="dashboard-open-campaign-sort" value={openSort} onChange={(e) => changeOpenSort(e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-white px-3 py-2 text-[13px] font-bold outline-none">
                    <option value="newest">{t("listing.sortNewest")}</option>
                    <option value="oldest">{t("listing.sortOldest")}</option>
                    <option value="title">{t("listing.sortTitle")}</option>
                    <option value="business">{t("listing.sortBusiness")}</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-3">
                {(data.openCampaigns ?? []).map((c) => (
                  <Link key={c.id} href={`/campaigns?apply=${encodeURIComponent(c.id)}`} className="rounded-2xl border border-[#e9ddc3] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#1c1917]">
                    <p className="text-[15px] font-extrabold">{c.title}</p>
                    <p className="text-[13px] text-[#6f6862]">{[c.businessName, c.location, opt(c.language), opt(c.format)].filter(Boolean).join(" · ")}</p>
                  </Link>
                ))}
                {(data.openCampaigns ?? []).length === 0 && (
                  <p className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14px] text-[#6f6862]">{t("dash.freshEmpty")}</p>
                )}
              </div>
              <ListingPagination
                loaded={(data.openCampaigns ?? []).length}
                total={data.pagination?.openCampaigns?.total ?? data.counts?.openCampaigns ?? (data.openCampaigns ?? []).length}
                hasMore={Boolean(data.pagination?.openCampaigns?.hasMore)}
                loading={listBusyKey === "openCampaigns"}
                onLoadMore={loadMoreOpenCampaigns}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
