"use client";

import { useLang } from "@/frontend/i18n";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiResponseError, appendUniqueById, fetchJsonPage, type ListPagination } from "@/frontend/api-json";
import { ListingError, ListingLoading, ListingPagination } from "@/frontend/components/ListingState";
import { useSearchParams } from "next/navigation";
import { CATEGORIES, LANGUAGES, CONTENT_TYPES, PROMOTION_TYPES, normalizePromotionType } from "@/shared/constants";
import ContactLink from "@/frontend/components/ContactLink";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import ReportButton from "@/frontend/components/ReportButton";
import { SITE, instagramDmLink, whatsappWithText } from "@/config/site";


const CREATOR_PAGE_SIZE = 8;

function creatorListUrl({
  q,
  lang,
  category,
  sort,
  cursor,
}: {
  q: string;
  lang: string;
  category: string;
  sort: string;
  cursor?: string | null;
}) {
  const params = new URLSearchParams({ limit: String(CREATOR_PAGE_SIZE), sort });
  if (q) params.set("q", q);
  if (lang) params.set("language", lang);
  if (category) params.set("category", category);
  if (cursor) params.set("cursor", cursor);
  return `/api/creators?${params.toString()}`;
}

function BrandInner() {
  const params = useSearchParams();
  const { t, opt, promo, apiErrorKey, formatNumber, formatCurrency } = useLang();
  const preset = normalizePromotionType(params.get("type")) ?? "";
  const [creators, setCreators] = useState<any[]>([]);
  const [creatorsStatus, setCreatorsStatus] = useState<"loading" | "success" | "error">("loading");
  const [creatorsErrorKey, setCreatorsErrorKey] = useState("listing.loadFailed");
  const [filter, setFilter] = useState({ lang: "", category: "" });
  const [creatorQ, setCreatorQ] = useState("");
  const [creatorSearchQ, setCreatorSearchQ] = useState("");
  const [creatorSort, setCreatorSort] = useState("newest");
  const [creatorPagination, setCreatorPagination] = useState<ListPagination | null>(null);
  const [loadingMoreCreators, setLoadingMoreCreators] = useState(false);
  const creatorRequestRef = useRef(0);
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    title: "",
    promotionType: preset || "Product",
    category: "Food & Cafe",
    website: "",
    targetAudience: "",
    location: "Ludhiana",
    language: "Punjabi",
    format: "Story",
    description: "",
  });
  const [done, setDone] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [errKey, setErrKey] = useState("");

  useEffect(() => {
    if (preset) setForm((f) => ({ ...f, promotionType: preset }));
  }, [preset]);

  const handleCreatorsError = useCallback(
    (error: unknown) => {
      setCreatorsErrorKey(
        error instanceof ApiResponseError ? apiErrorKey(error.status, error.code, "listing.loadFailed") : "api.network",
      );
      setCreatorsStatus("error");
    },
    [apiErrorKey],
  );

  const fetchCreatorPage = useCallback(
    async ({ append = false, cursor = null }: { append?: boolean; cursor?: string | null } = {}) => {
      const requestId = ++creatorRequestRef.current;
      if (append) setLoadingMoreCreators(true);
      else setCreatorsStatus("loading");
      try {
        const page = await fetchJsonPage<any>(
          creatorListUrl({ q: creatorSearchQ, lang: filter.lang, category: filter.category, sort: creatorSort, cursor }),
          "creators",
          { cache: "no-store" },
        );
        if (requestId !== creatorRequestRef.current) return;
        setCreators((current) => (append ? appendUniqueById(current, page.items) : page.items));
        setCreatorPagination(page.pagination);
        setCreatorsStatus("success");
      } catch (error) {
        if (requestId === creatorRequestRef.current) handleCreatorsError(error);
      } finally {
        if (append && requestId === creatorRequestRef.current) setLoadingMoreCreators(false);
      }
    },
    [creatorSearchQ, creatorSort, filter.category, filter.lang, handleCreatorsError],
  );

  const loadCreators = useCallback(async () => {
    await fetchCreatorPage();
  }, [fetchCreatorPage]);

  const loadMoreCreators = useCallback(() => {
    if (!creatorPagination?.nextCursor || loadingMoreCreators) return;
    void fetchCreatorPage({ append: true, cursor: creatorPagination.nextCursor });
  }, [creatorPagination, fetchCreatorPage, loadingMoreCreators]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setCreatorSearchQ(creatorQ.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [creatorQ]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchCreatorPage());
  }, [fetchCreatorPage]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [budgetAmount, setBudgetAmount] = useState("8000");
  const budgetNum = Number(budgetAmount || 0);
  const budgetHint = !budgetNum
    ? t("brand.budgetHintEmpty")
    : budgetNum < 500
      ? t("brand.budgetHintMin")
      : t("brand.budgetHint");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrKey("");
    if (!form.businessName || !form.title) {
      setErrKey("brand.errMissing");
      return;
    }
    if (budgetNum < 500) {
      setErrKey("brand.errBudget");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, budget: budgetNum }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrKey(apiErrorKey(res.status, d?.code));
        return;
      }
      setVerificationCode(d.campaign?.verificationCode ?? "");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErrKey("api.network");
    } finally {
      setSaving(false);
    }
  };

  const hasActiveCreatorFilters = Boolean(creatorSearchQ || filter.lang || filter.category || creatorSort !== "newest");

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-10 card-shadow">
          <p className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-[28px]">✓</p>
          <h1 className="font-display mt-5 text-[32px] font-black">{t("brand.doneTitle")}</h1>
          <p className="mt-2 text-[15.5px] text-[#57534e]">
            {t("brand.doneBody2")} <b>“{form.title}”</b> {t("brand.doneBody")}
          </p>
          {verificationCode && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
              <p className="text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("verify.businessCode")}</p>
              <p className="mt-1 font-mono text-[22px] font-black tracking-wider">{verificationCode}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#57534e]">{t("verify.businessHelp")}</p>
              <p className="mt-1 text-[12.5px] font-semibold text-[#6f6862]">{t("verify.dashboardNote")}</p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/dashboard" className="rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15px] font-bold text-white">{t("brand.dashboard")}</Link>
            <Link href="/campaigns" className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] px-6 py-3.5 text-[15px] font-bold">{t("brand.viewAll")}</Link>
          </div>
          <button onClick={() => { setDone(false); setVerificationCode(""); setForm((f) => ({ ...f, title: "", description: "" })); }} className="mt-4 text-[13.5px] font-bold text-[#c7431f]">+ {t("brand.another")}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="border-b border-[#e9ddc3] bg-[#fff4de]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("brand.eyebrow")}</p>
          <h1 className="font-display mt-2 max-w-2xl text-[36px] font-black leading-tight sm:text-[52px]">
            {t("brand.title")}
          </h1>
          <p className="mt-3 max-w-xl text-[16.5px] text-[#57534e]">
            {t("brand.sub")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-bold">
            <span className="rounded-full bg-white border border-[#e9ddc3] px-3 py-1.5">{t("brand.b1")}</span>
            <span className="rounded-full bg-white border border-[#e9ddc3] px-3 py-1.5">{t("brand.b2")}</span>
            <span className="rounded-full bg-white border border-[#e9ddc3] px-3 py-1.5">{t("brand.b3")}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          {/* FORM */}
          <form onSubmit={submit} className="rounded-[24px] border border-[#e9ddc3] bg-white p-6 sm:p-8 card-shadow">
            <h2 className="font-display text-[24px] font-black">{t("brand.formTitle")}</h2>
            <p className="text-[14px] text-[#6f6862]">{t("brand.formSub")}</p>

            <div className="mt-6 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5" htmlFor="brand-business-name">
                  <span className="text-[13.5px] font-bold">{t("brand.businessName")}</span>
                  <input id="brand-business-name" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder={t("brand.phBusiness")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5" htmlFor="brand-contact-name">
                  <span className="text-[13.5px] font-bold">{t("brand.contactName")}</span>
                  <input id="brand-contact-name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder={t("brand.phName")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
              </div>

              <label className="grid gap-1.5" htmlFor="brand-campaign-title">
                <span className="text-[13.5px] font-bold">{t("brand.titleLabel")} <span className="font-medium text-[#6f6862]">{t("brand.titleHint")}</span></span>
                <input id="brand-campaign-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={t("brand.phTitle")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              </label>

              <div>
                <p id="brand-promotion-type-label" className="text-[13.5px] font-bold">{t("brand.promoting")}</p>
                <div role="group" aria-labelledby="brand-promotion-type-label" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PROMOTION_TYPES.map((p) => (
                    <button type="button" key={p.id} onClick={() => set("promotionType", p.id)} aria-pressed={form.promotionType === p.id}
                      className={`rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-bold ${form.promotionType === p.id ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-[#fffbf1]"}`}>
                      <span aria-hidden="true" className="mr-1">{p.emoji}</span>{promo(p.title)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5" htmlFor="brand-website">
                  <span className="text-[13.5px] font-bold">{t("brand.website")}</span>
                  <input id="brand-website" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder={t("brand.phWebsite")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5" htmlFor="brand-category">
                  <span className="text-[13.5px] font-bold">{t("brand.category")}</span>
                  <select id="brand-category" value={form.category} onChange={(e) => set("category", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5" htmlFor="brand-target-audience">
                  <span className="text-[13.5px] font-bold">{t("brand.audience")}</span>
                  <input id="brand-target-audience" value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder={t("brand.phAudience")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5" htmlFor="brand-location">
                  <span className="text-[13.5px] font-bold">{t("brand.location")}</span>
                  <input id="brand-location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={t("brand.phLocation")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
              </div>

              {/* Custom budget */}
              <div className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <label htmlFor="budget" className="text-[13.5px] font-bold">{t("brand.budget")}</label>
                  <span id="brand-budget-private" className="text-[12px] font-semibold text-[#6f6862]">{t("brand.budgetPrivate")}</span>
                </div>
                <div className="mt-2 flex items-center rounded-xl border border-[#e9ddc3] bg-white focus-within:border-[#1c1917]">
                  <span className="pl-4 text-[20px] font-extrabold text-[#6f6862]">₹</span>
                  <input
                    id="budget"
                    aria-describedby="brand-budget-private brand-budget-hint"
                    inputMode="numeric"
                    value={budgetAmount ? formatNumber(Number(budgetAmount)) : ""}
                    onChange={(e) => setBudgetAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                    placeholder={t("brand.budgetPlaceholder")}
                    className="w-full rounded-xl bg-transparent px-2 py-3 text-[20px] font-extrabold outline-none"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[2000, 5000, 10000, 25000, 50000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBudgetAmount(String(v))}
                      aria-pressed={Number(budgetAmount) === v}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${Number(budgetAmount) === v ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-white"}`}
                    >
                      {formatCurrency(v)}
                    </button>
                  ))}
                </div>
                <p id="brand-budget-hint" className={`mt-3 text-[13px] font-semibold ${budgetNum > 0 && budgetNum < 500 ? "text-red-700" : "text-[#57534e]"}`}>
                  {budgetHint}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5" htmlFor="brand-language">
                  <span className="text-[13.5px] font-bold">{t("brand.language")}</span>
                  <select id="brand-language" value={form.language} onChange={(e) => set("language", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none">
                    {LANGUAGES.slice(0, 5).map((l) => <option key={l} value={l}>{opt(l)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5" htmlFor="brand-format">
                  <span className="text-[13.5px] font-bold">{t("brand.format")}</span>
                  <select id="brand-format" value={form.format} onChange={(e) => set("format", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none">
                    {CONTENT_TYPES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5" htmlFor="brand-phone">
                  <span className="text-[13.5px] font-bold">{t("brand.phone")}</span>
                  <input id="brand-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5" htmlFor="brand-email">
                  <span className="text-[13.5px] font-bold">{t("brand.email")}</span>
                  <input id="brand-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("brand.phEmail")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
              </div>

              <label className="grid gap-1.5" htmlFor="brand-description">
                <span className="text-[13.5px] font-bold">{t("brand.descLabel")} <span className="font-medium text-[#6f6862]">{t("brand.descHint")}</span></span>
                <textarea id="brand-description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder={t("brand.phDesc")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              </label>

              <PrivacyNotice textKey="privacy.campaignNotice" />

              {errKey && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[14px] font-bold text-red-700">{t(errKey)}</p>}

              <button disabled={saving} className="rounded-2xl bg-[#c7431f] py-4 text-[16.5px] font-extrabold text-white hover:bg-[#a93618] disabled:opacity-60">
                {saving ? t("brand.submitting") : t("brand.submit")}
              </button>
              <p className="text-center text-[12.5px] text-[#6f6862]">{t("brand.free")}</p>
            </div>
          </form>

          {/* SIDE */}
          <div className="grid content-start gap-4">
            <div className="rounded-[24px] bg-[#17452e] p-6 text-white">
              <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#ffc53d]">{t("browse.title")}</p>
              <h3 className="font-display mt-1 text-[22px] font-black">{t("browse.heading")}</h3>
              <label className="mt-3 block" htmlFor="brand-creator-search">
                <span className="sr-only">{t("listing.searchLabel")}</span>
                <input
                  id="brand-creator-search"
                  value={creatorQ}
                  onChange={(e) => setCreatorQ(e.target.value)}
                  placeholder={t("listing.searchCreators")}
                  className="w-full min-w-0 rounded-xl border border-white/25 bg-white/10 px-3.5 py-3 text-[14px] font-semibold text-white outline-none placeholder:text-white/80 focus:border-[#ffc53d]"
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <label className="relative block" htmlFor="brand-creator-language-filter">
                  <span className="sr-only">{t("browse.filterLang")}</span>
                  <select id="brand-creator-language-filter" value={filter.lang} onChange={(e) => setFilter((f) => ({ ...f, lang: e.target.value }))} className="w-full min-w-0 appearance-none truncate rounded-xl border border-white/25 bg-white/10 py-3 pl-3.5 pr-9 text-[14px] font-bold text-white outline-none focus:border-[#ffc53d] [&>option]:bg-white [&>option]:text-[#1c1917]">
                    <option value="">{t("browse.allLang")}</option>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{opt(l)}</option>)}
                  </select>
                  <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#ffc53d]">▼</span>
                </label>
                <label className="relative block" htmlFor="brand-creator-category-filter">
                  <span className="sr-only">{t("browse.filterCat")}</span>
                  <select id="brand-creator-category-filter" value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))} className="w-full min-w-0 appearance-none truncate rounded-xl border border-white/25 bg-white/10 py-3 pl-3.5 pr-9 text-[14px] font-bold text-white outline-none focus:border-[#ffc53d] [&>option]:bg-white [&>option]:text-[#1c1917]">
                    <option value="">{t("browse.allCat")}</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                  </select>
                  <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#ffc53d]">▼</span>
                </label>
              </div>
              <label className="relative mt-2 block" htmlFor="brand-creator-sort">
                <span className="sr-only">{t("listing.sort")}</span>
                <select id="brand-creator-sort" value={creatorSort} onChange={(e) => setCreatorSort(e.target.value)} className="w-full min-w-0 appearance-none truncate rounded-xl border border-white/25 bg-white/10 py-3 pl-3.5 pr-9 text-[14px] font-bold text-white outline-none focus:border-[#ffc53d] [&>option]:bg-white [&>option]:text-[#1c1917]">
                  <option value="newest">{t("listing.sortNewest")}</option>
                  <option value="oldest">{t("listing.sortOldest")}</option>
                  <option value="name">{t("listing.sortName")}</option>
                  <option value="followers_desc">{t("listing.sortFollowersDesc")}</option>
                  <option value="followers_asc">{t("listing.sortFollowersAsc")}</option>
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#ffc53d]">▼</span>
              </label>
              <div className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto">
                {creatorsStatus === "loading" && creators.length === 0 ? (
                  <ListingLoading
                    count={3}
                    labelKey="listing.loadingCreators"
                    itemClassName="h-[68px] animate-pulse rounded-2xl bg-white/15"
                  />
                ) : creatorsStatus === "error" && creators.length === 0 ? (
                  <ListingError
                    errorKey={creatorsErrorKey}
                    onRetry={() => void loadCreators()}
                    className="rounded-xl border border-red-200/40 bg-red-950/30 p-4 text-[13.5px] font-semibold text-red-100"
                    buttonClassName="mt-3 rounded-xl bg-[#ffc53d] px-4 py-2 text-[13px] font-extrabold text-[#1c1917] hover:bg-[#ffb703]"
                  />
                ) : (
                  <>
                    {creatorsStatus === "error" && (
                      <ListingError
                        errorKey={creatorsErrorKey}
                        onRetry={() => void loadCreators()}
                        className="rounded-xl border border-red-200/40 bg-red-950/30 p-4 text-[13.5px] font-semibold text-red-100"
                        buttonClassName="mt-3 rounded-xl bg-[#ffc53d] px-4 py-2 text-[13px] font-extrabold text-[#1c1917] hover:bg-[#ffb703]"
                      />
                    )}
                    {creators.length === 0 && (
                      <p className="rounded-xl bg-white/10 p-4 text-[13.5px]">
                        {hasActiveCreatorFilters ? t("listing.noCreatorMatches") : t("listing.noCreators")}{" "}
                        <Link href="/creators" className="font-bold text-[#ffc53d]">{t("browse.inviteCreators")}</Link>
                      </p>
                    )}
                    {creators.map((c) => (
                  <div key={c.id} className="grid gap-2 rounded-2xl bg-white/10 border border-white/10 p-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ffc53d] text-[15px] font-black text-black">{(c.name || "?").charAt(0).toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold">{c.name}</p>
                        <p className="truncate text-[12px] text-white/80">{opt(c.category)} • {formatNumber(c.followers || 0)} {t("browse.followers")} • {opt(c.languages)}</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11.5px] font-bold text-[#ffc53d]">{t("listing.reviewed")}</span>
                      <ReportButton targetType="creator" targetId={c.id} targetName={c.name} className="mt-1 text-right" buttonClassName="text-white/85" />
                    </div>
                  </div>
                ))}
                    <ListingPagination
                      loaded={creators.length}
                      total={creatorPagination?.total ?? creators.length}
                      hasMore={Boolean(creatorPagination?.hasMore)}
                      loading={loadingMoreCreators}
                      onLoadMore={loadMoreCreators}
                      className="flex flex-col items-center gap-2 py-2"
                      textClassName="text-[12.5px] font-semibold text-white/70"
                      buttonClassName="rounded-xl bg-[#ffc53d] px-5 py-2.5 text-[13px] font-extrabold text-[#1c1917] hover:bg-[#ffb703] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </>
                )}
              </div>
            </div>
            <div className="rounded-[24px] border border-[#e9ddc3] bg-white p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff4de] px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#92400e]">
                {t("price.badge")}
              </span>
              <h4 className="font-display mt-3 text-[22px] font-black leading-tight">{t("price.title")}</h4>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#57534e]">
                {t("price.body")}
              </p>
              <ul className="mt-3 grid gap-1.5 text-[13.5px] font-semibold text-[#44403c]">
                <li>{t("price.p1")}</li>
                <li>{t("price.p2")}</li>
                <li>{t("price.p3")}</li>
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <ContactLink
                  kind="whatsapp"
                  href={whatsappWithText(t("price.quoteMessage"))}
                  value={SITE.phoneDisplay}
                  title={t("price.quoteWhatsAppTitle")}
                  className="rounded-xl bg-[#0f7a3f] py-3 text-center text-[14px] font-extrabold text-white hover:brightness-95"
                >
                  {t("price.wa")}
                </ContactLink>
                <ContactLink
                  kind="instagram"
                  href={instagramDmLink}
                  value={"@" + SITE.instagram}
                  title={t("price.quoteInstagramTitle")}
                  className="rounded-xl border border-[#1c1917] py-3 text-center text-[14px] font-extrabold hover:bg-[#1c1917] hover:text-white"
                >
                  {t("price.ig")}
                </ContactLink>
              </div>
              <p className="mt-3 text-[12.5px] text-[#6f6862]">{t("price.foot")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrandsPage() {
  const { t } = useLang();
  return (
    <Suspense fallback={<div className="p-10 text-center">{t("common.loading")}</div>}>
      <BrandInner />
    </Suspense>
  );
}
