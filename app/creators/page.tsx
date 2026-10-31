"use client";

import { useLang } from "@/frontend/i18n";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CATEGORIES, LANGUAGES, CONTENT_TYPES, PLATFORMS } from "@/shared/constants";
import ReportButton from "@/frontend/components/ReportButton";

export default function CreatorsPage() {
  const { t, opt, platform: platformLabel } = useLang();
  const [step, setStep] = useState(1);
  const [campaigns, setCampaigns] = useState<any[]>([]);
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
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.json()).then((d) => setCampaigns(d.campaigns?.slice(0, 6) ?? [])).catch(() => {});
  }, []);

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
    setErr("");
    if (!form.category || form.languages.length === 0) {
      setErr(t("cr.err"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, followers: form.followers || 0 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setVerificationCode(d.creator?.verificationCode ?? "");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErr(e.message);
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
              <p className="mt-1 text-[12.5px] font-semibold text-[#78716c]">{t("verify.dashboardNote")}</p>
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
              <span className="text-[13px] font-bold text-[#a8a29e]">{t("cr.step")} {step} {t("cr.of")}</span>
            </div>
            {/* progress */}
            <div className="mt-3 flex gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`h-2 flex-1 rounded-full ${s <= step ? "bg-[#e4572e]" : "bg-[#f0e6cc]"}`} />
              ))}
            </div>

            {step === 1 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#78716c]">{t("cr.s1")}</p>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("cr.name")}</span>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("cr.phName")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.phone")}</span>
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98XXX XXXXX" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.email")}</span>
                    <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("cr.phEmail")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.city")}</span>
                    <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Ludhiana" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.platform")}</span>
                    <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3">
                      {PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
                    </select>
                  </label>
                </div>
                <button disabled={!canNext1} onClick={() => setStep(2)} className="mt-2 rounded-2xl bg-[#1c1917] py-3.5 text-[15.5px] font-bold text-white disabled:opacity-40">{t("cr.continue")}</button>
                {!canNext1 && <p className="text-[13px] text-[#a8a29e]">{t("cr.needContact")}</p>}
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 grid gap-4">
                <p className="text-[14px] font-bold text-[#78716c]">{t("cr.s2")}</p>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("cr.profileLink")}</span>
                  <input value={form.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder={t("cr.phProfile")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.instagram")}</span>
                    <input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder={t("cr.phIg")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.youtube")}</span>
                    <input value={form.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder={t("cr.phYt")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.followers")}</span>
                    <input value={form.followers} onChange={(e) => set("followers", e.target.value)} placeholder={t("cr.phFollowers")} inputMode="numeric" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[13.5px] font-bold">{t("cr.category")}</span>
                    <select value={form.category} onChange={(e) => set("category", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3">
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
                <p className="text-[14px] font-bold text-[#78716c]">{t("cr.s3")}</p>
                <div>
                  <p className="text-[13.5px] font-bold">{t("cr.langs")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {LANGUAGES.map((l) => (
                      <button key={l} type="button" onClick={() => toggle("languages", l)}
                        className={`rounded-full border px-4 py-2 text-[13.5px] font-bold ${form.languages.includes(l) ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-[#fffbf1]"}`}>
                        {opt(l)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[13.5px] font-bold">{t("cr.content")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CONTENT_TYPES.map((c) => (
                      <button key={c} type="button" onClick={() => toggle("contentTypes", c)}
                        className={`rounded-full border px-4 py-2 text-[13.5px] font-bold ${form.contentTypes.includes(c) ? "border-[#e4572e] bg-[#e4572e] text-white" : "border-[#e9ddc3] bg-[#fffbf1]"}`}>
                        {opt(c)}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("cr.bio")} <span className="font-medium text-[#a8a29e]">{t("cr.optional")}</span></span>
                  <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder={t("cr.phBio")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[14px] font-bold text-red-700">{err}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="flex-1 rounded-2xl border border-[#e9ddc3] py-3.5 text-[15px] font-bold">{t("cr.back")}</button>
                  <button onClick={submit} disabled={saving} className="flex-[2] rounded-2xl bg-[#e4572e] py-3.5 text-[15.5px] font-extrabold text-white hover:bg-[#c7431f] disabled:opacity-60">
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
                {campaigns.length === 0 && <p className="rounded-2xl bg-white/70 p-4 text-[14px] font-semibold">{t("cr.availEmpty")}</p>}
                {campaigns.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-black/10 bg-white p-4">
                    <p className="text-[15px] font-extrabold leading-snug">{c.title}</p>
                    <p className="mt-1 text-[13px] text-[#78716c]">{c.businessName} • {c.location} • {opt(c.language)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded-full bg-[#17452e] px-3 py-1 text-[12.5px] font-bold text-white">💰 Paid • {opt(c.format)}</span>
                      <Link href="/campaigns" className="text-[13.5px] font-bold text-[#e4572e]">View →</Link>
                    </div>
                    <div className="mt-2">
                      <span className="text-[11.5px] font-bold text-green-800">{t("listing.reviewed")}</span>
                      <ReportButton targetType="campaign" targetId={c.id} targetName={c.title} className="mt-1 text-right" />
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/campaigns" className="mt-4 block rounded-2xl bg-[#1c1917] py-3 text-center text-[14.5px] font-bold text-white">See all →</Link>
            </div>
            <div className="rounded-[24px] border border-[#e9ddc3] bg-white p-6">
              <h4 className="text-[16px] font-extrabold">Why creators join us</h4>
              <ul className="mt-2 grid gap-2 text-[14px] text-[#57534e]">
                <li>🤝 <b>Direct deals</b> — no spammy middlemen</li>
                <li>💸 <b>Fair pay</b> — we tell brands real rates</li>
                <li>🗣️ <b>Your language</b> — Punjabi & Hindi deals, not just English</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
