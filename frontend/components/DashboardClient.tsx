"use client";

import { useLang, type TranslationKey } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPLICATION_STATUSES,
  CAMPAIGN_REVIEW_STATUSES,
  CATEGORIES,
  CONTENT_TYPES,
  LANGUAGES,
  PLATFORMS,
  PROMOTION_TYPES,
  normalizeCategory,
  normalizeContentType,
  normalizeLanguage,
  normalizePlatform,
  normalizePromotionType,
} from "@/shared/constants";
import { readFormDraft, removeFormDraft, writeFormDraft } from "@/frontend/form-drafts";
import RequiredMark from "@/frontend/components/RequiredMark";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/shared/social-url";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import { ListingError, ListingPagination } from "@/frontend/components/ListingState";
import { appendUniqueById } from "@/frontend/api-json";
import { requestLogout } from "@/frontend/session";
import { useSession } from "@/frontend/session-context";
import { buildAuthPath } from "@/shared/return-to";
import { normalizeUserRole, USER_ROLES, type UserRole } from "@/shared/user-roles";
import { contactLinks } from "@/shared/contact-links";

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
  brandId?: string | null;
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
  deadlineAt?: string | null;
  expiresAt?: string | null;
  expiredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
type ApplicationStatusHistoryEvent = {
  status: string;
  at: string;
  actorName?: string | null;
};
type PublicCreatorProfile = {
  id: string;
  name: string;
  platform?: string | null;
  category?: string | null;
  languages?: string | null;
  location?: string | null;
  contentTypes?: string | null;
  bio?: string | null;
  followers?: number | null;
  verifiedFollowers?: number | null;
  status?: string | null;
  verificationStatus?: string | null;
  profileUrl?: string | null;
  instagram?: string | null;
  youtube?: string | null;
};
type CreatorProfileSnapshot = {
  version: 1;
  creatorId: string;
  name: string;
  platform: string;
  category: string | null;
  languages: string;
  location: string | null;
  contentTypes: string;
  bio: string | null;
  followers: number;
  verifiedFollowers: number | null;
  effectiveFollowers: number;
  status: string;
  verificationStatus: string;
  profileUrl: string | null;
  instagram: string | null;
  youtube: string | null;
  listedAt: string | null;
  capturedAt: string;
};
type CurrentCreatorProfile = {
  id: string;
  name: string;
  href: string;
};
type Application = {
  id: string;
  campaignId: string | null;
  creatorId?: string | null;
  creatorName?: string | null;
  creatorContact?: string | null;
  creatorProfile?: PublicCreatorProfile | null;
  creatorProfileSnapshot?: CreatorProfileSnapshot | null;
  snapshotCapturedAt?: string | null;
  currentCreatorProfile?: CurrentCreatorProfile | null;
  message: string | null;
  quoteAmount?: number | null;
  proposedTimelineDays?: number | null;
  proposedTimeline?: string | null;
  status: string | null;
  decisionNote?: string | null;
  decisionAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  statusHistory?: ApplicationStatusHistoryEvent[];
  campaignTitle?: string | null;
  businessName?: string | null;
  campaignStatus?: string | null;
  campaignVerificationStatus?: string | null;
  campaignDeadlineAt?: string | null;
  campaignExpiresAt?: string | null;
  format?: string | null;
};
type BrandProfile = {
  id: string;
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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
  listedAt?: string | null;
  createdAt?: string | null;
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
  brandProfile?: BrandProfile | null;
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
  deadlineAt: string;
  description: string;
  budget: string;
};
type ApplicationForm = {
  creatorContact: string;
  message: string;
  quoteAmount: string;
  proposedTimelineDays: string;
  proposedTimeline: string;
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
  constructor(public key: TranslationKey) {
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

function canonicalList<T extends string>(value: unknown, allowed: readonly T[]) {
  const items = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? splitList(value)
      : [];
  return [...new Set(items.filter((item): item is T => allowed.includes(item as T)))];
}

function isCompletedDashboardProfile(profile: Profile) {
  const followers = profile.verifiedFollowers ?? profile.followers;
  return Boolean(
    profile.status && ["pending", "approved", "rejected", "suspended"].includes(profile.status) &&
      profile.name.trim() &&
      normalizePlatform(profile.platform) &&
      normalizeCategory(profile.category) &&
      canonicalList(profile.languages, LANGUAGES).length > 0 &&
      canonicalList(profile.contentTypes, CONTENT_TYPES).length > 0 &&
      typeof followers === "number" && Number.isFinite(followers) && followers >= 0 && followers <= 100_000_000 &&
      (normalizeProfileUrl(profile.profileUrl, profile.platform ?? undefined) ||
        normalizeInstagramUrl(profile.instagram) ||
        normalizeYouTubeUrl(profile.youtube)),
  );
}

function indiaDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return byType.year && byType.month && byType.day ? `${byType.year}-${byType.month}-${byType.day}` : "";
}

function campaignHasExpired(campaign: Campaign, now: number): boolean {
  if (campaign.status === "expired") return true;
  if (!campaign.status || !["pending", "open", "paused"].includes(campaign.status)) return false;
  const expiresAt = campaign.expiresAt ? new Date(campaign.expiresAt).getTime() : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function applicationCampaignHasExpired(application: Application, now: number): boolean {
  if (application.campaignStatus === "expired") return true;
  if (!["pending", "open", "paused"].includes(application.campaignStatus ?? "")) return false;
  const expiresAt = application.campaignExpiresAt ? new Date(application.campaignExpiresAt).getTime() : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function applicationToForm(application: Application): ApplicationForm {
  return {
    creatorContact: application.creatorContact ?? "",
    message: application.message ?? "",
    quoteAmount: application.quoteAmount == null ? "" : String(application.quoteAmount),
    proposedTimelineDays:
      application.proposedTimelineDays == null ? "" : String(application.proposedTimelineDays),
    proposedTimeline: application.proposedTimeline ?? "",
  };
}

function campaignToForm(c: Campaign): CampaignForm {
  return {
    businessName: c.businessName ?? "",
    contactName: c.contactName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    title: c.title ?? "",
    promotionType: normalizePromotionType(c.promotionType) ?? "",
    category: normalizeCategory(c.category) ?? "",
    website: c.website ?? "",
    targetAudience: c.targetAudience ?? "",
    location: c.location ?? "",
    language: normalizeLanguage(c.language) ?? "",
    format: normalizeContentType(c.format) ?? "",
    deadlineAt: indiaDateInputValue(c.deadlineAt),
    description: c.description ?? "",
    budget: c.budget == null ? "" : String(c.budget),
  };
}

function profileToForm(p: Profile): ProfileForm {
  // Signup placeholder rows can carry database defaults that the creator did
  // not choose. Make completion explicit instead of presenting those values
  // as an already-completed profile.
  const incomplete = p.status === "incomplete";
  return {
    name: p.name ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    platform: incomplete ? "" : normalizePlatform(p.platform) ?? "",
    instagram: p.instagram ?? "",
    youtube: p.youtube ?? "",
    profileUrl: p.profileUrl ?? "",
    followers: incomplete || p.followers == null ? "" : String(p.followers),
    category: normalizeCategory(p.category) ?? "",
    languages: incomplete ? [] : canonicalList(p.languages, LANGUAGES),
    location: p.location ?? "",
    contentTypes: incomplete ? [] : canonicalList(p.contentTypes, CONTENT_TYPES),
    bio: p.bio ?? "",
  };
}

type DashboardEditDraft<FormType> = {
  baseUpdatedAt: string | null;
  form: FormType;
};

function dashboardEditDraftKey(userId: string, kind: "campaign" | "profile", entityId: string) {
  return `yaarlink:dashboard-${kind}-edit-draft:${userId}:${entityId}:v1`;
}

function draftString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length <= 5000 ? value : fallback;
}

function sanitizeCampaignForm(value: unknown, fallback: CampaignForm): CampaignForm {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  return {
    businessName: draftString(source.businessName, fallback.businessName),
    contactName: draftString(source.contactName, fallback.contactName),
    email: draftString(source.email, fallback.email),
    phone: draftString(source.phone, fallback.phone),
    title: draftString(source.title, fallback.title),
    promotionType: normalizePromotionType(source.promotionType) ?? "",
    category: normalizeCategory(source.category) ?? "",
    website: draftString(source.website, fallback.website),
    targetAudience: draftString(source.targetAudience, fallback.targetAudience),
    location: draftString(source.location, fallback.location),
    language: normalizeLanguage(source.language) ?? "",
    format: normalizeContentType(source.format) ?? "",
    deadlineAt:
      source.deadlineAt === "" || (typeof source.deadlineAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.deadlineAt))
        ? source.deadlineAt
        : fallback.deadlineAt,
    description: draftString(source.description, fallback.description),
    budget: draftString(source.budget, fallback.budget),
  };
}

function sanitizeProfileForm(value: unknown, fallback: ProfileForm): ProfileForm {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  return {
    name: draftString(source.name, fallback.name),
    phone: draftString(source.phone, fallback.phone),
    email: draftString(source.email, fallback.email),
    platform: normalizePlatform(source.platform) ?? "",
    instagram: draftString(source.instagram, fallback.instagram),
    youtube: draftString(source.youtube, fallback.youtube),
    profileUrl: draftString(source.profileUrl, fallback.profileUrl),
    followers: draftString(source.followers, fallback.followers),
    category: normalizeCategory(source.category) ?? "",
    languages: canonicalList(source.languages, LANGUAGES),
    location: draftString(source.location, fallback.location),
    contentTypes: canonicalList(source.contentTypes, CONTENT_TYPES),
    bio: draftString(source.bio, fallback.bio),
  };
}

function readDashboardEditDraft<FormType>(
  key: string,
  baseUpdatedAt: string | null | undefined,
  sanitize: (value: unknown) => FormType,
) {
  const draft = readFormDraft(key) as { baseUpdatedAt?: unknown; form?: unknown } | null;
  if (!draft || typeof draft !== "object") return null;
  const draftBase = typeof draft.baseUpdatedAt === "string" ? draft.baseUpdatedAt : draft.baseUpdatedAt === null ? null : undefined;
  if (draftBase !== (baseUpdatedAt ?? null)) {
    removeFormDraft(key);
    return null;
  }
  return sanitize(draft.form);
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
  const { markLoggedOut } = useSession();
  const { t, opt, promo, platform: platformLabel, status: statusLabel, apiErrorKey, formatNumber, formatCurrency, formatDate, formatDateTime, formatRelativeTime } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [activeView, setActiveView] = useState<UserRole>(initialView);
  const activeViewRef = useRef<UserRole>(initialView);
  const [errorKey, setErrorKey] = useState<TranslationKey | "">(initialSessionUnavailable ? "api.serviceUnavailable" : "");
  const [noticeKey, setNoticeKey] = useState<TranslationKey | "">("");
  const [actionErrorKey, setActionErrorKey] = useState<TranslationKey | "">("");
  const [busyKey, setBusyKey] = useState("");
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [clientNow, setClientNow] = useState<number | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignForm | null>(null);
  const [campaignEditBaseUpdatedAt, setCampaignEditBaseUpdatedAt] = useState<string | null>(null);
  const [campaignDraftRestored, setCampaignDraftRestored] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState("");
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [profileEditBaseUpdatedAt, setProfileEditBaseUpdatedAt] = useState<string | null>(null);
  const [profileDraftRestored, setProfileDraftRestored] = useState(false);
  const [editingApplicationId, setEditingApplicationId] = useState("");
  const [reactivatingApplicationId, setReactivatingApplicationId] = useState("");
  const [applicationForm, setApplicationForm] = useState<ApplicationForm>({
    creatorContact: "",
    message: "",
    quoteAmount: "",
    proposedTimelineDays: "",
    proposedTimeline: "",
  });
  const [applicationConsent, setApplicationConsent] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [campaignDraft, setCampaignDraft] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [campaignQuery, setCampaignQuery] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [applicationDraft, setApplicationDraft] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [applicationQuery, setApplicationQuery] = useState<ListQuery>({ q: "", status: "", sort: "newest" });
  const [profileSort, setProfileSort] = useState("newest");
  const [openSort, setOpenSort] = useState("newest");
  const [listBusyKey, setListBusyKey] = useState("");
  const sectionRequestRef = useRef<Record<string, number>>({});

  const fetchData = useCallback(
    async (
      extra: Record<string, string> = {},
      overrides: { campaignQuery?: ListQuery; applicationQuery?: ListQuery; profileSort?: string; openSort?: string; view?: UserRole } = {},
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
        profileSort: overrides.profileSort ?? profileSort,
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
        markLoggedOut();
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
    [apiErrorKey, applicationQuery, campaignQuery, initialView, markLoggedOut, openSort, profileSort, returnTo, router],
  );
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    const updateNow = () => setClientNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

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
    overrides: { campaignQuery?: ListQuery; applicationQuery?: ListQuery; profileSort?: string; openSort?: string; view?: UserRole } = {},
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

  const changeProfileSort = (value: string) => {
    setProfileSort(value);
    void loadDashboardSection("profiles", {}, {}, { profileSort: value });
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
    setCampaignEditBaseUpdatedAt(null);
    setCampaignDraftRestored(false);
    setEditingProfileId("");
    setProfileForm(null);
    setProfileEditBaseUpdatedAt(null);
    setProfileDraftRestored(false);
    setEditingApplicationId("");
    setReactivatingApplicationId("");
    setApplicationForm({ creatorContact: "", message: "", quoteAmount: "", proposedTimelineDays: "", proposedTimeline: "" });
    setApplicationConsent(false);
    setDecisionNotes({});
    setCampaignDraft(emptyQuery);
    setCampaignQuery(emptyQuery);
    setApplicationDraft(emptyQuery);
    setApplicationQuery(emptyQuery);
    setProfileSort("newest");
    setOpenSort("newest");
    setListBusyKey("");
    window.history.replaceState(null, "", `/dashboard?view=${view}`);

    try {
      const next = await fetchDataRef.current(
        {},
        { view, campaignQuery: emptyQuery, applicationQuery: emptyQuery, profileSort: "newest", openSort: "newest" },
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

  useEffect(() => {
    if (!data?.user?.id || !editingCampaignId || !campaignForm) return;
    writeFormDraft(dashboardEditDraftKey(data.user.id, "campaign", editingCampaignId), {
      baseUpdatedAt: campaignEditBaseUpdatedAt,
      form: sanitizeCampaignForm(campaignForm, campaignForm),
    });
  }, [campaignEditBaseUpdatedAt, campaignForm, data?.user?.id, editingCampaignId]);

  useEffect(() => {
    if (!data?.user?.id || !editingProfileId || !profileForm) return;
    writeFormDraft(dashboardEditDraftKey(data.user.id, "profile", editingProfileId), {
      baseUpdatedAt: profileEditBaseUpdatedAt,
      form: sanitizeProfileForm(profileForm, profileForm),
    });
  }, [data?.user?.id, editingProfileId, profileEditBaseUpdatedAt, profileForm]);

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
        markLoggedOut();
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
    markLoggedOut();
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
  const completedProfiles = (data.profiles ?? []).filter(isCompletedDashboardProfile);
  const completedProfileCount = data.counts?.completedProfiles ?? completedProfiles.length;
  const notifications = data.notifications ?? [];
  const unreadCount = data.unreadNotificationCount ?? data.counts?.unreadNotifications ?? notifications.filter((n) => !n.readAt).length;
  const brandHasFilters = Boolean(
    campaignQuery.q || campaignQuery.status || campaignQuery.sort !== "newest" ||
    applicationQuery.q || applicationQuery.status || applicationQuery.sort !== "newest",
  );
  const creatorApplicationHasFilters = Boolean(applicationQuery.q || applicationQuery.status || applicationQuery.sort !== "newest");

  const startCampaignEdit = (campaign: Campaign) => {
    const baseForm = campaignToForm(campaign);
    const restoredForm = readDashboardEditDraft(
      dashboardEditDraftKey(user.id, "campaign", campaign.id),
      campaign.updatedAt,
      (value) => sanitizeCampaignForm(value, baseForm),
    );
    setCampaignEditBaseUpdatedAt(campaign.updatedAt ?? null);
    setCampaignDraftRestored(Boolean(restoredForm && JSON.stringify(restoredForm) !== JSON.stringify(baseForm)));
    setCampaignForm(restoredForm ?? baseForm);
    setEditingCampaignId(campaign.id);
  };

  const closeCampaignEdit = (campaign: Campaign, discardDraft = false, focusToggle = false) => {
    if (discardDraft) removeFormDraft(dashboardEditDraftKey(user.id, "campaign", campaign.id));
    if (focusToggle) document.getElementById(`dashboard-campaign-${campaign.id}-edit-toggle`)?.focus();
    setEditingCampaignId("");
    setCampaignForm(null);
    setCampaignEditBaseUpdatedAt(null);
    setCampaignDraftRestored(false);
  };

  const startProfileEdit = (profile: Profile) => {
    const baseForm = profileToForm(profile);
    const restoredForm = readDashboardEditDraft(
      dashboardEditDraftKey(user.id, "profile", profile.id),
      profile.updatedAt,
      (value) => sanitizeProfileForm(value, baseForm),
    );
    setProfileEditBaseUpdatedAt(profile.updatedAt ?? null);
    setProfileDraftRestored(Boolean(restoredForm && JSON.stringify(restoredForm) !== JSON.stringify(baseForm)));
    setProfileForm(restoredForm ?? baseForm);
    setEditingProfileId(profile.id);
  };

  const closeProfileEdit = (profile: Profile, discardDraft = false, focusToggle = false) => {
    if (discardDraft) removeFormDraft(dashboardEditDraftKey(user.id, "profile", profile.id));
    if (focusToggle) document.getElementById(`dashboard-profile-${profile.id}-edit-toggle`)?.focus();
    setEditingProfileId("");
    setProfileForm(null);
    setProfileEditBaseUpdatedAt(null);
    setProfileDraftRestored(false);
  };

  const notificationText = (n: Notification) => {
    const template = t(
      n.kind === "application_received" ? "notify.received" : n.kind === "application_withdrawn" ? "notify.withdrawn" : "notify.status",
    );
    return template
      .replace("{actor}", n.actorName ?? "")
      .replace("{campaign}", n.campaignTitle)
      .replace("{status}", statusLabel(n.applicationStatus));
  };

  const renderContactActions = (value?: string | null, platform?: string | null) => {
    const links = contactLinks(value, platform);
    if (!links.display) return null;
    const primaryHref =
      links.kind === "whatsapp"
        ? links.whatsappHref
        : links.kind === "phone"
          ? links.telHref
          : links.mailtoHref ?? links.profileHref;
    const external = Boolean(links.profileHref || links.kind === "whatsapp");
    const actionClass = "rounded-lg border border-[#e9ddc3] bg-white px-2.5 py-1 text-[11.5px] font-bold text-[#1c1917] hover:bg-[#fff4de]";
    return (
      <div>
        {primaryHref ? (
          <a
            href={primaryHref}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="break-all font-semibold text-[#c7431f] hover:underline"
          >
            {links.display}
          </a>
        ) : (
          <p className="break-all font-semibold text-[#c7431f]">{links.display}</p>
        )}
        {(links.telHref || links.whatsappHref) && (links.kind === "phone" || links.kind === "whatsapp") && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {links.telHref && (
              <a href={links.telHref} aria-label={`${t("contact.call")}: ${links.display}`} className={actionClass}>
                {t("contact.call")}
              </a>
            )}
            {links.whatsappHref && (
              <a
                href={links.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t("contact.whatsapp")}: ${links.display}`}
                className={actionClass}
              >
                {t("contact.whatsapp")}
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderApplicationProposal = (a: Application) => {
    const timelineDays =
      a.proposedTimelineDays == null
        ? null
        : a.proposedTimelineDays === 1
          ? t("dash.oneDay")
          : t("dash.daysCount", { days: a.proposedTimelineDays });
    const timeline = [timelineDays, a.proposedTimeline].filter(Boolean).join(" • ");
    const hasProposal = a.quoteAmount != null || Boolean(timeline);
    return (
      <div className="mt-3 grid gap-1.5 rounded-lg border border-[#f0e6cc] bg-white p-2.5 text-[12.5px]">
        {a.quoteAmount != null && (
          <p><b>{t("dash.quote")}:</b> {formatCurrency(a.quoteAmount)}</p>
        )}
        {timeline && (
          <p className="leading-relaxed"><b>{t("dash.proposedTimeline")}:</b> {timeline}</p>
        )}
        {!hasProposal && <p className="font-semibold text-[#6f6862]">{t("dash.noProposal")}</p>}
      </div>
    );
  };

  const renderProfileSnapshot = (a: Application, { own = false }: { own?: boolean } = {}) => {
    const snapshot = a.creatorProfileSnapshot;
    if (!snapshot) {
      return own ? null : (
        <p className="mt-3 rounded-lg border border-dashed border-[#e9ddc3] bg-white p-2.5 text-[12.5px] font-semibold text-[#6f6862]">
          {t("dash.snapshotUnavailable")}
        </p>
      );
    }
    const socialLinks = [...new Set([
      normalizeProfileUrl(snapshot.profileUrl, snapshot.platform),
      normalizeInstagramUrl(snapshot.instagram),
      normalizeYouTubeUrl(snapshot.youtube),
    ].filter((link): link is string => Boolean(link)))];
    const capturedAt = a.snapshotCapturedAt ?? snapshot.capturedAt;
    return (
      <div className="mt-3 rounded-lg border border-[#d9e8dc] bg-[#f7fbf7] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#31543b]">
            {own ? t("dash.yourProfileSnapshot") : t("dash.profileSnapshot")}
          </p>
          {capturedAt && (
            <p className="text-[11.5px] font-semibold text-[#6f6862]">
              {t("dash.snapshotCaptured", { date: formatDateTime(capturedAt) })}
            </p>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#6f6862]">{t("dash.profileSnapshotHelp")}</p>
        <p className="mt-2 text-[13px] font-extrabold text-[#1c1917]">{snapshot.name}</p>
        <p className="mt-0.5 text-[12.5px] font-semibold text-[#44403c]">
          {[platformLabel(snapshot.platform), opt(snapshot.category), opt(snapshot.languages), snapshot.location].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-[12.5px] text-[#57534e]">
          {snapshot.verifiedFollowers != null ? t("dash.verifiedFollowers") : t("dash.claimedFollowers")}: {formatNumber(snapshot.effectiveFollowers)}
          {snapshot.contentTypes ? ` · ${opt(snapshot.contentTypes)}` : ""}
        </p>
        {snapshot.bio && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-[#6f6862]">{snapshot.bio}</p>}
        {socialLinks.length > 0 && (
          <div className="mt-2 grid gap-1">
            {socialLinks.map((link) => (
              <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="break-all text-[12px] font-semibold text-[#c7431f] hover:underline">
                {link}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStatusHistory = (a: Application) => {
    const history = a.statusHistory?.length
      ? a.statusHistory
      : [{ status: a.status ?? "applied", at: a.createdAt ?? "", actorName: a.creatorName ?? null }];
    return (
      <div className="mt-3 rounded-lg border border-[#f0e6cc] bg-[#fffbf1] p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#6f6862]">{t("dash.statusHistory")}</p>
        <ol className="mt-1.5 grid gap-1">
          {history.map((event, index) => (
            <li key={`${event.status}-${event.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px]">
              <span className="font-bold text-[#44403c]">
                {statusLabel(event.status)}
                {event.actorName && <span className="ml-1.5 font-semibold text-[#6f6862]">{event.actorName}</span>}
              </span>
              {event.at && (
                <time dateTime={event.at} className="text-[#6f6862]">
                  {formatDateTime(event.at)}
                </time>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  };

  const renderBrandRecord = () => {
    const brandProfile = data.brandProfile;
    return (
      <section className="mt-6 rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow" aria-labelledby="brand-record-heading">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="brand-record-heading" className="text-[17px] font-extrabold">{t("dash.brandRecord")}</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6f6862]">{t("dash.brandRecordHelp")}</p>
          </div>
          {brandProfile?.status && (
            <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${statusPillClass(brandProfile.status)}`}>{statusLabel(brandProfile.status)}</span>
          )}
        </div>
        {brandProfile ? (
          <div className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#6f6862]">{t("account.name")}</p>
              <p className="mt-1 font-bold">{brandProfile.name}</p>
              {brandProfile.createdAt && (
                <p className="mt-1 text-[12px] text-[#6f6862]">
                  {t("dash.brandRecordCreated")}: <time dateTime={brandProfile.createdAt}>{formatDate(brandProfile.createdAt)}</time>
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#6f6862]">{t("brand.email")}</p>
              <div className="mt-1">{brandProfile.email ? renderContactActions(brandProfile.email) : <span className="text-[#6f6862]">—</span>}</div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#6f6862]">{t("brand.phone")}</p>
              <div className="mt-1">{brandProfile.phone ? renderContactActions(brandProfile.phone) : <span className="text-[#6f6862]">—</span>}</div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#e9ddc3] bg-[#fffbf1] p-4">
            <p className="text-[13.5px] font-semibold text-[#57534e]">{t("dash.noBrandRecord")}</p>
            <Link href="/brands" className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white">{t("dash.create")}</Link>
          </div>
        )}
      </section>
    );
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
          closeCampaignEdit(c, false, true);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const { deadlineAt, ...campaignFields } = campaignForm;
          const deadlineChanged = deadlineAt !== campaignToForm(c).deadlineAt;
          runAction(
            `campaign:${c.id}:edit`,
            () => jsonRequest("/api/campaigns", "PATCH", {
              id: c.id,
              ...campaignFields,
              // Omit an untouched deadline so a contact/content edit does not
              // reset a default expiry that was already saved on the row.
              ...(deadlineChanged ? { deadlineAt: deadlineAt || null } : {}),
              expectedUpdatedAt: campaignEditBaseUpdatedAt ?? undefined,
            }),
            () => closeCampaignEdit(c, true, true),
          );
        }}
      >
        <h3 className="text-[16px] font-extrabold">{t("dash.editCampaign")}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6f6862]">{t("dash.editReviewWarning")}</p>
        {campaignDraftRestored && (
          <p role="status" className="mt-3 rounded-xl border border-[#bfe3c5] bg-[#f2fbf3] px-4 py-3 text-[13px] font-bold text-[#17452e]">
            {t("authFlow.draftRestored")}
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-business-name`}>{t("brand.businessName")}<input autoFocus id={`dashboard-campaign-${c.id}-business-name`} name="businessName" autoComplete="organization" required value={campaignForm.businessName} onChange={(e) => set("businessName", e.target.value)} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-contact-name`}>{t("brand.contactName")}<input id={`dashboard-campaign-${c.id}-contact-name`} name="contactName" autoComplete="name" value={campaignForm.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`} htmlFor={`dashboard-campaign-${c.id}-title`}>{t("brand.titleLabel")}<input id={`dashboard-campaign-${c.id}-title`} name="title" autoComplete="off" required value={campaignForm.title} onChange={(e) => set("title", e.target.value)} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-promotion-type`}><span>{t("brand.promoting")}<RequiredMark /></span>
            <select id={`dashboard-campaign-${c.id}-promotion-type`} name="promotionType" autoComplete="off" required value={campaignForm.promotionType} onChange={(e) => set("promotionType", e.target.value)} className={inputClass}>
              <option value="" disabled>{t("form.chooseOption")}</option>
              {PROMOTION_TYPES.map((p) => <option key={p.id} value={p.id}>{promo(p.title)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-category`}>{t("brand.category")}
            <select id={`dashboard-campaign-${c.id}-category`} name="category" autoComplete="off" value={campaignForm.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
              <option value="">{t("brand.noneOption")}</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{opt(category)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-website`}>{t("brand.website")}<input id={`dashboard-campaign-${c.id}-website`} name="website" autoComplete="url" inputMode="url" value={campaignForm.website} onChange={(e) => set("website", e.target.value)} placeholder={t("brand.phWebsite")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-target-audience`}>{t("brand.audience")}<input id={`dashboard-campaign-${c.id}-target-audience`} name="targetAudience" autoComplete="off" value={campaignForm.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder={t("brand.phAudience")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-location`}>{t("brand.location")}<input id={`dashboard-campaign-${c.id}-location`} name="location" autoComplete="address-level2" value={campaignForm.location} onChange={(e) => set("location", e.target.value)} placeholder={t("brand.phLocation")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-budget`}><span>{t("brand.budget")}<RequiredMark /></span><input id={`dashboard-campaign-${c.id}-budget`} name="budget" autoComplete="off" inputMode="numeric" required aria-describedby={`dashboard-campaign-${c.id}-budget-hint`} value={campaignForm.budget} onChange={(e) => set("budget", e.target.value)} placeholder={t("brand.budgetPlaceholder")} className={inputClass} /><span id={`dashboard-campaign-${c.id}-budget-hint`} className="text-[12px] font-semibold text-[#6f6862]">{t("brand.budgetHint")}</span></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-language`}><span>{t("brand.language")}<RequiredMark /></span>
            <select id={`dashboard-campaign-${c.id}-language`} name="language" autoComplete="off" required value={campaignForm.language} onChange={(e) => set("language", e.target.value)} className={inputClass}>
              <option value="" disabled>{t("form.chooseOption")}</option>
              {LANGUAGES.map((language) => <option key={language} value={language}>{opt(language)}</option>)}
            </select>
          </label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-format`}><span>{t("brand.format")}<RequiredMark /></span>
            <select id={`dashboard-campaign-${c.id}-format`} name="format" autoComplete="off" required value={campaignForm.format} onChange={(e) => set("format", e.target.value)} className={inputClass}>
              <option value="" disabled>{t("form.chooseOption")}</option>
              {CONTENT_TYPES.map((format) => <option key={format} value={format}>{opt(format)}</option>)}
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`} htmlFor={`dashboard-campaign-${c.id}-deadline`}>
            {t("brand.deadline")}
            <input id={`dashboard-campaign-${c.id}-deadline`} name="deadlineAt" type="date" autoComplete="off" aria-describedby={`dashboard-campaign-${c.id}-deadline-help`} value={campaignForm.deadlineAt} onChange={(e) => set("deadlineAt", e.target.value)} className={inputClass} />
            <span id={`dashboard-campaign-${c.id}-deadline-help`} className="text-[12px] font-semibold leading-relaxed text-[#6f6862]">
              {t("dash.deadlineHelp")}
              {(c.deadlineAt ?? c.expiresAt) && (
                <>
                  {" "}{t(c.status === "expired" ? "dash.expiredOn" : "dash.expiresOn")}: {formatDate(c.deadlineAt ?? c.expiresAt)}
                </>
              )}
            </span>
          </label>
          <p id={`dashboard-campaign-${c.id}-contact-note`} className="text-[12.5px] font-semibold leading-relaxed text-[#6f6862] sm:col-span-2">{t("brand.contactNote")}</p>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-phone`}>{t("brand.phone")}<input id={`dashboard-campaign-${c.id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" aria-describedby={`dashboard-campaign-${c.id}-contact-note`} value={campaignForm.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-campaign-${c.id}-email`}>{t("brand.email")}<input id={`dashboard-campaign-${c.id}-email`} name="email" type="email" inputMode="email" autoComplete="email" aria-describedby={`dashboard-campaign-${c.id}-contact-note`} value={campaignForm.email} onChange={(e) => set("email", e.target.value)} placeholder={t("brand.phEmail")} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`} htmlFor={`dashboard-campaign-${c.id}-description`}>{t("brand.descLabel")}<textarea id={`dashboard-campaign-${c.id}-description`} name="description" autoComplete="off" value={campaignForm.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder={t("brand.phDesc")} className={inputClass} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">{busy ? t("dash.saving") : t("dash.saveChanges")}</button>
          <button type="button" disabled={busy} onClick={() => closeCampaignEdit(c, true, true)} className="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">{t("dash.cancel")}</button>
        </div>
      </form>
    );
  };

  const renderBrandApplication = (a: Application) => {
    const actionable = a.status === "applied" || a.status === "shortlisted" || a.status === "hired";
    const applicantProfile = a.creatorProfile;
    const applicantSocialLinks = applicantProfile
      ? [...new Set([
          normalizeProfileUrl(applicantProfile.profileUrl, applicantProfile.platform ?? undefined),
          normalizeInstagramUrl(applicantProfile.instagram),
          normalizeYouTubeUrl(applicantProfile.youtube),
        ].filter((link): link is string => Boolean(link)))]
      : [];
    const currentProfile = a.currentCreatorProfile ?? (applicantProfile
      ? { id: applicantProfile.id, name: applicantProfile.name, href: `/creators/${applicantProfile.id}` }
      : null);
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
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#6f6862]">{t("dash.submittedName")}</p>
            <p className="font-bold">{a.creatorName ?? applicantProfile?.name}</p>
            {a.creatorContact && (
              <>
                {renderContactActions(a.creatorContact, applicantProfile?.platform)}
                <p className="mt-0.5 text-[11.5px] font-semibold text-[#6f6862]">🔒 {t("dash.brandContactUse")}</p>
              </>
            )}
            <p className="mt-0.5 text-[12px] text-[#6f6862]">
              {t("dash.appliedOn")}: {a.createdAt ? <time dateTime={a.createdAt}>{formatDateTime(a.createdAt)}</time> : formatDate(a.createdAt)}
            </p>
            {a.decisionAt && (
              <p className="mt-0.5 text-[12px] text-[#6f6862]">
                {t("dash.updatedOn")}: <time dateTime={a.decisionAt}>{formatDateTime(a.decisionAt)}</time>
              </p>
            )}
          </div>
          <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${statusPillClass(a.status)}`}>{statusLabel(a.status)}</span>
        </div>
        {a.message && <p className="mt-2 text-[#57534e]">“{a.message}”</p>}
        {a.decisionNote && <p className="mt-2 rounded-lg bg-[#fffbf1] p-2 text-[12.5px] text-[#57534e]"><b>{t("dash.brandNote")}:</b> {a.decisionNote}</p>}
        {renderApplicationProposal(a)}
        {renderProfileSnapshot(a)}
        {applicantProfile && (
          <div className="mt-3 rounded-lg border border-[#f0e6cc] bg-[#fffbf1] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#6f6862]">{t("dash.currentCreatorProfile")}</p>
                <p className="mt-0.5 text-[13px] font-extrabold text-[#1c1917]">{currentProfile?.name ?? applicantProfile.name}</p>
              </div>
              {currentProfile && (
                <Link href={currentProfile.href} aria-label={`${t("dash.viewCurrentProfile")}: ${currentProfile.name}`} className="text-[12px] font-bold text-[#c7431f] hover:underline">
                  {t("dash.viewCurrentProfile")}
                </Link>
              )}
            </div>
            <p className="mt-1.5 text-[12.5px] font-semibold text-[#44403c]">
              {[platformLabel(applicantProfile.platform), opt(applicantProfile.category), opt(applicantProfile.languages), applicantProfile.location].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-[12.5px] text-[#57534e]">
              {applicantProfile.verifiedFollowers != null ? t("dash.verifiedFollowers") : t("dash.claimedFollowers")}: {formatNumber(applicantProfile.verifiedFollowers ?? applicantProfile.followers ?? 0)}
              {applicantProfile.contentTypes ? ` · ${opt(applicantProfile.contentTypes)}` : ""}
            </p>
            {applicantProfile.bio && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-[#6f6862]">{applicantProfile.bio}</p>}
            {applicantSocialLinks.length > 0 && (
              <div className="mt-2 grid gap-1">
                {applicantSocialLinks.map((link) => (
                  <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="break-all text-[12px] font-semibold text-[#c7431f] hover:underline">
                    {link}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        {renderStatusHistory(a)}
        {actionable && (
          <div className="mt-3 grid gap-2">
            {a.status === "hired" && (
              <p role="note" className="rounded-lg bg-[#faf6ed] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#9a3412]">
                {t("dash.offPlatformHiredNote")}
              </p>
            )}
            <label className="grid gap-1 text-[12.5px] font-bold" htmlFor={`dashboard-decision-note-${a.id}`}>
              {t("dash.decisionNote")}
              <textarea id={`dashboard-decision-note-${a.id}`} name="decisionNote" autoComplete="off"
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
          closeProfileEdit(profile, false, true);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!profileForm.profileUrl.trim() && !profileForm.instagram.trim() && !profileForm.youtube.trim()) {
            setActionErrorKey("api.profileLinkRequired");
            return;
          }
          if (profileForm.languages.length === 0) {
            setActionErrorKey("api.invalidLanguages");
            return;
          }
          if (profileForm.contentTypes.length === 0) {
            setActionErrorKey("api.invalidContentTypes");
            return;
          }
          runAction(
            `profile:${profile.id}:edit`,
            () => jsonRequest("/api/creators", "PATCH", { ...profileForm, expectedUpdatedAt: profileEditBaseUpdatedAt ?? undefined }),
            () => closeProfileEdit(profile, true, true),
          );
        }}
      >
        <h3 className="text-[16px] font-extrabold">{t("dash.editProfile")}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6f6862]">{t("dash.editReviewWarning")}</p>
        {profileDraftRestored && (
          <p role="status" className="mt-3 rounded-xl border border-[#bfe3c5] bg-[#f2fbf3] px-4 py-3 text-[13px] font-bold text-[#17452e]">
            {t("authFlow.draftRestored")}
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-name`}>{t("cr.name")}<input autoFocus id={`dashboard-profile-${profile.id}-name`} name="name" autoComplete="name" required value={profileForm.name} onChange={(e) => set("name", e.target.value)} placeholder={t("cr.phName")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-phone`}>{t("cr.phone")}<input id={`dashboard-profile-${profile.id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" value={profileForm.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-email`}>{t("cr.email")}<input id={`dashboard-profile-${profile.id}-email`} name="email" type="email" inputMode="email" autoComplete="email" value={profileForm.email} onChange={(e) => set("email", e.target.value)} placeholder={t("cr.phEmail")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-location`}>{t("cr.city")}<input id={`dashboard-profile-${profile.id}-location`} name="location" autoComplete="address-level2" value={profileForm.location} onChange={(e) => set("location", e.target.value)} placeholder={t("cr.phCity")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-platform`}><span>{t("cr.platform")}<RequiredMark /></span>
            <select id={`dashboard-profile-${profile.id}-platform`} name="platform" autoComplete="off" required value={profileForm.platform} onChange={(e) => set("platform", e.target.value)} className={inputClass}>
              <option value="" disabled>{t("form.chooseOption")}</option>
              {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platformLabel(platform)}</option>)}
            </select>
          </label>
          <p id={`dashboard-profile-${profile.id}-social-hint`} className="text-[12.5px] font-semibold leading-relaxed text-[#6f6862] sm:col-span-2">{t("cr.socialHint")}</p>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-profile-url`}>{t("cr.profileLink")}<input id={`dashboard-profile-${profile.id}-profile-url`} name="profileUrl" autoComplete="url" inputMode="url" aria-describedby={`dashboard-profile-${profile.id}-social-hint`} value={profileForm.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder={t("cr.phProfile")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-instagram`}>{t("cr.instagram")}<input id={`dashboard-profile-${profile.id}-instagram`} name="instagram" autoComplete="url" inputMode="url" aria-describedby={`dashboard-profile-${profile.id}-social-hint`} value={profileForm.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder={t("cr.phIg")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-youtube`}>{t("cr.youtube")}<input id={`dashboard-profile-${profile.id}-youtube`} name="youtube" autoComplete="url" inputMode="url" aria-describedby={`dashboard-profile-${profile.id}-social-hint`} value={profileForm.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder={t("cr.phYt")} className={inputClass} /></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-followers`}><span>{t("cr.followers")}<RequiredMark /></span><input id={`dashboard-profile-${profile.id}-followers`} name="followers" autoComplete="off" required aria-describedby={`dashboard-profile-${profile.id}-followers-hint`} value={profileForm.followers} onChange={(e) => set("followers", e.target.value)} placeholder={t("cr.phFollowers")} className={inputClass} /><span id={`dashboard-profile-${profile.id}-followers-hint`} className="text-[12px] font-semibold text-[#6f6862]">{t("cr.followersHint")}</span></label>
          <label className={labelClass} htmlFor={`dashboard-profile-${profile.id}-category`}><span>{t("cr.category")}<RequiredMark /></span>
            <select id={`dashboard-profile-${profile.id}-category`} name="category" autoComplete="off" required value={profileForm.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
              <option value="" disabled>{t("form.chooseOption")}</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{opt(category)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4">
          <p id={`dashboard-profile-${profile.id}-languages-label`} className="text-[13.5px] font-bold">{t("cr.langs")}<span className="sr-only"> ({t("form.required")})</span></p>
          <p id={`dashboard-profile-${profile.id}-languages-hint`} className="mt-1 text-[12.5px] font-semibold text-[#6f6862]">{t("form.chooseAtLeastOne")}</p>
          <div role="group" aria-labelledby={`dashboard-profile-${profile.id}-languages-label`} aria-describedby={`dashboard-profile-${profile.id}-languages-hint`} className="mt-2 flex flex-wrap gap-2">
            {LANGUAGES.map((language) => (
              <button key={language} type="button" onClick={() => toggle("languages", language)} aria-pressed={profileForm.languages.includes(language)} className={`rounded-full border px-4 py-2 text-[13px] font-bold ${profileForm.languages.includes(language) ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-white"}`}>{opt(language)}</button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p id={`dashboard-profile-${profile.id}-content-types-label`} className="text-[13.5px] font-bold">{t("cr.content")}<RequiredMark /></p>
          <p id={`dashboard-profile-${profile.id}-content-types-hint`} className="mt-1 text-[12.5px] font-semibold text-[#6f6862]">{t("form.chooseAtLeastOne")}</p>
          <div role="group" aria-labelledby={`dashboard-profile-${profile.id}-content-types-label`} aria-describedby={`dashboard-profile-${profile.id}-content-types-hint`} className="mt-2 flex flex-wrap gap-2">
            {CONTENT_TYPES.map((contentType) => (
              <button key={contentType} type="button" onClick={() => toggle("contentTypes", contentType)} aria-pressed={profileForm.contentTypes.includes(contentType)} className={`rounded-full border px-4 py-2 text-[13px] font-bold ${profileForm.contentTypes.includes(contentType) ? "border-[#c7431f] bg-[#c7431f] text-white" : "border-[#e9ddc3] bg-white"}`}>{opt(contentType)}</button>
            ))}
          </div>
        </div>
        <label className={`${labelClass} mt-4`} htmlFor={`dashboard-profile-${profile.id}-bio`}>{t("cr.bio")}<textarea id={`dashboard-profile-${profile.id}-bio`} name="bio" autoComplete="off" value={profileForm.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder={t("cr.phBio")} className={inputClass} /></label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">{busy ? t("dash.saving") : t("dash.saveChanges")}</button>
          <button type="button" disabled={busy} onClick={() => closeProfileEdit(profile, true, true)} className="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">{t("dash.cancel")}</button>
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
    const campaignExpired = applicationCampaignHasExpired(a, clientNow ?? 0);
    return (
      <div key={a.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold">{a.campaignTitle ?? t("nav.campaigns")}</p>
            <p className="truncate text-[13px] text-[#6f6862]">{[a.businessName, opt(a.format)].filter(Boolean).join(" · ")}</p>
            <p className="mt-0.5 text-[12px] text-[#6f6862]">
              {t("dash.appliedOn")}: {a.createdAt ? <time dateTime={a.createdAt}>{formatDateTime(a.createdAt)}</time> : formatDate(a.createdAt)}
            </p>
            {a.decisionAt && (
              <p className="mt-0.5 text-[12px] text-[#6f6862]">
                {t("dash.updatedOn")}: <time dateTime={a.decisionAt}>{formatDateTime(a.decisionAt)}</time>
              </p>
            )}
            {(a.campaignDeadlineAt ?? a.campaignExpiresAt) && (
              <p className="mt-0.5 text-[12px] font-semibold text-[#6f6862]">
                {t("dash.deadline")}: <time dateTime={a.campaignDeadlineAt ?? a.campaignExpiresAt ?? undefined}>{formatDate(a.campaignDeadlineAt ?? a.campaignExpiresAt)}</time>
              </p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${statusPillClass(a.status)}`}>{statusLabel(a.status)}</span>
        </div>
        {a.message && <p className="mt-3 text-[13.5px] text-[#57534e]"><b>{t("dash.yourMessage")}:</b> “{a.message}”</p>}
        {a.creatorContact && (
          <div className="mt-2 text-[13px] text-[#57534e]">
            <b>{t("dash.sharedContact")}:</b> {renderContactActions(a.creatorContact)}
          </div>
        )}
        {a.decisionNote && <p className="mt-2 rounded-xl bg-[#fffbf1] p-3 text-[13px] text-[#57534e]"><b>{t("dash.brandNote")}:</b> {a.decisionNote}</p>}
        {renderApplicationProposal(a)}
        {renderProfileSnapshot(a, { own: true })}
        {a.status === "hired" && (
          <p role="note" className="mt-3 rounded-lg bg-[#faf6ed] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#9a3412]">
            {t("dash.offPlatformHiredNote")}
          </p>
        )}
        {renderStatusHistory(a)}

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
              <span>{t("dash.contactForBrand")}<RequiredMark /></span>
              <input autoFocus id={`dashboard-application-${a.id}-contact`} name="creatorContact" autoComplete="off"
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
            <label className={labelClass} htmlFor={`dashboard-application-${a.id}-message`}>{t("dash.yourMessage")}<textarea id={`dashboard-application-${a.id}-message`} name="message" autoComplete="off" value={applicationForm.message} onChange={(e) => setApplicationForm((f) => ({ ...f, message: e.target.value }))} rows={3} placeholder={t("camp.applyPhMsg")} className={inputClass} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass} htmlFor={`dashboard-application-${a.id}-quote`}>
                {t("camp.quote")}
                <input id={`dashboard-application-${a.id}-quote`} name="quoteAmount" autoComplete="off" inputMode="numeric" aria-describedby={`dashboard-application-${a.id}-quote-help`} value={applicationForm.quoteAmount} onChange={(e) => setApplicationForm((f) => ({ ...f, quoteAmount: e.target.value }))} maxLength={16} placeholder={t("camp.quotePlaceholder")} className={inputClass} />
              </label>
              <label className={labelClass} htmlFor={`dashboard-application-${a.id}-timeline-days`}>
                {t("camp.timelineDays")}
                <input id={`dashboard-application-${a.id}-timeline-days`} name="proposedTimelineDays" type="number" autoComplete="off" inputMode="numeric" min={1} max={365} step={1} value={applicationForm.proposedTimelineDays} onChange={(e) => setApplicationForm((f) => ({ ...f, proposedTimelineDays: e.target.value }))} placeholder={t("camp.timelineDaysPlaceholder")} className={inputClass} />
              </label>
            </div>
            <p id={`dashboard-application-${a.id}-quote-help`} className="text-[12.5px] font-semibold leading-relaxed text-[#6f6862]">{t("camp.quoteHelp")}</p>
            <label className={labelClass} htmlFor={`dashboard-application-${a.id}-timeline`}>
              {t("camp.timelineNotes")}
              <textarea id={`dashboard-application-${a.id}-timeline`} name="proposedTimeline" autoComplete="off" value={applicationForm.proposedTimeline} onChange={(e) => setApplicationForm((f) => ({ ...f, proposedTimeline: e.target.value }))} rows={2} maxLength={300} placeholder={t("camp.timelineNotesPlaceholder")} className={inputClass} />
            </label>
            {reactivating && (
              <label htmlFor={`reactivate-consent-${a.id}`} className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-3 text-[13px] font-semibold leading-relaxed text-[#57534e]">
                <input
                  id={`reactivate-consent-${a.id}`}
                  name="contactSharingConsent"
                  autoComplete="off"
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
                  setApplicationForm(applicationToForm(a));
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
            {a.status === "withdrawn" && campaignExpired && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-900">{t("api.campaignExpired")}</p>
            )}
            {a.status === "withdrawn" && !campaignExpired && (
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
                  setApplicationForm(applicationToForm(a));
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

          {renderBrandRecord()}

          <form onSubmit={applyBrandFilters} className="mt-6 grid gap-2 rounded-2xl border border-[#e9ddc3] bg-white p-3 card-shadow">
            <div className="grid gap-2 md:grid-cols-[1fr_190px_190px]">
              <label htmlFor="dashboard-campaign-search">
                <span className="sr-only">{t("dash.yourCampaigns")}</span>
                <input id="dashboard-campaign-search" name="campaignQ" type="search" autoComplete="off" value={campaignDraft.q} onChange={(e) => setCampaignDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("camp.search")} className={inputClass} />
              </label>
              <label htmlFor="dashboard-campaign-status-filter">
                <span className="sr-only">{t("listing.filterStatus")}</span>
                <select id="dashboard-campaign-status-filter" name="campaignStatus" autoComplete="off" value={campaignDraft.status} onChange={(e) => setCampaignDraft((current) => ({ ...current, status: e.target.value }))} className={inputClass}>
                  <option value="">{t("listing.allStatuses")}</option>
                  {CAMPAIGN_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </label>
              <label htmlFor="dashboard-campaign-sort">
                <span className="sr-only">{t("listing.sort")}</span>
                <select id="dashboard-campaign-sort" name="campaignSort" autoComplete="off" value={campaignDraft.sort} onChange={(e) => setCampaignDraft((current) => ({ ...current, sort: e.target.value }))} className={inputClass}>
                  <option value="newest">{t("listing.sortNewest")}</option>
                  <option value="oldest">{t("listing.sortOldest")}</option>
                  <option value="title">{t("listing.sortTitle")}</option>
                  <option value="budget_desc">{t("listing.sortBudgetDesc")}</option>
                  <option value="budget_asc">{t("listing.sortBudgetAsc")}</option>
                  <option value="city">{t("listing.sortCity")}</option>
                  <option value="language">{t("listing.sortLanguage")}</option>
                  <option value="status">{t("listing.sortStatus")}</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_190px_190px]">
              <label htmlFor="dashboard-brand-application-search">
                <span className="sr-only">{t("dash.applications")}</span>
                <input id="dashboard-brand-application-search" name="applicationQ" type="search" autoComplete="off" value={applicationDraft.q} onChange={(e) => setApplicationDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("listing.searchItems")} className={inputClass} />
              </label>
              <label htmlFor="dashboard-brand-application-status-filter">
                <span className="sr-only">{t("listing.filterStatus")}</span>
                <select id="dashboard-brand-application-status-filter" name="applicationStatus" autoComplete="off" value={applicationDraft.status} onChange={(e) => setApplicationDraft((current) => ({ ...current, status: e.target.value }))} className={inputClass}>
                  <option value="">{t("listing.allStatuses")}</option>
                  {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </label>
              <label htmlFor="dashboard-brand-application-sort">
                <span className="sr-only">{t("listing.sort")}</span>
                <select id="dashboard-brand-application-sort" name="applicationSort" autoComplete="off" value={applicationDraft.sort} onChange={(e) => setApplicationDraft((current) => ({ ...current, sort: e.target.value }))} className={inputClass}>
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
              const expired = campaignHasExpired(c, clientNow ?? 0);
              const effectiveDeadline = c.deadlineAt ?? c.expiresAt;
              const publicCampaign = c.status === "open" && c.verificationStatus === "verified" && !expired;
              return (
                <div key={c.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[16px] font-extrabold">
                        {publicCampaign ? (
                          <Link href={`/campaigns/${c.id}`} aria-label={`${t("detail.viewCampaign")}: ${c.title}`} className="hover:text-[#c7431f] hover:underline">
                            {c.title}
                          </Link>
                        ) : c.title}
                      </p>
                      <p className="text-[13px] text-[#6f6862]">{[c.businessName, c.location, opt(c.language), opt(c.format)].filter(Boolean).join(" · ")}</p>
                      {c.createdAt && (
                        <p className="mt-1 text-[12px] font-semibold text-[#6f6862]">
                          <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                            {t("listing.posted", { age: formatRelativeTime(c.createdAt) })}
                          </time>
                          {effectiveDeadline && (
                            <>
                              {" · "}{t(expired ? "dash.expiredOn" : "dash.deadline")}:{" "}
                              <time dateTime={effectiveDeadline} title={formatDateTime(effectiveDeadline)}>{formatDate(effectiveDeadline)}</time>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <span className="rounded-full bg-[#fff4de] px-3 py-1 text-[12.5px] font-bold">🔒 {formatCurrency(c.budget || 0)}</span>
                      <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${statusPillClass(expired ? "expired" : c.status)}`}>{statusLabel(expired ? "expired" : c.status)}</span>
                    </div>
                  </div>

                  {(expired || c.status !== "open" || c.verificationStatus !== "verified" || c.moderationNote) && (
                    <div className={`mt-3 rounded-xl border p-3 ${c.status === "rejected" || c.status === "suspended" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                      <p className="text-[13.5px] font-semibold text-[#44403c]">
                        {expired
                          ? t("dash.campaignExpiredHelp", { date: formatDate(c.expiredAt ?? effectiveDeadline) })
                          : c.status === "pending"
                            ? t("dash.campaignInReview")
                            : c.status === "paused"
                              ? t("dash.campaignPaused")
                              : t("verify.notPublic")}
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
                    {publicCampaign && (
                      <Link href={`/campaigns/${c.id}`} className="rounded-xl border border-[#1c1917] bg-white px-4 py-2 text-[13px] font-bold text-[#1c1917] hover:bg-[#fff4de]">
                        {t("detail.viewCampaign")}
                      </Link>
                    )}
                    <button
                      type="button"
                      id={`dashboard-campaign-${c.id}-edit-toggle`}
                      aria-expanded={editingCampaignId === c.id}
                      aria-controls={`dashboard-campaign-${c.id}-edit-form`}
                      onClick={() => startCampaignEdit(c)}
                      className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white"
                    >
                      {t("dash.editCampaign")}
                    </button>
                    {c.status === "open" && !expired && (
                      <button type="button" disabled={campaignBusy} onClick={() => runAction(`campaign:${c.id}:pause`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "pause" }))} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-bold text-amber-900 disabled:opacity-50">{t("dash.pauseCampaign")}</button>
                    )}
                    {(expired || c.status === "paused" || c.status === "closed" || c.status === "rejected" || c.status === "expired") && (
                      <button type="button" disabled={campaignBusy} onClick={() => runAction(`campaign:${c.id}:republish`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "republish" }))} className="rounded-xl bg-[#17452e] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                        {c.status === "paused" ? t("dash.republishCampaign") : t("dash.resubmitCampaign")}
                      </button>
                    )}
                    {c.status !== "closed" && !expired && (
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
                            if (editingCampaignId === c.id) closeCampaignEdit(c, true);
                            else removeFormDraft(dashboardEditDraftKey(user.id, "campaign", c.id));
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

          {(data.profiles ?? []).length > 0 && (
            <section className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[19px] font-extrabold">{t("dash.profileStatus")}</h2>
                <label htmlFor="dashboard-profile-sort">
                  <span className="sr-only">{t("listing.sort")}</span>
                  <select id="dashboard-profile-sort" name="profileSort" autoComplete="off" value={profileSort} onChange={(e) => changeProfileSort(e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-white px-3 py-2 text-[13px] font-bold outline-none">
                    <option value="newest">{t("listing.sortNewest")}</option>
                    <option value="oldest">{t("listing.sortOldest")}</option>
                    <option value="name">{t("listing.sortName")}</option>
                    <option value="followers_desc">{t("listing.sortFollowersDesc")}</option>
                    <option value="followers_asc">{t("listing.sortFollowersAsc")}</option>
                    <option value="city">{t("listing.sortCity")}</option>
                    <option value="language">{t("listing.sortLanguage")}</option>
                    <option value="status">{t("listing.sortStatus")}</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-3">
                {(data.profiles ?? []).map((profile) => {
                  const profileLink = [
                    normalizeProfileUrl(profile.profileUrl, profile.platform ?? undefined),
                    normalizeInstagramUrl(profile.instagram),
                    normalizeYouTubeUrl(profile.youtube),
                  ].find((link): link is string => Boolean(link));
                  const followerCount = profile.verifiedFollowers ?? profile.followers ?? 0;
                  const publicProfile =
                    profile.status === "approved" && profile.verificationStatus === "verified" && isCompletedDashboardProfile(profile);
                  const listedDate = profile.listedAt ?? (profile.status !== "incomplete" ? profile.createdAt : null);
                  return (
                    <div key={profile.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[16px] font-extrabold">
                            {publicProfile ? (
                              <Link href={`/creators/${profile.id}`} aria-label={`${t("detail.viewCreator")}: ${profile.name}`} className="hover:text-[#c7431f] hover:underline">
                                {profile.name}
                              </Link>
                            ) : profile.name}
                          </p>
                          <p className="text-[13px] text-[#6f6862]">{[platformLabel(profile.platform), opt(profile.category), opt(profile.languages), profile.location].filter(Boolean).join(" · ")}</p>
                          {listedDate && (
                            <p className="mt-1 text-[12px] font-semibold text-[#6f6862]">
                              <time dateTime={listedDate} title={formatDateTime(listedDate)}>
                                {t("listing.listed", { age: formatRelativeTime(listedDate) })}
                              </time>
                            </p>
                          )}
                          <p className="mt-1 text-[13px] font-semibold text-[#57534e]">
                            {profile.verifiedFollowers != null ? t("dash.verifiedFollowers") : t("dash.claimedFollowers")}: {formatNumber(followerCount)}
                          </p>
                          {profileLink && (
                            <a href={profileLink} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[13px] font-semibold text-[#c7431f]">{profileLink}</a>
                          )}
                          {profile.contentTypes && (
                            <p className="mt-1 text-[13px] font-semibold text-[#57534e]">{opt(profile.contentTypes)}</p>
                          )}
                          {profile.bio && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6f6862]">{profile.bio}</p>}
                          {(profile.email || profile.phone) && (
                            <div className="mt-2 grid gap-1 text-[13px]">
                              {profile.email && renderContactActions(profile.email)}
                              {profile.phone && renderContactActions(profile.phone)}
                            </div>
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
                        {publicProfile && (
                          <Link href={`/creators/${profile.id}`} className="rounded-xl border border-[#1c1917] bg-white px-4 py-2 text-[13px] font-bold text-[#1c1917] hover:bg-[#fff4de]">
                            {t("detail.viewCreator")}
                          </Link>
                        )}
                        <button
                          type="button"
                          id={`dashboard-profile-${profile.id}-edit-toggle`}
                          aria-expanded={editingProfileId === profile.id}
                          aria-controls={`dashboard-profile-${profile.id}-edit-form`}
                          onClick={() => startProfileEdit(profile)}
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
                                if (editingProfileId === profile.id) closeProfileEdit(profile, true);
                                else removeFormDraft(dashboardEditDraftKey(user.id, "profile", profile.id));
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
                  <input id="dashboard-creator-application-search" name="applicationQ" type="search" autoComplete="off" value={applicationDraft.q} onChange={(e) => setApplicationDraft((current) => ({ ...current, q: e.target.value }))} placeholder={t("listing.searchItems")} className={inputClass} />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label htmlFor="dashboard-creator-application-status-filter">
                    <span className="sr-only">{t("listing.filterStatus")}</span>
                    <select id="dashboard-creator-application-status-filter" name="applicationStatus" autoComplete="off" value={applicationDraft.status} onChange={(e) => setApplicationDraft((current) => ({ ...current, status: e.target.value }))} className={inputClass}>
                      <option value="">{t("listing.allStatuses")}</option>
                      {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                  </label>
                  <label htmlFor="dashboard-creator-application-sort">
                    <span className="sr-only">{t("listing.sort")}</span>
                    <select id="dashboard-creator-application-sort" name="applicationSort" autoComplete="off" value={applicationDraft.sort} onChange={(e) => setApplicationDraft((current) => ({ ...current, sort: e.target.value }))} className={inputClass}>
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
                  <select id="dashboard-open-campaign-sort" name="openSort" autoComplete="off" value={openSort} onChange={(e) => changeOpenSort(e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-white px-3 py-2 text-[13px] font-bold outline-none">
                    <option value="newest">{t("listing.sortNewest")}</option>
                    <option value="oldest">{t("listing.sortOldest")}</option>
                    <option value="title">{t("listing.sortTitle")}</option>
                    <option value="business">{t("listing.sortBusiness")}</option>
                    <option value="budget_desc">{t("listing.sortBudgetDesc")}</option>
                    <option value="budget_asc">{t("listing.sortBudgetAsc")}</option>
                    <option value="city">{t("listing.sortCity")}</option>
                    <option value="language">{t("listing.sortLanguage")}</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-3">
                {(data.openCampaigns ?? []).map((c) => (
                  <Link key={c.id} href={`/campaigns/${c.id}`} aria-label={`${t("detail.viewCampaign")}: ${c.title}`} className="rounded-2xl border border-[#e9ddc3] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#1c1917]">
                    <p className="text-[15px] font-extrabold">{c.title}</p>
                    <p className="text-[13px] text-[#6f6862]">{[c.businessName, c.location, opt(c.language), opt(c.format)].filter(Boolean).join(" · ")}</p>
                    {c.createdAt && (
                      <p className="mt-1 text-[12px] font-semibold text-[#6f6862]">
                        <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                          {t("listing.posted", { age: formatRelativeTime(c.createdAt) })}
                        </time>
                        {(c.deadlineAt ?? c.expiresAt) && (
                          <>
                            {" · "}{t("dash.deadline")}:{" "}
                            <time dateTime={c.deadlineAt ?? c.expiresAt ?? undefined} title={formatDateTime(c.deadlineAt ?? c.expiresAt)}>{formatDate(c.deadlineAt ?? c.expiresAt)}</time>
                          </>
                        )}
                      </p>
                    )}
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
