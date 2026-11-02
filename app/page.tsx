"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/frontend/i18n";
import { ApiResponseError, fetchJsonList } from "@/frontend/api-json";
import { ListingError, ListingLoading } from "@/frontend/components/ListingState";
import { PROMOTION_TYPES } from "@/shared/constants";
import { SITE } from "@/config/site";
import DomainShare from "@/frontend/components/DomainShare";
import ReportButton from "@/frontend/components/ReportButton";
import Reveal from "@/frontend/components/Reveal";

type Campaign = {
  id: string;
  businessName: string;
  title: string;
  promotionType: string;
  location: string;
  language: string;
  format: string;
};

type Creator = {
  id: string;
  name: string;
  category: string;
  followers: number;
  location: string;
  languages: string;
  contentTypes: string;
  instagram: string;
};

export default function HomePage() {
  const { t, opt, promo, promoDetail, apiErrorKey, formatNumber, formatCompactNumber } = useLang();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsStatus, setCampaignsStatus] = useState<"loading" | "success" | "error">("loading");
  const [campaignsErrorKey, setCampaignsErrorKey] = useState("listing.loadFailed");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [creatorsStatus, setCreatorsStatus] = useState<"loading" | "success" | "error">("loading");
  const [creatorsErrorKey, setCreatorsErrorKey] = useState("listing.loadFailed");

  const requestCampaigns = useCallback(
    () => fetchJsonList<Campaign>("/api/campaigns?limit=3&sort=newest", "campaigns", { cache: "no-store" }),
    [],
  );
  const handleCampaignsSuccess = useCallback((rows: Campaign[]) => {
    setCampaigns(rows);
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
      handleCampaignsSuccess(await requestCampaigns());
    } catch (error) {
      handleCampaignsError(error);
    }
  }, [handleCampaignsError, handleCampaignsSuccess, requestCampaigns]);

  const loadCampaigns = useCallback(async () => {
    setCampaignsStatus("loading");
    await fetchCampaigns();
  }, [fetchCampaigns]);

  const requestCreators = useCallback(
    () => fetchJsonList<Creator>("/api/creators?limit=4&sort=newest", "creators", { cache: "no-store" }),
    [],
  );
  const handleCreatorsSuccess = useCallback((rows: Creator[]) => {
    setCreators(rows);
    setCreatorsStatus("success");
  }, []);
  const handleCreatorsError = useCallback((error: unknown) => {
    setCreatorsErrorKey(
      error instanceof ApiResponseError ? apiErrorKey(error.status, error.code, "listing.loadFailed") : "api.network",
    );
    setCreatorsStatus("error");
  }, [apiErrorKey]);

  const fetchCreators = useCallback(async () => {
    try {
      handleCreatorsSuccess(await requestCreators());
    } catch (error) {
      handleCreatorsError(error);
    }
  }, [handleCreatorsError, handleCreatorsSuccess, requestCreators]);

  const loadCreators = useCallback(async () => {
    setCreatorsStatus("loading");
    await fetchCreators();
  }, [fetchCreators]);

  useEffect(() => {
    let alive = true;
    requestCampaigns()
      .then((rows) => {
        if (alive) handleCampaignsSuccess(rows);
      })
      .catch((error: unknown) => {
        if (alive) handleCampaignsError(error);
      });
    requestCreators()
      .then((rows) => {
        if (alive) handleCreatorsSuccess(rows);
      })
      .catch((error: unknown) => {
        if (alive) handleCreatorsError(error);
      });
    return () => {
      alive = false;
    };
  }, [
    handleCampaignsError,
    handleCampaignsSuccess,
    handleCreatorsError,
    handleCreatorsSuccess,
    requestCampaigns,
    requestCreators,
  ]);

  return (
    <div>
      {/* Announcement */}
      <div className="bg-[#1c1917] px-4 py-2 text-center text-[12.5px] font-semibold text-[#fff4de]">
        {t("home.announcement")} <span className="font-extrabold text-[#ffc53d]">{SITE.domain}</span>
        <span className="hidden sm:inline"> {t("home.announcementSuffix")}</span>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="dotted-bg absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-10 sm:px-6 sm:pt-16">
          <div className="grid items-center gap-10 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <p className="hero-in inline-flex items-center gap-2 rounded-full border border-[#e9ddc3] bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-[#57534e]">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" /></span>
                {t("hero.badge")}
              </p>
              <h1 className="hero-in-2 font-display mt-5 text-[36px] font-black leading-[1.02] tracking-tight sm:text-[52px] lg:text-[64px]">
                {t("hero.titleA")}{" "}
                <span className="marker-underline">{t("hero.titleB")}</span>
              </h1>
              <p className="hero-in-3 mt-5 max-w-xl text-[17px] leading-relaxed text-[#57534e] sm:text-[19px]">{t("hero.sub")}</p>
              <div className="hero-in-3 mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/brands"
                  className="nudge rounded-2xl bg-[#c7431f] px-7 py-4 text-center text-[17px] font-extrabold text-white shadow-[0_10px_24px_-8px_rgba(199,67,31,0.6)] transition hover:-translate-y-0.5 hover:bg-[#a93618]"
                >
                  {t("hero.ctaBrand")} <span aria-hidden="true" className="arrow">→</span>
                </Link>
                <Link
                  href="/creators"
                  className="rounded-2xl border-2 border-[#1c1917] bg-white px-7 py-[14px] text-center text-[17px] font-extrabold text-[#1c1917] transition hover:-translate-y-0.5 hover:bg-[#1c1917] hover:text-white"
                >
                  {t("hero.ctaCreator")}
                </Link>
              </div>
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#e9ddc3] bg-white/80 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#17452e] text-white">✓</span>
                <div>
                  <p className="text-[14.5px] font-bold leading-snug">{t("hero.trust")}</p>
                  <p className="mt-1 text-[13.5px] text-[#6f6862]">{t("hero.from")}</p>
                </div>
              </div>
            </div>

            {/* Hero visual */}
            <div className="relative">
              <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-5 card-shadow">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold uppercase tracking-widest text-[#6f6862]">{t("home.briefTitle")}</p>
                  <span className="rounded-full bg-[#fff4de] border border-[#e9ddc3] px-2.5 py-1 text-[12px] font-bold text-[#92400e]">{t("home.example")}</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    {
                      shop: t("home.brief1Shop"),
                      what: t("home.brief1What").replace("{count}", formatNumber(4)).replace("{format}", opt("Story")),
                      tag: opt("Story"),
                      lang: opt("Punjabi"),
                    },
                    { shop: t("home.brief2Shop"), what: t("home.brief2What"), tag: t("home.brief2Tag"), lang: opt("Hindi") },
                    {
                      shop: t("home.brief3Shop"),
                      what: t("home.brief3What").replace("{count}", formatNumber(6)),
                      tag: t("home.brief3Tag"),
                      lang: opt("English"),
                    },
                  ].map((c) => (
                    <div key={c.shop} className="flex items-center gap-3 rounded-2xl border border-[#f0e6cc] bg-[#fffbf1] p-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ffc53d] text-[20px] font-black">★</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-extrabold">{c.shop}</p>
                        <p className="truncate text-[13px] text-[#6f6862]">{c.what}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13.5px] font-extrabold">{c.tag}</p>
                        <p className="text-[11.5px] font-bold text-[#6f6862]">{c.lang}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/campaigns" className="mt-4 block rounded-xl bg-[#1c1917] py-3 text-center text-[14.5px] font-bold text-white hover:bg-black">
                  {t("home.browseOpenCampaigns")}
                </Link>
              </div>
              <div className="absolute -bottom-4 left-3 max-w-[calc(100%-1.5rem)] float-b rounded-2xl border border-[#e9ddc3] bg-[#17452e] px-4 py-2.5 text-white shadow-lg">
                <p className="text-[13px] font-extrabold">{[opt("Story"), opt("Reel"), opt("Post"), "UGC"].join(" • ")}</p>
              </div>
              <div className="absolute -top-4 right-3 max-w-[calc(100%-1.5rem)] float-a rounded-2xl border border-[#e9ddc3] bg-[#ffc53d] px-4 py-2 text-[13px] font-extrabold text-[#1c1917] shadow-lg">
                {t("home.noJargon")}
              </div>
            </div>
          </div>

          {/* mini stats */}
          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {[
              { a: t("hero.statsPages"), b: t("hero.statsPagesSub") },
              { a: t("hero.statsLang"), b: t("hero.statsLangSub") },
              { a: t("hero.statsSimple"), b: t("hero.statsSimpleSub") },
            ].map((s) => (
              <div key={s.a} className="rounded-2xl border border-[#e9ddc3] bg-white px-5 py-4">
                <p className="text-[16px] font-extrabold">{s.a}</p>
                <p className="text-[13.5px] text-[#6f6862]">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STRIP */}
      <section className="border-y border-[#e9ddc3] bg-[#fff4de]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
          <span className="shrink-0 text-[13px] font-bold uppercase tracking-widest text-[#6f6862]">{t("home.madeFor")}</span>
          <div className="marquee min-w-0 flex-1 overflow-hidden">
            <div className="marquee-track gap-2">
              {[0, 1].map((copy) =>
                [
                  t("home.audienceKirana"),
                  t("home.audienceCafes"),
                  t("home.audienceSalons"),
                  t("home.audienceD2C"),
                  t("home.audienceApps"),
                  t("home.audienceCoaching"),
                  t("home.audienceEvents"),
                  t("home.audienceYouTubers"),
                  t("home.audienceMemes"),
                  t("home.audienceUGC"),
                ].map((x) => (
                  <span
                    key={`${copy}-${x}`}
                    aria-hidden={copy === 1}
                    className={`mr-2 shrink-0 rounded-full border border-[#e9ddc3] bg-white px-4 py-2 text-[13.5px] font-bold ${copy === 1 ? "motion-reduce:hidden" : ""}`}
                  >
                    {x}
                  </span>
                )),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* WHAT CAN YOU PROMOTE */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-[13px] font-bold uppercase tracking-widest text-[#c7431f]">{t("home.startHere")}</p>
          <h2 className="font-display mt-2 text-[32px] font-black leading-tight sm:text-[44px]">{t("promo.title")}</h2>
          <p className="mt-2 text-[16.5px] text-[#57534e]">{t("promo.sub")}</p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROMOTION_TYPES.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 90}>
            <Link href={`/brands?type=${encodeURIComponent(p.id)}`} className="lift group block h-full rounded-3xl border border-[#e9ddc3] bg-white p-6 card-shadow hover:border-[#1c1917]">
              <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff4de] text-[26px] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">{p.emoji}</span>
              <h3 className="mt-4 text-[19px] font-extrabold">{promo(p.id)}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#57534e]">{promoDetail(p.id).desc}</p>
              <p className="mt-3 inline-block rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-3 py-1 text-[12.5px] font-bold text-[#6f6862]">{promoDetail(p.id).example}</p>
              <p className="nudge mt-3 text-[14px] font-bold text-[#c7431f]">{t("promo.start")} <span aria-hidden="true" className="arrow">→</span></p>
            </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-[#17452e] py-16 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-widest text-[#ffc53d]">{t("home.simpleReally")}</p>
              <h2 className="font-display mt-2 text-[32px] font-black sm:text-[44px]">{t("how.title")}</h2>
              <p className="mt-2 text-[16px] text-white/70">{t("how.sub")}</p>
            </div>
            <Link href="/how-it-works" className="w-fit rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-[#17452e] hover:bg-[#ffc53d] hover:text-black">
              {t("home.seeDetails")}
            </Link>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              { n: 1, title: t("how.1t"), desc: t("how.1d") },
              { n: 2, title: t("how.2t"), desc: t("how.2d") },
              { n: 3, title: t("how.3t"), desc: t("how.3d") },
              { n: 4, title: t("how.4t"), desc: t("how.4d") },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 110} className="h-full"><div className="h-full rounded-3xl bg-white/[0.07] border border-white/15 p-6">
                <p className="font-display text-[40px] font-black text-[#ffc53d]">{formatNumber(s.n, { minimumIntegerDigits: 2, useGrouping: false })}</p>
                <h3 className="mt-2 text-[18px] font-extrabold">{s.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/70">{s.desc}</p>
              </div></Reveal>
            ))}
          </div>
          <p className="mt-6 text-center font-display text-[22px] italic text-[#ffc53d]">{t("home.simple")}</p>
        </div>
      </section>

      {/* EXPERIENCE */}
      <Reveal><section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 overflow-hidden rounded-[28px] border border-[#e9ddc3] bg-white p-7 sm:p-12 lg:grid-cols-2 card-shadow">
          <div>
            <p className="inline-block rounded-full bg-[#fff4de] border border-[#e9ddc3] px-3 py-1 text-[12.5px] font-bold uppercase tracking-widest text-[#92400e]">{t("exp.badge")}</p>
            <h2 className="font-display mt-4 text-[30px] font-black leading-tight sm:text-[40px]">{t("exp.title")}</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[#57534e]">{t("exp.desc")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[t("home.regionNorth"), t("home.regionSouth"), t("home.regionEast"), t("home.regionWest"), t("home.regionNortheast"), t("home.regionInternational")].map((r) => (
                <span key={r} className="rounded-full border border-[#e9ddc3] bg-[#fffbf1] px-3 py-1.5 text-[13px] font-bold">
                  {r}
                </span>
              ))}
            </div>
            <div className="mt-6 grid gap-2.5">
              {[t("home.reach1"), t("home.reach2"), t("home.reach3")].map((x) => (
                <p key={x} className="flex items-start gap-2.5 text-[15px] font-semibold">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-100 text-green-800 text-[13px]">✓</span>
                  {x}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-[#fffbf1] border border-[#f0e6cc] p-6">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6f6862]">{t("exp.nofake")}</p>
            <div className="mt-3 grid gap-2.5">
              {[t("home.noFake1").replace("{count}", formatNumber(10000)), t("home.noFake2"), t("home.noFake3")].map((x) => (
                <p key={x} className="rounded-xl bg-white border border-[#f0e6cc] px-4 py-3 text-[14.5px] font-bold text-[#6f6862] line-through decoration-[#c7431f]/60">
                  {x}
                </p>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#1c1917] p-5 text-white">
              <p className="text-[14.5px] font-bold leading-relaxed">{t("home.teamQuote")}</p>
              <p className="mt-2 text-[13px] text-white/60">{t("home.teamAttribution")}</p>
            </div>
          </div>
        </div>
      </section></Reveal>

      {/* SPLIT */}
      <Reveal><section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] bg-[#ffc53d] p-8 sm:p-10">
            <p className="text-[13px] font-bold uppercase tracking-widest">{t("foot.brands")}</p>
            <h3 className="font-display mt-2 text-[28px] font-black leading-tight">{t("home.brandSplitTitle")}</h3>
            <ul className="mt-4 grid gap-2 text-[15px] font-semibold">
              <li>{t("home.brandPoint1").replace("{count}", formatNumber(3))}</li>
              <li>{t("home.brandPoint2")}</li>
              <li>{t("home.brandPoint3")}</li>
            </ul>
            <Link href="/brands" className="mt-6 inline-block rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15.5px] font-bold text-white hover:bg-black">
              {t("dash.create")}
            </Link>
          </div>
          <div className="rounded-[28px] bg-[#1c1917] p-8 text-white sm:p-10">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#ffc53d]">{t("foot.creators")}</p>
            <h3 className="font-display mt-2 text-[28px] font-black leading-tight">{t("cr.title")}</h3>
            <ul className="mt-4 grid gap-2 text-[15px] font-semibold text-white/85">
              <li>{t("home.creatorPoint1")}</li>
              <li>{t("home.creatorPoint2")}</li>
              <li>{t("home.creatorPoint3")}</li>
            </ul>
            <Link href="/creators" className="mt-6 inline-block rounded-2xl bg-[#c7431f] px-6 py-3.5 text-[15.5px] font-bold text-white hover:bg-[#a93618]">
              {t("home.joinNetwork")}
            </Link>
          </div>
        </div>
      </section></Reveal>

      {/* LIVE PREVIEWS */}
      <Reveal><section className="border-t border-[#e9ddc3] bg-[#fffdf6]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-[28px] font-black sm:text-[36px]">{t("home.freshTitle")}</h2>
              <p className="text-[15px] text-[#6f6862]">{t("home.freshSub")}</p>
            </div>
            <Link href="/campaigns" className="hidden rounded-full border border-[#1c1917] px-5 py-2.5 text-[14px] font-bold hover:bg-[#1c1917] hover:text-white sm:block">
              {t("home.viewAll")}
            </Link>
          </div>
          <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <p className="mb-3 text-[12.5px] font-bold uppercase tracking-widest text-[#6f6862]">{t("home.openCampaigns")}</p>
              <div className="grid gap-3">
                {campaignsStatus === "loading" && campaigns.length === 0 ? (
                  <ListingLoading
                    count={3}
                    labelKey="listing.loadingCampaigns"
                    itemClassName="h-[74px] animate-pulse rounded-2xl bg-[#f0e6cc]/70"
                  />
                ) : campaignsStatus === "error" && campaigns.length === 0 ? (
                  <ListingError errorKey={campaignsErrorKey} onRetry={() => void loadCampaigns()} />
                ) : (
                  <>
                    {campaignsStatus === "error" && (
                      <ListingError errorKey={campaignsErrorKey} onRetry={() => void loadCampaigns()} />
                    )}
                    {campaigns.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14.5px] text-[#6f6862]">
                        {t("home.noCampaigns")} <Link href="/brands" className="font-bold text-[#c7431f]">{t("home.create")}</Link>
                      </div>
                    )}
                    {campaigns.map((c) => (
                  <Link key={c.id} href={`/campaigns?apply=${encodeURIComponent(c.id)}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e9ddc3] bg-white p-4 hover:border-[#1c1917]">
                    <div>
                      <p className="text-[15px] font-extrabold">{c.title}</p>
                      <p className="text-[13px] text-[#6f6862]">{c.businessName} • {c.location} • {opt(c.language)} • {opt(c.format)} • {t("listing.reviewed")}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#17452e] px-3 py-1.5 text-[13px] font-bold text-white">{promo(c.promotionType)}</span>
                  </Link>
                ))}
                  </>
                )}
              </div>
            </div>
            <div>
              <p className="mb-3 text-[12.5px] font-bold uppercase tracking-widest text-[#6f6862]">{t("home.newCreators")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {creatorsStatus === "loading" && creators.length === 0 ? (
                  <ListingLoading
                    count={4}
                    labelKey="listing.loadingCreators"
                    className="contents"
                    itemClassName="h-[118px] animate-pulse rounded-2xl bg-[#f0e6cc]/70"
                  />
                ) : creatorsStatus === "error" && creators.length === 0 ? (
                  <div className="sm:col-span-2">
                    <ListingError errorKey={creatorsErrorKey} onRetry={() => void loadCreators()} />
                  </div>
                ) : (
                  <>
                    {creatorsStatus === "error" && (
                      <div className="sm:col-span-2">
                        <ListingError errorKey={creatorsErrorKey} onRetry={() => void loadCreators()} />
                      </div>
                    )}
                    {creators.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14.5px] text-[#6f6862] sm:col-span-2">
                        {t("home.noCreators")} <Link href="/creators" className="font-bold text-[#c7431f]">{t("home.joinCreators")}</Link>
                      </div>
                    )}
                    {creators.map((cr) => (
                  <div key={cr.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1c1917] text-[15px] font-black text-[#ffc53d]">
                        {cr.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-[14.5px] font-extrabold leading-tight">{cr.name}</p>
                        <p className="text-[12px] text-[#6f6862]">{opt(cr.category)} • {cr.followers ? `${formatCompactNumber(cr.followers)} ${t("browse.followers")}` : "—"}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[12.5px] font-semibold text-[#57534e]">{cr.location} • {opt(cr.languages)}</p>
                    <div className="mt-2">
                      <span className="text-[11.5px] font-bold text-green-800">{t("listing.reviewed")}</span>
                      <ReportButton targetType="creator" targetId={cr.id} targetName={cr.name} className="mt-1 text-right" />
                    </div>
                  </div>
                ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section></Reveal>

      {/* DOMAIN */}
      <Reveal><section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <DomainShare />
      </section></Reveal>

      {/* LANGUAGE */}
      <Reveal><section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 text-center sm:p-12 card-shadow">
          <h2 className="font-display text-[28px] font-black sm:text-[38px]">{t("home.languageTitle")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-[15.5px] text-[#57534e]">
            {t("home.languageSub").replace("{current}", opt("English, Hindi, Punjabi")).replace("{more}", opt("Bengali, Marathi, Tamil"))}
          </p>
          <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              { f: "🇬🇧", l: "English", d: t("home.languageEnglishDesc") },
              { f: "🇮🇳", l: "Hindi", d: t("home.languageHindiDesc") },
              { f: "🟠", l: "Punjabi", d: t("home.languagePunjabiDesc") },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl border border-[#f0e6cc] bg-[#fffbf1] p-5">
                <p className="text-[28px]">{x.f}</p>
                <p className="mt-1 text-[18px] font-extrabold">{opt(x.l)}</p>
                <p className="text-[13px] text-[#6f6862]">{x.d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] bg-[#c7431f] p-8 text-center text-white sm:p-12">
          <h2 className="font-display text-[30px] font-black sm:text-[42px]">{t("cta.title")}</h2>
          <p className="mt-2 text-[16px] text-white">{t("cta.sub")}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/brands" className="rounded-2xl bg-white px-7 py-3.5 text-[16px] font-extrabold text-[#1c1917] hover:bg-[#ffc53d]">{t("hero.ctaBrand")}</Link>
            <Link href="/creators" className="rounded-2xl border-2 border-white px-7 py-3 text-[16px] font-extrabold text-white hover:bg-white hover:text-[#1c1917]">{t("hero.ctaCreator")}</Link>
          </div>
        </div>
      </section></Reveal>
    </div>
  );
}
