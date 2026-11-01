"use client";

import { useLang } from "@/frontend/i18n";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiResponseError, fetchJsonList } from "@/frontend/api-json";
import { ListingError, ListingLoading } from "@/frontend/components/ListingState";
import { CATEGORIES, LANGUAGES, CONTENT_TYPES, PLATFORMS } from "@/shared/constants";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";
import ReportButton from "@/frontend/components/ReportButton";

export default function CreatorsPage() {
  const { t, opt, platform: platformLabel, apiErrorKey, formatNumber } = useLang();
  const [step, setStep] = useState(1);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignsStatus, setCampaignsStatus] = useState<"loading" | "success" | "error">("loading");
  const [campaignsErrorKey, setCampaignsErrorKey] = useState("listing.loadFailed");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    platform: "Instagram",
    instagram: "",
    youtube: "",
    profileUrl: "",
    followers: "",
    category: "Memes & Comedy",
    languages: [] as string[],
    location: "",
    contentTypes: [] as string[],
    bio: "",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [errKey, setErrKey] = useState("");

  const requestCampaigns = useCallback(
    () => fetchJsonList<any>("/api/campaigns?limit=6&sort=newest", "campaigns", { cache: "no-store" }),
    [],
  );
  const handleCampaignsSuccess = useCallback((rows: any[]) => {
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

  useEffect(() => {
    let alive = true;
    requestCampaigns()
      .then((rows) => {
        if (alive) handleCampaignsSuccess(rows);
      })
      .catch((error: unknown) => {
        if (alive) handleCampaignsError(error);
      });
    return () => {
      alive = false;
    };
  }, [handleCampaignsError, handleCampaignsSuccess, requestCampaigns]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "languages" | "contentTypes", v: string) => {
    setForm((f) => {
      const arr = f[k] as string[];
      return { ...f, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  };

  const canNext1 = form.name.trim().length >= 2 && (form.phone.trim() || form.email.trim());
  const canNext2 = form.profileUrl.trim() || form.instagram.trim() || form.youtube.trim();

  const submit = async () => {
    setErrKey("");
    if (!form.category || form.languages.length === 0) {
      setErrKey("cr.err");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, followers: form.followers || 0 }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrKey(apiErrorKey(res.status, d?.code));
        return;
      }
      setVerificationCode(d.creator?.verificationCode ?? "");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErrKey("api.network");
    } finally {
      setSaving(false);
    }
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
            <Link href="/dashboard" className="rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15px] font-bold text-white">{t("cr.dashboard")}</Link>
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
          <div className="rounded-[24px] border border-[#e9ddc3] bg-white p-6 sm:p-8 card-shadow">
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

            {step === 1 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#6f6862]">{t("cr.s1")}</p>
                <label className="grid gap-1.5" htmlFor="creator-name">
                  <span className="text-[13.5px] font-bold">{t("cr.name")}</span>
                  <input id="creator-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("cr.phName")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="creator-phone">
                    <span className="text-[13.5px] font-bold">{t("cr.phone")}</span>
                    <input id="creator-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98XXX XXXXX" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5" htmlFor="creator-email">
                    <span className="text-[13.5px] font-bold">{t("cr.email")}</span>
                    <input id="creator-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("cr.phEmail")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="creator-location">
                    <span className="text-[13.5px] font-bold">{t("cr.city")}</span>
                    <input id="creator-location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={t("cr.phCity")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5" htmlFor="creator-platform">
                    <span className="text-[13.5px] font-bold">{t("cr.platform")}</span>
                    <select id="creator-platform" value={form.platform} onChange={(e) => set("platform", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3">
                      {PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
                    </select>
                  </label>
                </div>
                <button disabled={!canNext1} onClick={() => setStep(2)} className="mt-2 rounded-2xl bg-[#1c1917] py-3.5 text-[15.5px] font-bold text-white disabled:opacity-40">{t("cr.continue")}</button>
                {!canNext1 && <p className="text-[13px] text-[#6f6862]">{t("cr.needContact")}</p>}
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#6f6862]">{t("cr.s2")}</p>
                <label className="grid gap-1.5" htmlFor="creator-profile-url">
                  <span className="text-[13.5px] font-bold">{t("cr.profileLink")}</span>
                  <input id="creator-profile-url" value={form.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder={t("cr.phProfile")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="creator-instagram">
                    <span className="text-[13.5px] font-bold">{t("cr.instagram")}</span>
                    <input id="creator-instagram" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder={t("cr.phIg")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5" htmlFor="creator-youtube">
                    <span className="text-[13.5px] font-bold">{t("cr.youtube")}</span>
                    <input id="creator-youtube" value={form.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder={t("cr.phYt")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5" htmlFor="creator-followers">
                    <span className="text-[13.5px] font-bold">{t("cr.followers")}</span>
                    <input id="creator-followers" value={form.followers} onChange={(e) => set("followers", e.target.value)} placeholder={t("cr.phFollowers")} inputMode="numeric" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5" htmlFor="creator-category">
                    <span className="text-[13.5px] font-bold">{t("cr.category")}</span>
                    <select id="creator-category" value={form.category} onChange={(e) => set("category", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="flex-1 rounded-2xl border border-[#e9ddc3] py-3.5 text-[15px] font-bold">{t("cr.back")}</button>
                  <button disabled={!canNext2} onClick={() => setStep(3)} className="flex-[2] rounded-2xl bg-[#1c1917] py-3.5 text-[15px] font-bold text-white disabled:opacity-40">{t("cr.continue")}</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#6f6862]">{t("cr.s3")}</p>
                <div>
                  <p id="creator-languages-label" className="text-[13.5px] font-bold">{t("cr.langs")}</p>
                  <div role="group" aria-labelledby="creator-languages-label" className="mt-2 flex flex-wrap gap-2">
                    {LANGUAGES.map((l) => (
                      <button key={l} type="button" onClick={() => toggle("languages", l)} aria-pressed={form.languages.includes(l)}
                        className={`rounded-full border px-4 py-2 text-[13.5px] font-bold ${form.languages.includes(l) ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-[#fffbf1]"}`}>
                        {opt(l)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p id="creator-content-types-label" className="text-[13.5px] font-bold">{t("cr.content")}</p>
                  <div role="group" aria-labelledby="creator-content-types-label" className="mt-2 flex flex-wrap gap-2">
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
                  <textarea id="creator-bio" value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder={t("cr.phBio")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <PrivacyNotice textKey="privacy.creatorNotice" />
                {errKey && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[14px] font-bold text-red-700">{t(errKey)}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="flex-1 rounded-2xl border border-[#e9ddc3] py-3.5 text-[15px] font-bold">{t("cr.back")}</button>
                  <button onClick={submit} disabled={saving} className="flex-[2] rounded-2xl bg-[#c7431f] py-3.5 text-[15.5px] font-extrabold text-white hover:bg-[#a93618] disabled:opacity-60">
                    {saving ? t("cr.submitting") : t("cr.submit")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AVAILABLE CAMPAIGNS */}
          <div className="grid content-start gap-4">
            <div className="rounded-[24px] bg-[#ffc53d] p-6">
              <h3 className="font-display text-[22px] font-black">{t("cr.avail")}</h3>
              <p className="text-[14px] font-semibold text-[#57534e]">{t("cr.availSub")}</p>
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
                    <p className="text-[15px] font-extrabold leading-snug">{c.title}</p>
                    <p className="mt-1 text-[13px] text-[#6f6862]">{c.businessName} • {c.location} • {opt(c.language)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded-full bg-[#17452e] px-3 py-1 text-[12.5px] font-bold text-white">{t("cr.paid")} • {opt(c.format)}</span>
                      <Link href="/campaigns" className="text-[13.5px] font-bold text-[#c7431f]">{t("cr.view")}</Link>
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
