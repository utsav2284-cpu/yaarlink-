"use client";

import { useLang, type TranslationKey } from "@/frontend/i18n";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiResponseError, appendUniqueById, fetchJsonObject, fetchJsonPage, type ListPagination } from "@/frontend/api-json";
import { ListingError, ListingPagination } from "@/frontend/components/ListingState";
import { LANGUAGES } from "@/shared/constants";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import ReportButton from "@/frontend/components/ReportButton";
import { buildAuthPath, buildPathWithReturnTo } from "@/shared/return-to";
import { sanitizeAmountInput } from "@/shared/numeric-input";
import { readFormDraft, removeFormDraft, writeFormDraft } from "@/frontend/form-drafts";
import { useSession } from "@/frontend/session-context";

const CAMPAIGN_PAGE_SIZE = 24;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPLICATION_DRAFT_PREFIX = "yaarlink:campaign-application-draft:v1:";

function initialRequestedApplyId() {
  if (typeof window === "undefined") return "";
  const requested = new URLSearchParams(window.location.search).get("apply") ?? "";
  return UUID_PATTERN.test(requested) ? requested : "";
}

function applicationReturnTo(campaignId: string) {
  return `/campaigns?apply=${encodeURIComponent(campaignId)}`;
}

function applicationDraftKey(campaignId: string) {
  return `${APPLICATION_DRAFT_PREFIX}${campaignId}`;
}

type ApplicationDraft = {
  contact: string;
  message: string;
  quoteAmount: string;
  proposedTimelineDays: string;
  proposedTimeline: string;
};

const EMPTY_APPLICATION_DRAFT: ApplicationDraft = {
  contact: "",
  message: "",
  quoteAmount: "",
  proposedTimelineDays: "",
  proposedTimeline: "",
};

function readApplicationDraft(campaignId: string): ApplicationDraft | null {
  const draft = readFormDraft(applicationDraftKey(campaignId)) as {
    contact?: unknown;
    message?: unknown;
    quoteAmount?: unknown;
    proposedTimelineDays?: unknown;
    proposedTimeline?: unknown;
  } | null;
  if (!draft || typeof draft.contact !== "string" || typeof draft.message !== "string") return null;
  if (draft.contact.length > 500 || draft.message.length > 5000) return null;
  return {
    contact: draft.contact,
    message: draft.message,
    quoteAmount: typeof draft.quoteAmount === "string" && draft.quoteAmount.length <= 16 ? draft.quoteAmount : "",
    proposedTimelineDays:
      typeof draft.proposedTimelineDays === "string" && draft.proposedTimelineDays.length <= 4 ? draft.proposedTimelineDays : "",
    proposedTimeline:
      typeof draft.proposedTimeline === "string" && draft.proposedTimeline.length <= 300 ? draft.proposedTimeline : "",
  };
}

function saveApplicationDraft(campaignId: string, draft: ApplicationDraft) {
  writeFormDraft(applicationDraftKey(campaignId), { ...draft });
}

function clearApplicationDraft(campaignId: string) {
  removeFormDraft(applicationDraftKey(campaignId));
}

const EXPIRABLE_CAMPAIGN_STATUSES = new Set(["pending", "open", "paused"]);

function campaignHasExpired(campaign: any, now = Date.now()): boolean {
  if (campaign?.status === "expired") return true;
  if (!EXPIRABLE_CAMPAIGN_STATUSES.has(campaign?.status)) return false;
  const expiresAt = campaign?.expiresAt ? new Date(campaign.expiresAt).getTime() : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function campaignAcceptsApplications(campaign: any, now = Date.now()): boolean {
  return campaign?.status === "open" && campaign?.verificationStatus === "verified" && !campaignHasExpired(campaign, now);
}

function campaignListUrl({ q, lang, sort, cursor }: { q: string; lang: string; sort: string; cursor?: string | null }) {
  const params = new URLSearchParams({ limit: String(CAMPAIGN_PAGE_SIZE), sort });
  if (q) params.set("q", q);
  if (lang) params.set("language", lang);
  if (cursor) params.set("cursor", cursor);
  return `/api/campaigns?${params.toString()}`;
}

export type CampaignsInitialData = {
  campaigns: any[];
  pagination: ListPagination | null;
  campaignsStatus: "success" | "error";
  ownApplications: {
    applications: any[];
    creatorProfile: any | null;
    contactOptions: string[];
    ownCampaignIds: string[];
    pagination: ListPagination;
  } | null;
  ownApplicationsStatus: "ready" | "guest" | "error";
};

export default function CampaignsPageClient({ initialData }: { initialData: CampaignsInitialData }) {
  const { markLoggedOut } = useSession();
  const { t, opt, promo, status: statusLabel, apiErrorKey: getApiErrorKey, formatCurrency, formatDate, formatDateTime, formatRelativeTime } = useLang();
  const [campaigns, setCampaigns] = useState<any[]>(initialData.campaigns);
  const [campaignsStatus, setCampaignsStatus] = useState<"loading" | "success" | "error">(initialData.campaignsStatus);
  const [campaignsErrorKey, setCampaignsErrorKey] = useState<TranslationKey>("listing.loadFailed");
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [lang, setLang] = useState("");
  const [sort, setSort] = useState("newest");
  const [campaignPagination, setCampaignPagination] = useState<ListPagination | null>(initialData.pagination);
  const [loadingMoreCampaigns, setLoadingMoreCampaigns] = useState(false);
  const campaignRequestRef = useRef(0);
  const ownApplicationsRequestRef = useRef(0);
  const skippedInitialCampaignFetchRef = useRef(false);
  const skippedInitialOwnApplicationsFetchRef = useRef(false);
  const [applyId, setApplyId] = useState<string | null>(null);
  const [applyForm, setApplyForm] = useState<ApplicationDraft>(EMPTY_APPLICATION_DRAFT);
  const [applyConsent, setApplyConsent] = useState(false);
  const [applyError, setApplyError] = useState<"" | "contact" | "consent" | "login" | "creator" | "duplicate" | "closed" | "rate" | "generic" | "api">("");
  const [applyApiErrorKey, setApplyApiErrorKey] = useState<TranslationKey>("camp.applyGenericErr");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ownApplications, setOwnApplications] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      (initialData.ownApplications?.applications ?? [])
        .filter((application: any) => application?.campaignId)
        .map((application: any) => [application.campaignId, application]),
    ),
  );
  const [ownCampaignIds, setOwnCampaignIds] = useState<Set<string>>(
    () => new Set(initialData.ownApplications?.ownCampaignIds ?? []),
  );
  const [ownApplicationsStatus, setOwnApplicationsStatus] = useState<"loading" | "ready" | "guest" | "error">(
    initialData.ownApplicationsStatus,
  );
  const [creatorProfile, setCreatorProfile] = useState<any | null>(initialData.ownApplications?.creatorProfile ?? null);
  const [contactOptions, setContactOptions] = useState<string[]>(initialData.ownApplications?.contactOptions ?? []);
  const [pageNotice, setPageNotice] = useState<"" | "duplicate" | "closed" | "expired" | "own">("");
  const [requestedApplyId] = useState(initialRequestedApplyId);
  const handledRequestedApplyRef = useRef("");
  const [clientNow, setClientNow] = useState<number | null>(null);

  const requestOwnApplications = useCallback((campaignIds?: string[]) => {
    const ids = campaignIds ? [...new Set(campaignIds.filter(Boolean))] : undefined;
    const params = new URLSearchParams({ limit: String(ids?.length || 1) });
    if (ids?.length) params.set("campaignIds", ids.join(","));
    return fetchJsonObject(`/api/me/applications?${params.toString()}`, { cache: "no-store" });
  }, []);

  const applyOwnApplications = useCallback(
    (data: Record<string, unknown>, campaignIds?: string[]): Record<string, any> => {
      const applications = Array.isArray(data.applications) ? data.applications : null;
      const contactValues = Array.isArray(data.contactOptions) ? data.contactOptions : null;
      const ownCampaignValues = Array.isArray(data.ownCampaignIds) ? data.ownCampaignIds : null;
      if (!applications || !contactValues || !ownCampaignValues) throw new ApiResponseError(502, "load_failed");
      const byCampaign = Object.fromEntries(
        applications
          .filter((application: any) => application?.campaignId)
          .map((application: any) => [application.campaignId, application]),
      ) as Record<string, any>;
      setOwnApplications((current) => {
        if (!campaignIds) return { ...current, ...byCampaign };
        const next = { ...current };
        for (const campaignId of campaignIds) delete next[campaignId];
        return { ...next, ...byCampaign };
      });
      setOwnCampaignIds((current) => {
        const next = new Set(current);
        if (campaignIds) {
          for (const campaignId of campaignIds) next.delete(campaignId);
        }
        for (const campaignId of ownCampaignValues) {
          if (typeof campaignId === "string") next.add(campaignId);
        }
        return next;
      });
      setCreatorProfile(data.creatorProfile ?? null);
      setContactOptions(contactValues.filter((value: unknown): value is string => typeof value === "string"));
      setOwnApplicationsStatus("ready");
      return byCampaign;
    },
    [],
  );

  const handleOwnApplicationsError = useCallback((error: unknown): null => {
    if (error instanceof ApiResponseError && error.status === 401) {
      // Only a genuine 401 establishes the public/guest state. Network or
      // 5xx failures stay "unknown" so Apply is not offered blindly.
      markLoggedOut();
      setOwnApplications({});
      setOwnCampaignIds(new Set());
      setCreatorProfile(null);
      setContactOptions([]);
      setOwnApplicationsStatus("guest");
      return null;
    }
    setOwnApplicationsStatus("error");
    return null;
  }, [markLoggedOut]);

  const fetchOwnApplications = useCallback(
    async (campaignIds?: string[]): Promise<Record<string, any> | null> => {
      const requestId = ++ownApplicationsRequestRef.current;
      try {
        const data = await requestOwnApplications(campaignIds);
        if (requestId !== ownApplicationsRequestRef.current) return null;
        return applyOwnApplications(data, campaignIds);
      } catch (error) {
        if (requestId !== ownApplicationsRequestRef.current) return null;
        return handleOwnApplicationsError(error);
      }
    },
    [applyOwnApplications, handleOwnApplicationsError, requestOwnApplications],
  );

  const loadOwnApplications = useCallback(
    async (campaignIds?: string[]): Promise<Record<string, any> | null> => {
      setOwnApplicationsStatus((current) => (current === "guest" ? current : "loading"));
      return fetchOwnApplications(campaignIds);
    },
    [fetchOwnApplications],
  );

  const handleCampaignsError = useCallback(
    (error: unknown) => {
      setCampaignsErrorKey(
        error instanceof ApiResponseError ? getApiErrorKey(error.status, error.code, "listing.loadFailed") : "api.network",
      );
      setCampaignsStatus("error");
    },
    [getApiErrorKey],
  );

  const fetchCampaignPage = useCallback(
    async ({ append = false, cursor = null }: { append?: boolean; cursor?: string | null } = {}) => {
      const requestId = ++campaignRequestRef.current;
      if (append) setLoadingMoreCampaigns(true);
      else setCampaignsStatus("loading");
      try {
        const page = await fetchJsonPage<any>(
          campaignListUrl({ q: searchQ, lang, sort, cursor }),
          "campaigns",
          { cache: "no-store" },
        );
        if (requestId !== campaignRequestRef.current) return;
        setCampaigns((current) => (append ? appendUniqueById(current, page.items) : page.items));
        setCampaignPagination(page.pagination);
        setCampaignsStatus("success");
        if (page.items.length > 0) {
          void loadOwnApplications(page.items.map((campaign) => campaign.id));
        }
      } catch (error) {
        if (requestId === campaignRequestRef.current) handleCampaignsError(error);
      } finally {
        if (append && requestId === campaignRequestRef.current) setLoadingMoreCampaigns(false);
      }
    },
    [handleCampaignsError, lang, loadOwnApplications, searchQ, sort],
  );

  const loadCampaigns = useCallback(async () => {
    await fetchCampaignPage();
  }, [fetchCampaignPage]);

  const loadMoreCampaigns = useCallback(() => {
    if (!campaignPagination?.nextCursor || loadingMoreCampaigns) return;
    void fetchCampaignPage({ append: true, cursor: campaignPagination.nextCursor });
  }, [campaignPagination, fetchCampaignPage, loadingMoreCampaigns]);

  const load = useCallback(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    // Keep the first client render identical to the server render, then use
    // a mounted clock so a card that reaches its deadline while this page is
    // open stops presenting an application form.
    const updateNow = () => setClientNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchQ(q.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [q]);

  useEffect(() => {
    // The default first page and its own-application state are both supplied
    // by the server. Later search/filter/sort changes still use the APIs.
    if (!skippedInitialCampaignFetchRef.current) {
      skippedInitialCampaignFetchRef.current = true;
      return;
    }
    void Promise.resolve().then(() => fetchCampaignPage());
  }, [fetchCampaignPage]);

  useEffect(() => {
    if (!skippedInitialOwnApplicationsFetchRef.current) {
      skippedInitialOwnApplicationsFetchRef.current = true;
      return;
    }
    void Promise.resolve().then(() => fetchOwnApplications());
  }, [fetchOwnApplications]);

  useEffect(() => {
    if (applyId) saveApplicationDraft(applyId, applyForm);
  }, [applyForm, applyId]);

  useEffect(() => {
    if (!requestedApplyId || handledRequestedApplyRef.current === requestedApplyId) return;
    if (campaignsStatus === "loading" || ownApplicationsStatus === "loading") return;

    const campaign = campaigns.find((item) => item.id === requestedApplyId);
    if (!campaign) {
      if (campaignPagination?.hasMore && !loadingMoreCampaigns) {
        void Promise.resolve().then(loadMoreCampaigns);
      } else if (!campaignPagination?.hasMore) {
        handledRequestedApplyRef.current = requestedApplyId;
      }
      return;
    }

    handledRequestedApplyRef.current = requestedApplyId;
    const ownApplication = ownApplications[requestedApplyId];
    const hasActiveApplication = Boolean(ownApplication && ownApplication.status !== "withdrawn");
    const campaignIsOpen = campaignAcceptsApplications(campaign);
    const isOwnCampaign = ownCampaignIds.has(requestedApplyId);

    if (isOwnCampaign) {
      void Promise.resolve().then(() => setPageNotice("own"));
    } else if (campaignHasExpired(campaign)) {
      void Promise.resolve().then(() => setPageNotice("expired"));
    }

    if (
      ownApplicationsStatus === "ready" &&
      creatorProfile?.completed &&
      campaignIsOpen &&
      !hasActiveApplication &&
      !isOwnCampaign
    ) {
      const draft =
        ownApplication?.status === "withdrawn"
          ? {
              contact: ownApplication.creatorContact ?? "",
              message: ownApplication.message ?? "",
              quoteAmount: ownApplication.quoteAmount == null ? "" : String(ownApplication.quoteAmount),
              proposedTimelineDays:
                ownApplication.proposedTimelineDays == null ? "" : String(ownApplication.proposedTimelineDays),
              proposedTimeline: ownApplication.proposedTimeline ?? "",
            }
          : readApplicationDraft(requestedApplyId);
      void Promise.resolve().then(() => {
        if (draft) setApplyForm(draft);
        setApplyConsent(false);
        setApplyError("");
        setApplyApiErrorKey("camp.applyGenericErr");
        setPageNotice("");
        setApplyId(requestedApplyId);
      });
    }

    window.setTimeout(() => {
      document.getElementById(`campaign-card-${requestedApplyId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
  }, [
    campaignPagination?.hasMore,
    campaigns,
    campaignsStatus,
    creatorProfile?.completed,
    loadMoreCampaigns,
    loadingMoreCampaigns,
    ownApplications,
    ownApplicationsStatus,
    ownCampaignIds,
    requestedApplyId,
  ]);

  const hasActiveFilters = Boolean(searchQ || lang || sort !== "newest");

  const apply = async (campaignId: string) => {
    if (ownApplicationsStatus === "loading" || ownApplicationsStatus === "error") {
      setApplyApiErrorKey(ownApplicationsStatus === "loading" ? "common.loading" : "listing.ownApplicationsFailed");
      setApplyError("api");
      return;
    }
    if (ownApplicationsStatus === "guest") {
      saveApplicationDraft(campaignId, applyForm);
      setApplyError("login");
      return;
    }
    if (ownCampaignIds.has(campaignId)) {
      setApplyApiErrorKey("api.ownCampaign");
      setApplyError("api");
      return;
    }
    if (!creatorProfile?.completed) {
      saveApplicationDraft(campaignId, applyForm);
      setApplyApiErrorKey("api.creatorProfileIncomplete");
      setApplyError("api");
      return;
    }
    const creatorContact = applyForm.contact.trim();
    if (creatorContact.length < 3) { setApplyError("contact"); return; }
    if (!applyConsent) { setApplyError("consent"); return; }

    setApplyError("");
    setPageNotice("");
    setApplyingId(campaignId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          creatorContact,
          message: applyForm.message.trim(),
          quoteAmount: applyForm.quoteAmount.trim() || null,
          proposedTimelineDays: applyForm.proposedTimelineDays.trim() || null,
          proposedTimeline: applyForm.proposedTimeline.trim() || null,
          contactSharingConsent: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(data?.code || "");
        if (code === "already_applied") {
          const refreshed = await loadOwnApplications([campaignId]);
          if (refreshed?.[campaignId] && refreshed[campaignId].status !== "withdrawn") {
            setApplyId(null);
            setPageNotice("duplicate");
          } else {
            setApplyError("duplicate");
          }
        } else if (code === "campaign_expired") {
          setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? { ...campaign, status: "expired" } : campaign));
          setApplyId(null);
          setPageNotice("expired");
        } else if (code === "campaign_closed") {
          setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? { ...campaign, status: "closed" } : campaign));
          setApplyId(null);
          setPageNotice("closed");
        }
        else if (res.status === 401) {
          markLoggedOut();
          saveApplicationDraft(campaignId, applyForm);
          setOwnApplicationsStatus("guest");
          setApplyError("login");
        }
        else if (code === "own_campaign") {
          setApplyApiErrorKey("api.ownCampaign");
          setApplyError("api");
        }
        else if (res.status === 403) {
          setApplyApiErrorKey(getApiErrorKey(res.status, code, "api.forbidden"));
          setApplyError("api");
        }
        else if (res.status === 429 || code === "rate_limited") setApplyError("rate");
        else if (code === "contact_required") setApplyError("contact");
        else if (code === "contact_sharing_consent_required") setApplyError("consent");
        else {
          setApplyApiErrorKey(getApiErrorKey(res.status, code, "camp.applyGenericErr"));
          setApplyError("api");
        }
        return;
      }

      clearApplicationDraft(campaignId);
      if (data?.application?.campaignId) {
        setOwnApplications((current) => ({ ...current, [campaignId]: data.application }));
      } else {
        await loadOwnApplications([campaignId]);
      }
      setDone(true);
      setApplyId(null);
      setApplyForm(EMPTY_APPLICATION_DRAFT);
      setApplyConsent(false);
      setTimeout(() => setDone(false), 4000);
    } catch {
      setApplyError("generic");
    } finally {
      setApplyingId(null);
    }
  };

  const applyErrorKey: TranslationKey = applyError === "contact"
      ? "camp.applyContactErr"
      : applyError === "consent"
        ? "camp.applyConsentErr"
        : applyError === "login"
      ? "camp.applyLoginErr"
      : applyError === "creator"
        ? "camp.applyCreatorErr"
        : applyError === "duplicate"
          ? "camp.applyDupErr"
          : applyError === "closed"
            ? "camp.applyClosedErr"
            : applyError === "rate"
              ? "camp.applyRateErr"
              : applyError === "api"
                ? applyApiErrorKey
                : "camp.applyGenericErr";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("camp.eyebrow")}</p>
          <h1 className="font-display text-[34px] font-black sm:text-[48px]">{t("camp.title")}</h1>
          <p className="text-[15.5px] text-[#57534e]">{t("camp.sub")}</p>
        </div>
        <Link href="/brands" className="w-fit rounded-2xl bg-[#c7431f] px-6 py-3 text-[15px] font-bold text-white hover:bg-[#a93618]">{t("camp.post")}</Link>
      </div>

      <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-[#e9ddc3] bg-white p-3 sm:flex-row">
        <label htmlFor="campaign-search" className="sr-only">{t("listing.searchLabel")}</label>
        <input id="campaign-search" name="q" type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("camp.search")} className="min-w-0 flex-1 rounded-xl bg-[#fffbf1] border border-[#f0e6cc] px-4 py-3 outline-none" />
        <label className="relative block sm:w-48" htmlFor="campaign-language-filter">
          <span className="sr-only">{t("browse.filterLang")}</span>
          <select id="campaign-language-filter" name="language" autoComplete="off" value={lang} onChange={(e) => setLang(e.target.value)} className="w-full min-w-0 appearance-none truncate rounded-xl border border-[#f0e6cc] bg-[#fffbf1] py-3 pl-4 pr-9 text-[15px] font-semibold text-[#1c1917] outline-none focus:border-[#1c1917]">
            <option value="">{t("browse.allLang")}</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{opt(l)}</option>)}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#6f6862]">▼</span>
        </label>
        <label className="relative block sm:w-48" htmlFor="campaign-sort">
          <span className="sr-only">{t("listing.sort")}</span>
          <select id="campaign-sort" name="sort" autoComplete="off" value={sort} onChange={(e) => setSort(e.target.value)} className="w-full min-w-0 appearance-none truncate rounded-xl border border-[#f0e6cc] bg-[#fffbf1] py-3 pl-4 pr-9 text-[15px] font-semibold text-[#1c1917] outline-none focus:border-[#1c1917]">
            <option value="newest">{t("listing.sortNewest")}</option>
            <option value="oldest">{t("listing.sortOldest")}</option>
            <option value="title">{t("listing.sortTitle")}</option>
            <option value="business">{t("listing.sortBusiness")}</option>
            <option value="budget_desc">{t("listing.sortBudgetDesc")}</option>
            <option value="budget_asc">{t("listing.sortBudgetAsc")}</option>
            <option value="city">{t("listing.sortCity")}</option>
            <option value="language">{t("listing.sortLanguage")}</option>
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#6f6862]">▼</span>
        </label>
        <button onClick={load} className="rounded-xl bg-[#1c1917] px-5 py-3 text-[14px] font-bold text-white">{t("camp.refresh")}</button>
      </div>

      {done && <p className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-5 py-3.5 text-[14.5px] font-bold text-green-800">{t("camp.applied")}</p>}
      {pageNotice && <p role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-[14.5px] font-bold text-amber-900">{t(pageNotice === "duplicate" ? "camp.applyDupErr" : pageNotice === "own" ? "api.ownCampaign" : pageNotice === "expired" ? "api.campaignExpired" : "camp.applyClosedErr")}</p>}

      {campaignsStatus === "error" && campaigns.length > 0 && (
        <div className="mt-4">
          <ListingError errorKey={campaignsErrorKey} onRetry={() => void loadCampaigns()} />
        </div>
      )}
      {ownApplicationsStatus === "error" && (
        <div className="mt-4">
          <ListingError errorKey="listing.ownApplicationsFailed" onRetry={() => void loadOwnApplications(campaigns.map((campaign) => campaign.id))} />
        </div>
      )}

      {campaignsStatus === "loading" && campaigns.length === 0 ? (
        <div role="status" aria-live="polite" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <span className="sr-only">{t("listing.loadingCampaigns")}</span>
          {[1, 2, 3].map((i) => <div key={i} aria-hidden="true" className="h-56 animate-pulse rounded-3xl bg-[#f0e6cc]/60" />)}
        </div>
      ) : campaignsStatus === "error" && campaigns.length === 0 ? (
        <div className="mt-8">
          <ListingError errorKey={campaignsErrorKey} onRetry={() => void loadCampaigns()} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-[#e9ddc3] bg-white p-12 text-center">
          <p className="text-[40px]">📭</p>
          <h3 className="font-display mt-2 text-[24px] font-black">
            {hasActiveFilters ? t("listing.noCampaignMatches") : t("home.noCampaigns")}
          </h3>
          <p className="mt-1 text-[15px] text-[#6f6862]">{t("camp.emptyBody")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setQ(""); setSearchQ(""); setLang(""); setSort("newest"); }}
                className="rounded-2xl border border-[#1c1917] px-6 py-3 text-[14.5px] font-bold"
              >
                {t("listing.clearFilters")}
              </button>
            )}
            <Link href="/brands" className="rounded-2xl bg-[#c7431f] px-6 py-3 text-[14.5px] font-bold text-white">{t("camp.emptyPost")}</Link>
            <Link href="/creators" className="rounded-2xl border border-[#1c1917] px-6 py-3 text-[14.5px] font-bold">{t("camp.emptyJoin")}</Link>
          </div>
        </div>
      ) : (
        <>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => {
            const ownApplication = ownApplications[c.id];
            const hasActiveApplication = Boolean(ownApplication && ownApplication.status !== "withdrawn");
            const expired = campaignHasExpired(c, clientNow ?? 0);
            const campaignIsOpen = campaignAcceptsApplications(c, clientNow ?? 0);
            const effectiveDeadline = c.deadlineAt ?? c.expiresAt;
            const campaignReturnTo = applicationReturnTo(c.id);
            return (
            <div key={c.id} id={`campaign-card-${c.id}`} className="lift flex flex-col rounded-3xl border border-[#e9ddc3] bg-white p-6 card-shadow">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#fff4de] border border-[#e9ddc3] px-3 py-1 text-[12px] font-bold">{promo(c.promotionType)}</span>
                <span className={`rounded-full border px-3 py-1 text-[12px] font-bold ${campaignIsOpen ? "bg-green-50 border-green-200 text-green-800" : "bg-stone-100 border-stone-200 text-stone-700"}`}>{campaignIsOpen ? t("camp.open") : statusLabel(expired ? "expired" : c.status || "closed")}</span>
                {c.verificationStatus === "verified" && <span className="rounded-full bg-green-50 border border-green-200 px-3 py-1 text-[12px] font-bold text-green-800">{t("listing.reviewed")}</span>}
              </div>
              <h3 className="mt-3 text-[18px] font-extrabold leading-snug">
                {campaignIsOpen ? (
                  <Link href={`/campaigns/${c.id}`} aria-label={`${t("detail.viewCampaign")}: ${c.title}`} className="hover:text-[#c7431f] hover:underline">
                    {c.title}
                  </Link>
                ) : c.title}
              </h3>
              <p className="mt-1 text-[13.5px] font-semibold text-[#6f6862]">{[c.businessName, c.location].filter(Boolean).join(" • ")}</p>
              <p className="mt-1 text-[12.5px] font-semibold text-[#6f6862]">
                <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                  {t("listing.posted", { age: formatRelativeTime(c.createdAt) })}
                </time>
                {effectiveDeadline && (
                  <>
                    {" • "}
                    <time dateTime={effectiveDeadline} title={formatDateTime(effectiveDeadline)}>
                      {expired
                        ? t("camp.deadlinePassed", { date: formatDate(effectiveDeadline) })
                        : t("camp.applyBy", { date: formatDate(effectiveDeadline) })}
                    </time>
                  </>
                )}
              </p>
              <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-[#57534e]">{c.description || t("camp.noDesc")}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] font-bold">
                <span className="rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-2.5 py-1">{opt(c.language)}</span>
                <span className="rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-2.5 py-1">{opt(c.format)}</span>
                {c.category && <span className="rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-2.5 py-1">{opt(c.category)}</span>}
              </div>
              {campaignIsOpen && (
                <Link href={`/campaigns/${c.id}`} className="mt-3 w-fit text-[13.5px] font-bold text-[#c7431f] hover:underline">
                  {t("detail.viewCampaign")} →
                </Link>
              )}
              {hasActiveApplication ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#f5edd8] pt-4">
                  <div>
                    <p className="text-[13.5px] font-bold text-[#17452e]">{t("camp.yourApplication")}: {statusLabel(ownApplication.status || "applied")}</p>
                    {ownApplication.creatorContact && <p className="mt-0.5 break-all text-[12.5px] font-semibold text-[#6f6862]">{ownApplication.creatorContact}</p>}
                    {ownApplication.quoteAmount != null && (
                      <p className="mt-0.5 text-[12.5px] font-semibold text-[#6f6862]">{t("dash.quote")}: {formatCurrency(ownApplication.quoteAmount)}</p>
                    )}
                    {(ownApplication.proposedTimelineDays != null || ownApplication.proposedTimeline) && (
                      <p className="mt-0.5 text-[12.5px] font-semibold leading-relaxed text-[#6f6862]">
                        {t("dash.proposedTimeline")}: {[
                          ownApplication.proposedTimelineDays == null
                            ? null
                            : ownApplication.proposedTimelineDays === 1
                              ? t("dash.oneDay")
                              : t("dash.daysCount", { days: ownApplication.proposedTimelineDays }),
                          ownApplication.proposedTimeline,
                        ].filter(Boolean).join(" • ")}
                      </p>
                    )}
                  </div>
                  <Link href="/dashboard?view=creator" className="rounded-xl border border-[#1c1917] px-4 py-2.5 text-[13px] font-bold text-[#1c1917] hover:bg-stone-50">{t("camp.manageApplication")}</Link>
                </div>
              ) : !campaignIsOpen ? (
                <p className="mt-4 border-t border-[#f5edd8] pt-4 text-[13.5px] font-bold text-stone-700">{expired ? t("api.campaignExpired") : t("camp.applyClosedErr")}</p>
              ) : ownApplicationsStatus === "ready" && ownCampaignIds.has(c.id) ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#f5edd8] pt-4">
                  <p className="max-w-[220px] text-[13.5px] font-bold leading-relaxed text-[#7c2d12]">{t("api.ownCampaign")}</p>
                  <Link href="/dashboard?view=brand" className="rounded-xl border border-[#1c1917] px-4 py-2.5 text-[13px] font-bold text-[#1c1917] hover:bg-stone-50">{t("dash.brandWorkspace")}</Link>
                </div>
              ) : ownApplicationsStatus === "guest" ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[13.5px] font-bold leading-relaxed text-[#7c2d12]">{t("camp.loginToApply")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={buildAuthPath("/login", { returnTo: campaignReturnTo, role: "creator" })} className="rounded-xl bg-[#1c1917] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-black">{t("nav.login")}</Link>
                    <Link href={buildAuthPath("/signup", { returnTo: campaignReturnTo, role: "creator" })} className="rounded-xl bg-[#c7431f] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#a93618]">{t("nav.signup")}</Link>
                  </div>
                </div>
              ) : ownApplicationsStatus === "ready" && !creatorProfile?.completed ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#f5edd8] pt-4">
                  <p className="max-w-[220px] text-[13.5px] font-bold leading-relaxed text-[#7c2d12]">{t("api.creatorProfileIncomplete")}</p>
                  <Link href={buildPathWithReturnTo("/creators", campaignReturnTo, "/creators")} className="rounded-xl bg-[#1c1917] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-black">{t("camp.completeCreatorProfile")}</Link>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-center justify-between border-t border-[#f5edd8] pt-4">
                    <p className="text-[13.5px] font-bold text-[#17452e]">{t("camp.paid")}</p>
                    <button
                      type="button"
                      id={`application-toggle-${c.id}`}
                      {...(ownApplicationsStatus !== "error"
                        ? { "aria-expanded": applyId === c.id, "aria-controls": `application-form-${c.id}` }
                        : {})}
                      disabled={ownApplicationsStatus === "loading"}
                      onClick={() => {
                        if (ownApplicationsStatus === "error") {
                          void loadOwnApplications([c.id]);
                          return;
                        }
                        setApplyError("");
                        setApplyApiErrorKey("camp.applyGenericErr");
                        setApplyConsent(false);
                        setPageNotice("");
                        if (applyId !== c.id) {
                          if (ownApplication?.status === "withdrawn") {
                            setApplyForm({
                              contact: ownApplication.creatorContact ?? "",
                              message: ownApplication.message ?? "",
                              quoteAmount: ownApplication.quoteAmount == null ? "" : String(ownApplication.quoteAmount),
                              proposedTimelineDays:
                                ownApplication.proposedTimelineDays == null ? "" : String(ownApplication.proposedTimelineDays),
                              proposedTimeline: ownApplication.proposedTimeline ?? "",
                            });
                          } else {
                            setApplyForm(readApplicationDraft(c.id) ?? EMPTY_APPLICATION_DRAFT);
                          }
                        }
                        setApplyId(applyId === c.id ? null : c.id);
                      }}
                      className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ownApplicationsStatus === "loading"
                        ? t("common.loading")
                        : ownApplicationsStatus === "error"
                          ? t("common.retry")
                          : applyId === c.id
                            ? t("camp.close")
                            : ownApplication?.status === "withdrawn"
                              ? t("dash.reactivateApplication")
                              : t("camp.apply")}
                    </button>
                  </div>
                  {applyId === c.id && (
                    <form
                      id={`application-form-${c.id}`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void apply(c.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        document.getElementById(`application-toggle-${c.id}`)?.focus();
                        setApplyId(null);
                      }}
                      className="mt-3 grid gap-2 rounded-2xl bg-[#fffbf1] border border-[#f0e6cc] p-4"
                    >
                      <PrivacyNotice textKey="camp.applySharingNotice" compact />
                      {creatorProfile?.completed && (
                        <p className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[13.5px] text-[#57534e]">
                          {t("camp.applyingAs")}: <strong className="text-[#1c1917]">{creatorProfile.name}</strong>
                        </p>
                      )}
                      <label htmlFor={`application-contact-${c.id}`} className="sr-only">{t("camp.applyContact")}</label>
                      <input
                        autoFocus
                        id={`application-contact-${c.id}`}
                        name="creatorContact"
                        autoComplete="off"
                        aria-describedby={`application-contact-note-${c.id}`}
                        value={applyForm.contact}
                        onChange={(e) => setApplyForm({ ...applyForm, contact: e.target.value })}
                        required
                        minLength={3}
                        aria-required="true"
                        list={`application-contacts-${c.id}`}
                        placeholder={t("camp.applyContact")}
                        className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none"
                      />
                      <datalist id={`application-contacts-${c.id}`}>
                        {contactOptions.map((option) => <option key={option} value={option} />)}
                      </datalist>
                      <p id={`application-contact-note-${c.id}`} className="text-[12.5px] font-semibold leading-relaxed text-[#6f6862]">{t("camp.contactMustBeYours")}</p>
                      <label htmlFor={`application-message-${c.id}`} className="sr-only">{t("camp.applyPhMsg")}</label>
                      <textarea id={`application-message-${c.id}`} name="message" autoComplete="off" value={applyForm.message} onChange={(e) => setApplyForm({ ...applyForm, message: e.target.value })} rows={2} placeholder={t("camp.applyPhMsg")} className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1" htmlFor={`application-quote-${c.id}`}>
                          <span className="text-[12.5px] font-bold text-[#57534e]">{t("camp.quote")}</span>
                          <input id={`application-quote-${c.id}`} name="quoteAmount" autoComplete="off" inputMode="numeric" aria-describedby={`application-quote-help-${c.id}`} value={applyForm.quoteAmount} onChange={(e) => setApplyForm({ ...applyForm, quoteAmount: sanitizeAmountInput(e.target.value) })} maxLength={16} placeholder={t("camp.quotePlaceholder")} className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none" />
                        </label>
                        <label className="grid gap-1" htmlFor={`application-timeline-days-${c.id}`}>
                          <span className="text-[12.5px] font-bold text-[#57534e]">{t("camp.timelineDays")}</span>
                          <input id={`application-timeline-days-${c.id}`} name="proposedTimelineDays" type="number" autoComplete="off" inputMode="numeric" min={1} max={365} step={1} value={applyForm.proposedTimelineDays} onChange={(e) => setApplyForm({ ...applyForm, proposedTimelineDays: e.target.value })} placeholder={t("camp.timelineDaysPlaceholder")} className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none" />
                        </label>
                      </div>
                      <p id={`application-quote-help-${c.id}`} className="text-[12.5px] font-semibold leading-relaxed text-[#6f6862]">{t("camp.quoteHelp")}</p>
                      <label className="grid gap-1" htmlFor={`application-timeline-${c.id}`}>
                        <span className="text-[12.5px] font-bold text-[#57534e]">{t("camp.timelineNotes")}</span>
                        <textarea id={`application-timeline-${c.id}`} name="proposedTimeline" autoComplete="off" value={applyForm.proposedTimeline} onChange={(e) => setApplyForm({ ...applyForm, proposedTimeline: e.target.value })} rows={2} maxLength={300} placeholder={t("camp.timelineNotesPlaceholder")} className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none" />
                      </label>
                      <label htmlFor={`application-consent-${c.id}`} className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-3 text-[13px] font-semibold leading-relaxed text-[#57534e]">
                        <input
                          id={`application-consent-${c.id}`}
                          name="contactSharingConsent"
                          autoComplete="off"
                          type="checkbox"
                          checked={applyConsent}
                          onChange={(e) => setApplyConsent(e.target.checked)}
                          required
                          className="mt-0.5 h-4 w-4 flex-none accent-[#c7431f]"
                        />
                        <span className="min-w-0 flex-1">{t("camp.applySharingConsent")}</span>
                      </label>
                      {applyError && (
                        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13.5px] font-semibold leading-relaxed text-red-800">
                          <p>{t(applyErrorKey)}</p>
                          {(applyError === "login" || applyError === "creator") && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Link href={buildAuthPath("/login", { returnTo: campaignReturnTo, role: "creator" })} className="rounded-lg bg-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-white">{t("nav.login")}</Link>
                              <Link href={buildAuthPath("/signup", { returnTo: campaignReturnTo, role: "creator" })} className="rounded-lg border border-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-[#1c1917]">{t("camp.emptyJoin")}</Link>
                            </div>
                          )}
                          {applyError === "api" && applyApiErrorKey === "api.creatorProfileIncomplete" && (
                            <div className="mt-2">
                              <Link href={buildPathWithReturnTo("/creators", campaignReturnTo, "/creators")} className="inline-block rounded-lg bg-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-white">{t("camp.completeCreatorProfile")}</Link>
                            </div>
                          )}
                        </div>
                      )}
                      <button type="submit" disabled={applyingId === c.id || ownApplicationsStatus === "loading" || ownApplicationsStatus === "error"} className="rounded-xl bg-[#c7431f] py-2.5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{applyingId === c.id ? t("camp.applySending") : t("camp.applySend")}</button>
                    </form>
                  )}
                </>
              )}
              <ReportButton targetType="campaign" targetId={c.id} targetName={c.title} className="mt-3" />
            </div>
            );
          })}
        </div>
        <ListingPagination
          loaded={campaigns.length}
          total={campaignPagination?.total ?? campaigns.length}
          hasMore={Boolean(campaignPagination?.hasMore)}
          loading={loadingMoreCampaigns}
          onLoadMore={loadMoreCampaigns}
        />
        </>
      )}
    </div>
  );
}
