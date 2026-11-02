"use client";

import { useLang, type TranslationKey } from "@/frontend/i18n";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiResponseError, appendUniqueById, fetchJsonPage, type ListPagination } from "@/frontend/api-json";
import { ListingError, ListingLoading, ListingPagination } from "@/frontend/components/ListingState";
import { CATEGORIES, LANGUAGES, CONTENT_TYPES, PLATFORMS, normalizeCategory, normalizePlatform } from "@/shared/constants";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import ReportButton from "@/frontend/components/ReportButton";
import RequiredMark from "@/frontend/components/RequiredMark";
import AuthJourneyNotice from "@/frontend/components/AuthJourneyNotice";
import { useSession } from "@/frontend/session-context";
import { readFormDraft, removeFormDraft, writeFormDraft } from "@/frontend/form-drafts";
import { buildPathWithReturnTo, safeReturnTo } from "@/shared/return-to";

// v2 ignores v1 drafts captured while platform/category were pre-selected.
const CREATOR_DRAFT_KEY = "yaarlink:creator-profile-draft:v2";
const AVAILABLE_CAMPAIGN_PAGE_SIZE = 6;

function initialAfterProfileReturnTo() {
  if (typeof window === "undefined") return "";
  return safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), "");
}

export type CreatorsInitialCampaigns = {
  campaigns: any[];
  pagination: ListPagination | null;
  status: "success" | "error";
};

export default function CreatorsPageClient({ initialCampaigns }: { initialCampaigns: CreatorsInitialCampaigns }) {
  const { t, opt, platform: platformLabel, apiErrorKey, formatNumber, formatDate, formatDateTime, formatRelativeTime } = useLang();
  const session = useSession();
  const [afterProfileReturnTo] = useState(initialAfterProfileReturnTo);
  const creatorReturnTo = afterProfileReturnTo
    ? buildPathWithReturnTo("/creators", afterProfileReturnTo, "/creators")
    : "/creators";
  const [step, setStep] = useState(1);
  const [campaigns, setCampaigns] = useState<any[]>(initialCampaigns.campaigns);
  const [campaignsStatus, setCampaignsStatus] = useState<"loading" | "success" | "error">(initialCampaigns.status);
  const [campaignsErrorKey, setCampaignsErrorKey] = useState<TranslationKey>("listing.loadFailed");
  const [campaignSort, setCampaignSort] = useState("newest");
  const [campaignPagination, setCampaignPagination] = useState<ListPagination | null>(initialCampaigns.pagination);
  const skippedInitialCampaignFetchRef = useRef(false);
  const [loadingMoreCampaigns, setLoadingMoreCampaigns] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    platform: "",
    instagram: "",
    youtube: "",
    profileUrl: "",
    followers: "",
    category: "",
    languages: [] as string[],
    location: "",
    contentTypes: [] as string[],
    bio: "",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [errKey, setErrKey] = useState<TranslationKey | "">("");
  const [authRequired, setAuthRequired] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const requestCampaignPage = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({
        limit: String(AVAILABLE_CAMPAIGN_PAGE_SIZE),
        sort: campaignSort,
      });
      if (cursor) params.set("cursor", cursor);
      return fetchJsonPage<any>(`/api/campaigns?${params.toString()}`, "campaigns", { cache: "no-store" });
    },
    [campaignSort],
  );
  const handleCampaignsSuccess = useCallback((page: { items: any[]; pagination: ListPagination }, append = false) => {
    setCampaigns((current) => (append ? appendUniqueById(current, page.items) : page.items));
    setCampaignPagination(page.pagination);
    setCampaignsStatus("success");
  }, []);
  const handleCampaignsError = useCallback((error: unknown) => {
    setCampaignsErrorKey(
      error instanceof ApiResponseError ? apiErrorKey(error.status, error.code, "listing.loadFailed") : "api.network",
    );
    setCampaignsStatus("error");
  }, [apiErrorKey]);

  const fetchCampaigns = useCallback(async () => {
    try {
      handleCampaignsSuccess(await requestCampaignPage());
    } catch (error) {
      handleCampaignsError(error);
    }
  }, [handleCampaignsError, handleCampaignsSuccess, requestCampaignPage]);

  const loadCampaigns = useCallback(async () => {
    setCampaignsStatus("loading");
    await fetchCampaigns();
  }, [fetchCampaigns]);

  const loadMoreCampaigns = useCallback(() => {
    if (!campaignPagination?.nextCursor || loadingMoreCampaigns) return;
    setLoadingMoreCampaigns(true);
    requestCampaignPage(campaignPagination.nextCursor)
      .then((page) => handleCampaignsSuccess(page, true))
      .catch(handleCampaignsError)
      .finally(() => setLoadingMoreCampaigns(false));
  }, [campaignPagination, handleCampaignsError, handleCampaignsSuccess, loadingMoreCampaigns, requestCampaignPage]);

  useEffect(() => {
    // The default newest-first page is server-rendered; only a later sort
    // change needs the client API.
    if (!skippedInitialCampaignFetchRef.current) {
      skippedInitialCampaignFetchRef.current = true;
      return;
    }
    let alive = true;
    requestCampaignPage()
      .then((page) => {
        if (alive) handleCampaignsSuccess(page);
      })
      .catch((error: unknown) => {
        if (alive) handleCampaignsError(error);
      });
    return () => {
      alive = false;
    };
  }, [handleCampaignsError, handleCampaignsSuccess, requestCampaignPage]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const draft = readFormDraft(CREATOR_DRAFT_KEY) as { form?: unknown; step?: unknown } | null;
        if (!draft) return;
      let restored = false;
      if (draft.form && typeof draft.form === "object" && !Array.isArray(draft.form)) {
        const draftForm = draft.form as Record<string, unknown>;
        const meaningfulTextFields = [
          "name",
          "phone",
          "email",
          "platform",
          "instagram",
          "youtube",
          "profileUrl",
          "followers",
          "category",
          "location",
          "bio",
        ] as const;
        restored =
          meaningfulTextFields.some((field) => typeof draftForm[field] === "string" && draftForm[field].trim() !== "") ||
          (Array.isArray(draftForm.languages) && draftForm.languages.some((item) => typeof item === "string" && LANGUAGES.includes(item as never))) ||
          (Array.isArray(draftForm.contentTypes) && draftForm.contentTypes.some((item) => typeof item === "string" && CONTENT_TYPES.includes(item as never)));
        setForm((current) => {
          const next = { ...current };
          for (const field of Object.keys(current) as Array<keyof typeof current>) {
            const value = draftForm[field];
            if (field === "languages") {
              if (Array.isArray(value)) {
                next.languages = value.filter((item): item is string => typeof item === "string" && LANGUAGES.includes(item as never));
              }
            } else if (field === "contentTypes") {
              if (Array.isArray(value)) {
                next.contentTypes = value.filter((item): item is string => typeof item === "string" && CONTENT_TYPES.includes(item as never));
              }
            } else if (field === "platform") {
              next.platform = normalizePlatform(value) ?? "";
            } else if (field === "category") {
              next.category = normalizeCategory(value) ?? "";
            } else if (typeof value === "string" && value.length <= 5000) {
              next[field] = value as never;
            }
          }
          return next;
        });
      }
      if (typeof draft.step === "number" && Number.isInteger(draft.step) && draft.step >= 1 && draft.step <= 3) {
        setStep(draft.step);
        if (draft.step > 1) restored = true;
      }
      if (restored) setDraftRestored(true);
      } catch {
        // Draft storage is a best-effort convenience only.
      } finally {
        if (active) setDraftReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftReady || done) return;
    writeFormDraft(CREATOR_DRAFT_KEY, { form, step });
  }, [done, draftReady, form, step]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "languages" | "contentTypes", v: string) => {
    setForm((f) => {
      const arr = f[k] as string[];
      return { ...f, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  };

  const canNext1 = form.name.trim().length >= 2 && Boolean(form.phone.trim() || form.email.trim()) && Boolean(form.platform);
  const hasSocialProfile = Boolean(form.profileUrl.trim() || form.instagram.trim() || form.youtube.trim());
  const canNext2 = hasSocialProfile && Boolean(form.followers.trim()) && Boolean(form.category);

  const submit = async () => {
    setErrKey("");
    if (session.status === "loading") {
      setErrKey("session.checking");
      return;
    }
    if (session.status === "error") {
      setErrKey("session.unavailable");
      return;
    }
    if (!session.user) {
      setAuthRequired(true);
      setErrKey("api.unauthorized");
      document.getElementById("creator-auth-notice")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setAuthRequired(false);
    if (!canNext1) {
      setErrKey(form.platform ? "cr.needContact" : "api.invalidPlatform");
      setStep(1);
      return;
    }
    if (!hasSocialProfile) {
      setErrKey("api.profileLinkRequired");
      setStep(2);
      return;
    }
    if (!form.followers.trim()) {
      setErrKey("api.invalidFollowers");
      setStep(2);
      return;
    }
    if (!form.category || form.languages.length === 0) {
      setErrKey("cr.err");
      if (!form.category) setStep(2);
      return;
    }
    if (form.contentTypes.length === 0) {
      setErrKey("api.invalidContentTypes");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, followers: form.followers.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          session.markLoggedOut();
          setAuthRequired(true);
        }
        setErrKey(apiErrorKey(res.status, d?.code));
        return;
      }
      removeFormDraft(CREATOR_DRAFT_KEY);
      setDraftRestored(false);
      setVerificationCode(d.creator?.verificationCode ?? "");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErrKey("api.network");
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrKey("");
    if (step === 1) {
      if (canNext1) setStep(2);
      return;
    }
    if (step === 2) {
      if (canNext2) setStep(3);
      return;
    }
    void submit();
  };

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-10 card-shadow">
          <p className="text-[48px]">🎉</p>
          <h1 className="font-display mt-3 text-[32px] font-black">{t("cr.doneTitle")} {form.name.split(" ")[0]}!</h1>
          <p className="mt-2 text-[15.5px] text-[#57534e]">
            {t("cr.doneBody")}
          </p>
          {verificationCode && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
              <p className="text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("verify.creatorCode")}</p>
              <p className="mt-1 font-mono text-[22px] font-black tracking-wider">{verificationCode}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#57534e]">{t("verify.creatorHelp")}</p>
              <p className="mt-1 text-[12.5px] font-semibold text-[#6f6862]">{t("verify.dashboardNote")}</p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {afterProfileReturnTo && (
              <Link href={afterProfileReturnTo} className="rounded-2xl bg-[#c7431f] px-6 py-3.5 text-[15px] font-bold text-white hover:bg-[#a93618]">{t("authFlow.continueWhereLeft")}</Link>
            )}
            <Link href="/dashboard?view=creator" className="rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15px] font-bold text-white">{t("cr.dashboard")}</Link>
            <Link href="/campaigns" className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] px-6 py-3.5 text-[15px] font-bold">{t("cr.browse")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="bg-[#1c1917] text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#ffc53d]">{t("cr.eyebrow")}</p>
          <h1 className="font-display mt-2 max-w-2xl text-[36px] font-black leading-tight sm:text-[52px]">
            {t("cr.title")}
          </h1>
          <p className="mt-3 max-w-xl text-[16.5px] text-white/70">
            {t("cr.sub")}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* FORM */}
          <form onSubmit={handleFormSubmit} className="rounded-[24px] border border-[#e9ddc3] bg-white p-6 sm:p-8 card-shadow">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[24px] font-black">{t("cr.formTitle")}</h2>
              <span className="text-[13px] font-bold text-[#6f6862]">{t("cr.step")} {formatNumber(step, { useGrouping: false })} {t("cr.of")}</span>
            </div>
            {/* progress */}
            <div className="mt-3 flex gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`h-2 flex-1 rounded-full ${s <= step ? "bg-[#c7431f]" : "bg-[#f0e6cc]"}`} />
              ))}
            </div>
            <div className="mt-4">
              <AuthJourneyNotice
                id="creator-auth-notice"
                status={session.status}
                user={session.user}
                messageKey="authFlow.creatorLoginRequired"
                returnTo={creatorReturnTo}
                role="creator"
                onRetry={session.refresh}
                forceGuest={authRequired}
              />
            </div>
            {draftRestored && (
              <p role="status" className="mt-3 rounded-xl border border-[#bfe3c5] bg-[#f2fbf3] px-4 py-3 text-[13px] font-bold text-[#17452e]">
                {t("authFlow.draftRestored")}
              </p>
            )}
            {errKey && <p role="alert" className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[14px] font-bold text-red-700">{t(errKey)}</p>}

            {step === 1 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#6f6862]">{t("cr.s1")}</p>
                <label className="grid gap-1.5" htmlFor="creator-name">
                  <span className="text-[13.5px] font-bold">{t("cr.name")}</span>
                  <input id="creator-name" name="name" autoComplete="name" required minLength={2} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("cr.phName")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="creator-phone">
                    <span className="text-[13.5px] font-bold">{t("cr.phone")}</span>
                    <input id="creator-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" aria-describedby="creator-contact-hint" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5" htmlFor="creator-email">
                    <span className="text-[13.5px] font-bold">{t("cr.email")}</span>
                    <input id="creator-email" name="email" type="email" inputMode="email" autoComplete="email" aria-describedby="creator-contact-hint" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("cr.phEmail")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                </div>
                <p id="creator-contact-hint" className="text-[13px] font-semibold text-[#6f6862]">{t("cr.needContact")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="creator-location">
                    <span className="text-[13.5px] font-bold">{t("cr.city")}</span>
                    <input id="creator-location" name="location" autoComplete="address-level2" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={t("cr.phCity")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5" htmlFor="creator-platform">
                    <span className="text-[13.5px] font-bold">{t("cr.platform")}<RequiredMark /></span>
                    <select id="creator-platform" name="platform" autoComplete="off" required value={form.platform} onChange={(e) => set("platform", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3">
                      <option value="" disabled>{t("form.chooseOption")}</option>
                      {PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
                    </select>
                  </label>
                </div>
                <button type="submit" disabled={!canNext1} className="mt-2 rounded-2xl bg-[#1c1917] py-3.5 text-[15.5px] font-bold text-white disabled:opacity-40">{t("cr.continue")}</button>
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#6f6862]">{t("cr.s2")}</p>
                <p id="creator-social-hint" className="text-[13px] font-semibold leading-relaxed text-[#6f6862]">{t("cr.socialHint")}</p>
                <label className="grid gap-1.5" htmlFor="creator-profile-url">
                  <span className="text-[13.5px] font-bold">{t("cr.profileLink")}</span>
                  <input id="creator-profile-url" name="profileUrl" autoComplete="url" inputMode="url" aria-describedby="creator-social-hint" value={form.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder={t("cr.phProfile")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="creator-instagram">
                    <span className="text-[13.5px] font-bold">{t("cr.instagram")}</span>
                    <input id="creator-instagram" name="instagram" autoComplete="url" inputMode="url" aria-describedby="creator-social-hint" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder={t("cr.phIg")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5" htmlFor="creator-youtube">
                    <span className="text-[13.5px] font-bold">{t("cr.youtube")}</span>
                    <input id="creator-youtube" name="youtube" autoComplete="url" inputMode="url" aria-describedby="creator-social-hint" value={form.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder={t("cr.phYt")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="grid gap-1.5" htmlFor="creator-followers">
                      <span className="text-[13.5px] font-bold">{t("cr.followers")}<RequiredMark /></span>
                      <input id="creator-followers" name="followers" autoComplete="off" required aria-describedby="creator-followers-hint" value={form.followers} onChange={(e) => set("followers", e.target.value)} placeholder={t("cr.phFollowers")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                    </label>
                    <p id="creator-followers-hint" className="mt-1.5 text-[12.5px] font-semibold text-[#6f6862]">{t("cr.followersHint")}</p>
                  </div>
                  <label className="grid gap-1.5" htmlFor="creator-category">
                    <span className="text-[13.5px] font-bold">{t("cr.category")}<RequiredMark /></span>
                    <select id="creator-category" name="category" autoComplete="off" required value={form.category} onChange={(e) => set("category", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3">
                      <option value="" disabled>{t("form.chooseOption")}</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-2xl border border-[#e9ddc3] py-3.5 text-[15px] font-bold">{t("cr.back")}</button>
                  <button type="submit" disabled={!canNext2} className="flex-[2] rounded-2xl bg-[#1c1917] py-3.5 text-[15px] font-bold text-white disabled:opacity-40">{t("cr.continue")}</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#6f6862]">{t("cr.s3")}</p>
                <div>
                  <p id="creator-languages-label" className="text-[13.5px] font-bold">{t("cr.langs")}<span className="sr-only"> ({t("form.required")})</span></p>
                  <p id="creator-languages-hint" className="mt-1 text-[12.5px] font-semibold text-[#6f6862]">{t("form.chooseAtLeastOne")}</p>
                  <div role="group" aria-labelledby="creator-languages-label" aria-describedby="creator-languages-hint" className="mt-2 flex flex-wrap gap-2">
                    {LANGUAGES.map((l) => (
                      <button key={l} type="button" onClick={() => toggle("languages", l)} aria-pressed={form.languages.includes(l)}
                        className={`rounded-full border px-4 py-2 text-[13.5px] font-bold ${form.languages.includes(l) ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-[#fffbf1]"}`}>
                        {opt(l)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p id="creator-content-types-label" className="text-[13.5px] font-bold">{t("cr.content")}<RequiredMark /></p>
                  <p id="creator-content-types-hint" className="mt-1 text-[12.5px] font-semibold text-[#6f6862]">{t("form.chooseAtLeastOne")}</p>
                  <div role="group" aria-labelledby="creator-content-types-label" aria-describedby="creator-content-types-hint" className="mt-2 flex flex-wrap gap-2">
                    {CONTENT_TYPES.map((c) => (
                      <button key={c} type="button" onClick={() => toggle("contentTypes", c)} aria-pressed={form.contentTypes.includes(c)}
                        className={`rounded-full border px-4 py-2 text-[13.5px] font-bold ${form.contentTypes.includes(c) ? "border-[#c7431f] bg-[#c7431f] text-white" : "border-[#e9ddc3] bg-[#fffbf1]"}`}>
                        {opt(c)}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="grid gap-1.5" htmlFor="creator-bio">
                  <span className="text-[13.5px] font-bold">{t("cr.bio")} <span className="font-medium text-[#6f6862]">{t("cr.optional")}</span></span>
                  <textarea id="creator-bio" name="bio" autoComplete="off" value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder={t("cr.phBio")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <PrivacyNotice textKey="privacy.creatorNotice" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 rounded-2xl border border-[#e9ddc3] py-3.5 text-[15px] font-bold">{t("cr.back")}</button>
                  <button type="submit" disabled={saving} className="flex-[2] rounded-2xl bg-[#c7431f] py-3.5 text-[15.5px] font-extrabold text-white hover:bg-[#a93618] disabled:opacity-60">
                    {saving ? t("cr.submitting") : t("cr.submit")}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* AVAILABLE CAMPAIGNS */}
          <div className="grid content-start gap-4">
            <div className="rounded-[24px] bg-[#ffc53d] p-6">
              <h3 className="font-display text-[22px] font-black">{t("cr.avail")}</h3>
              <p className="text-[14px] font-semibold text-[#57534e]">{t("cr.availSub")}</p>
              <label className="relative mt-4 block" htmlFor="creator-available-campaign-sort">
                <span className="sr-only">{t("listing.sort")}</span>
                <select id="creator-available-campaign-sort" name="availableCampaignSort" autoComplete="off" value={campaignSort} onChange={(e) => { setCampaignPagination(null); setCampaignsStatus("loading"); setCampaignSort(e.target.value); }} className="w-full min-w-0 appearance-none truncate rounded-xl border border-black/15 bg-white py-3 pl-4 pr-9 text-[14px] font-bold text-[#1c1917] outline-none focus:border-[#1c1917]">
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
              <div className="mt-4 grid gap-3">
                {campaignsStatus === "loading" && campaigns.length === 0 ? (
                  <ListingLoading
                    count={3}
                    labelKey="listing.loadingCampaigns"
                    itemClassName="h-[112px] animate-pulse rounded-2xl bg-white/60"
                  />
                ) : campaignsStatus === "error" && campaigns.length === 0 ? (
                  <ListingError errorKey={campaignsErrorKey} onRetry={() => void loadCampaigns()} />
                ) : (
                  <>
                    {campaignsStatus === "error" && (
                      <ListingError errorKey={campaignsErrorKey} onRetry={() => void loadCampaigns()} />
                    )}
                    {campaigns.length === 0 && <p className="rounded-2xl bg-white/70 p-4 text-[14px] font-semibold">{t("cr.availEmpty")}</p>}
                    {campaigns.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-black/10 bg-white p-4">
                    <p className="text-[15px] font-extrabold leading-snug">
                      <Link href={`/campaigns/${c.id}`} aria-label={`${t("detail.viewCampaign")}: ${c.title}`} className="hover:text-[#c7431f] hover:underline">
                        {c.title}
                      </Link>
                    </p>
                    <p className="mt-1 text-[13px] text-[#6f6862]">{[c.businessName, c.location, opt(c.language)].filter(Boolean).join(" • ")}</p>
                    <p className="mt-1 text-[12px] font-semibold text-[#6f6862]">
                      <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                        {t("listing.posted", { age: formatRelativeTime(c.createdAt) })}
                      </time>
                      {(c.deadlineAt ?? c.expiresAt) && (
                        <>
                          {" • "}
                          <time dateTime={c.deadlineAt ?? c.expiresAt} title={formatDateTime(c.deadlineAt ?? c.expiresAt)}>
                            {t("camp.applyBy", { date: formatDate(c.deadlineAt ?? c.expiresAt) })}
                          </time>
                        </>
                      )}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-[#17452e] px-3 py-1 text-[12.5px] font-bold text-white">{t("cr.paid")} • {opt(c.format)}</span>
                      <Link href={`/campaigns/${c.id}`} className="shrink-0 text-[13.5px] font-bold text-[#c7431f] hover:underline">{t("detail.viewCampaign")}</Link>
                    </div>
                    <div className="mt-2">
                      <span className="text-[11.5px] font-bold text-green-800">{t("listing.reviewed")}</span>
                      <ReportButton targetType="campaign" targetId={c.id} targetName={c.title} className="mt-1 text-right" />
                    </div>
                  </div>
                ))}
                  </>
                )}
              </div>
              <ListingPagination
                loaded={campaigns.length}
                total={campaignPagination?.total ?? campaigns.length}
                hasMore={Boolean(campaignPagination?.hasMore)}
                loading={loadingMoreCampaigns}
                onLoadMore={loadMoreCampaigns}
                className="mt-4 flex flex-col items-center gap-2"
                textClassName="text-[12.5px] font-bold text-[#57534e]"
                buttonClassName="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13px] font-extrabold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              />
              <Link href="/campaigns" className="mt-4 block rounded-2xl bg-[#1c1917] py-3 text-center text-[14.5px] font-bold text-white">{t("cr.seeAll")}</Link>
            </div>
            <div className="rounded-[24px] border border-[#e9ddc3] bg-white p-6">
              <h4 className="text-[16px] font-extrabold">{t("cr.whyTitle")}</h4>
              <ul className="mt-2 grid gap-2 text-[14px] text-[#57534e]">
                <li>🤝 <b>{t("cr.whyDirectTitle")}</b> — {t("cr.whyDirect")}</li>
                <li>💸 <b>{t("cr.whyPayTitle")}</b> — {t("cr.whyPay")}</li>
                <li>🗣️ <b>{t("cr.whyLanguageTitle")}</b> — {t("cr.whyLanguage")}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
