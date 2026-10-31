"use client";

import { useLang } from "@/frontend/i18n";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LANGUAGES } from "@/shared/constants";

export default function CampaignsPage() {
  const { t, opt, promo } = useLang();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("");
  const [applyId, setApplyId] = useState<string | null>(null);
  const [applyForm, setApplyForm] = useState({ name: "", contact: "", message: "" });
  const [applyError, setApplyError] = useState<"" | "name" | "login" | "creator" | "duplicate" | "closed" | "rate" | "generic">("");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/campaigns").then((r) => r.json()).then((d) => { setCampaigns(d.campaigns ?? []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = campaigns.filter((c) => {
    if (lang && (c.language || "") !== lang) return false;
    if (q && !(`${c.title} ${c.businessName} ${c.location} ${promo(c.promotionType)}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const apply = async (campaignId: string) => {
    const creatorName = applyForm.name.trim();
    if (!creatorName) { setApplyError("name"); return; }

    setApplyError("");
    setApplyingId(campaignId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, creatorName, creatorContact: applyForm.contact.trim(), message: applyForm.message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = String(data?.error || "");
        if (res.status === 401) setApplyError("login");
        else if (res.status === 403) setApplyError("creator");
        else if (res.status === 429) setApplyError("rate");
        else if (message.includes("already applied")) setApplyError("duplicate");
        else if (message.includes("no longer")) setApplyError("closed");
        else if (message.includes("name / page name")) setApplyError("name");
        else setApplyError("generic");
        return;
      }

      setDone(true);
      setApplyId(null);
      setApplyForm({ name: "", contact: "", message: "" });
      setTimeout(() => setDone(false), 4000);
    } catch {
      setApplyError("generic");
    } finally {
      setApplyingId(null);
    }
  };

  const applyErrorKey = applyError === "name"
    ? "camp.applyErr"
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
              : "camp.applyGenericErr";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">{t("camp.eyebrow")}</p>
          <h1 className="font-display text-[34px] font-black sm:text-[48px]">{t("camp.title")}</h1>
          <p className="text-[15.5px] text-[#57534e]">{t("camp.sub")}</p>
        </div>
        <Link href="/brands" className="w-fit rounded-2xl bg-[#e4572e] px-6 py-3 text-[15px] font-bold text-white hover:bg-[#c7431f]">{t("camp.post")}</Link>
      </div>

      <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-[#e9ddc3] bg-white p-3 sm:flex-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("camp.search")} className="min-w-0 flex-1 rounded-xl bg-[#fffbf1] border border-[#f0e6cc] px-4 py-3 outline-none" />
        <label className="relative block sm:w-48">
          <span className="sr-only">{t("browse.filterLang")}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="w-full min-w-0 appearance-none truncate rounded-xl border border-[#f0e6cc] bg-[#fffbf1] py-3 pl-4 pr-9 text-[15px] font-semibold text-[#1c1917] outline-none focus:border-[#1c1917]">
            <option value="">{t("browse.allLang")}</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{opt(l)}</option>)}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#78716c]">▼</span>
        </label>
        <button onClick={load} className="rounded-xl bg-[#1c1917] px-5 py-3 text-[14px] font-bold text-white">{t("camp.refresh")}</button>
      </div>

      {done && <p className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-5 py-3.5 text-[14.5px] font-bold text-green-800">{t("camp.applied")}</p>}

      {loading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-3xl bg-[#f0e6cc]/60" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-[#e9ddc3] bg-white p-12 text-center">
          <p className="text-[40px]">📭</p>
          <h3 className="font-display mt-2 text-[24px] font-black">{t("camp.emptyTitle")}</h3>
          <p className="mt-1 text-[15px] text-[#78716c]">{t("camp.emptyBody")}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/brands" className="rounded-2xl bg-[#e4572e] px-6 py-3 text-[14.5px] font-bold text-white">{t("camp.emptyPost")}</Link>
            <Link href="/creators" className="rounded-2xl border border-[#1c1917] px-6 py-3 text-[14.5px] font-bold">{t("camp.emptyJoin")}</Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="lift flex flex-col rounded-3xl border border-[#e9ddc3] bg-white p-6 card-shadow">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#fff4de] border border-[#e9ddc3] px-3 py-1 text-[12px] font-bold">{promo(c.promotionType)}</span>
                <span className="rounded-full bg-green-50 border border-green-200 px-3 py-1 text-[12px] font-bold text-green-800">{t("camp.open")}</span>
              </div>
              <h3 className="mt-3 text-[18px] font-extrabold leading-snug">{c.title}</h3>
              <p className="mt-1 text-[13.5px] font-semibold text-[#78716c]">{c.businessName} • {c.location}</p>
              <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-[#57534e]">{c.description || t("camp.noDesc")}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] font-bold">
                <span className="rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-2.5 py-1">{opt(c.language)}</span>
                <span className="rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-2.5 py-1">{opt(c.format)}</span>
                {c.category && <span className="rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-2.5 py-1">{opt(c.category)}</span>}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#f5edd8] pt-4">
                <p className="text-[13.5px] font-bold text-[#17452e]">{t("camp.paid")}</p>
                <button onClick={() => { setApplyError(""); setApplyId(applyId === c.id ? null : c.id); }} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white hover:bg-black">
                  {applyId === c.id ? t("camp.close") : t("camp.apply")}
                </button>
              </div>
              {applyId === c.id && (
                <div className="mt-3 grid gap-2 rounded-2xl bg-[#fffbf1] border border-[#f0e6cc] p-4">
                  <input value={applyForm.name} onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })} placeholder={t("camp.applyName")} className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none" />
                  <input value={applyForm.contact} onChange={(e) => setApplyForm({ ...applyForm, contact: e.target.value })} placeholder={t("camp.applyContact")} className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none" />
                  <textarea value={applyForm.message} onChange={(e) => setApplyForm({ ...applyForm, message: e.target.value })} rows={2} placeholder={t("camp.applyPhMsg")} className="rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-2.5 text-[14px] outline-none" />
                  {applyError && (
                    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13.5px] font-semibold leading-relaxed text-red-800">
                      <p>{t(applyErrorKey)}</p>
                      {(applyError === "login" || applyError === "creator") && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link href="/login" className="rounded-lg bg-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-white">{t("nav.login")}</Link>
                          <Link href="/signup" className="rounded-lg border border-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-[#1c1917]">{t("camp.emptyJoin")}</Link>
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => apply(c.id)} disabled={applyingId === c.id} className="rounded-xl bg-[#e4572e] py-2.5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{applyingId === c.id ? t("camp.applySending") : t("camp.applySend")}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
