"use client";

import { useLang } from "@/frontend/i18n";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CATEGORIES, LANGUAGES, CONTENT_TYPES, PROMOTION_TYPES, normalizePromotionType } from "@/shared/constants";
import ContactLink from "@/frontend/components/ContactLink";
import { SITE, instagramDmLink, whatsappWithText } from "@/config/site";


function BrandInner() {
  const params = useSearchParams();
  const { t, opt, promo } = useLang();
  const preset = normalizePromotionType(params.get("type")) ?? "";
  const [creators, setCreators] = useState<any[]>([]);
  const [filter, setFilter] = useState({ lang: "", category: "" });
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (preset) setForm((f) => ({ ...f, promotionType: preset }));
  }, [preset]);

  useEffect(() => {
    fetch("/api/creators").then((r) => r.json()).then((d) => setCreators(d.creators ?? [])).catch(() => {});
  }, []);

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
    setErr("");
    if (!form.businessName || !form.title) {
      setErr(t("brand.errMissing"));
      return;
    }
    if (budgetNum < 500) {
      setErr(t("brand.errBudget"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, budget: budgetNum }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = creators.filter((c) => {
    if (filter.lang && !(c.languages || "").toLowerCase().includes(filter.lang.toLowerCase())) return false;
    if (filter.category && c.category !== filter.category) return false;
    return true;
  });

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-10 card-shadow">
          <p className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-[28px]">✓</p>
          <h1 className="font-display mt-5 text-[32px] font-black">{t("brand.doneTitle")}</h1>
          <p className="mt-2 text-[15.5px] text-[#57534e]">
            {t("brand.doneBody2")} <b>“{form.title}”</b> {t("brand.doneBody")}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/campaigns" className="rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15px] font-bold text-white">{t("brand.viewAll")}</Link>
            <Link href="/dashboard" className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] px-6 py-3.5 text-[15px] font-bold">{t("brand.dashboard")}</Link>
          </div>
          <button onClick={() => { setDone(false); setForm((f) => ({ ...f, title: "", description: "" })); }} className="mt-4 text-[13.5px] font-bold text-[#e4572e]">+ {t("brand.another")}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="border-b border-[#e9ddc3] bg-[#fff4de]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">{t("brand.eyebrow")}</p>
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
            <p className="text-[14px] text-[#78716c]">{t("brand.formSub")}</p>

            <div className="mt-6 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.businessName")}</span>
                  <input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder={t("brand.phBusiness")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.contactName")}</span>
                  <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder={t("brand.phName")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
              </div>

              <label className="grid gap-1.5">
                <span className="text-[13.5px] font-bold">{t("brand.titleLabel")} <span className="font-medium text-[#a8a29e]">{t("brand.titleHint")}</span></span>
                <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={t("brand.phTitle")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              </label>

              <div>
                <p className="text-[13.5px] font-bold">{t("brand.promoting")}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PROMOTION_TYPES.map((p) => (
                    <button type="button" key={p.id} onClick={() => set("promotionType", p.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-bold ${form.promotionType === p.id ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-[#fffbf1]"}`}>
                      <span className="mr-1">{p.emoji}</span>{promo(p.title)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.website")}</span>
                  <input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder={t("brand.phWebsite")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.category")}</span>
                  <select value={form.category} onChange={(e) => set("category", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.audience")}</span>
                  <input value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder={t("brand.phAudience")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.location")}</span>
                  <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={t("brand.phLocation")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
              </div>

              {/* Custom budget */}
              <div className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <label htmlFor="budget" className="text-[13.5px] font-bold">{t("brand.budget")}</label>
                  <span className="text-[12px] font-semibold text-[#a8a29e]">{t("brand.budgetPrivate")}</span>
                </div>
                <div className="mt-2 flex items-center rounded-xl border border-[#e9ddc3] bg-white focus-within:border-[#1c1917]">
                  <span className="pl-4 text-[20px] font-extrabold text-[#78716c]">₹</span>
                  <input
                    id="budget"
                    inputMode="numeric"
                    value={budgetAmount ? Number(budgetAmount).toLocaleString("en-IN") : ""}
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
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${Number(budgetAmount) === v ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-white"}`}
                    >
                      ₹{v.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
                <p className={`mt-3 text-[13px] font-semibold ${budgetNum > 0 && budgetNum < 500 ? "text-red-700" : "text-[#57534e]"}`}>
                  {budgetHint}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.language")}</span>
                  <select value={form.language} onChange={(e) => set("language", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none">
                    {LANGUAGES.slice(0, 5).map((l) => <option key={l} value={l}>{opt(l)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.format")}</span>
                  <select value={form.format} onChange={(e) => set("format", e.target.value)} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none">
                    {CONTENT_TYPES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.phone")}</span>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13.5px] font-bold">{t("brand.email")}</span>
                  <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t("brand.phEmail")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                </label>
              </div>

              <label className="grid gap-1.5">
                <span className="text-[13.5px] font-bold">{t("brand.descLabel")} <span className="font-medium text-[#a8a29e]">{t("brand.descHint")}</span></span>
                <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder={t("brand.phDesc")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              </label>

              {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[14px] font-bold text-red-700">{err}</p>}

              <button disabled={saving} className="rounded-2xl bg-[#e4572e] py-4 text-[16.5px] font-extrabold text-white hover:bg-[#c7431f] disabled:opacity-60">
                {saving ? t("brand.submitting") : t("brand.submit")}
              </button>
              <p className="text-center text-[12.5px] text-[#a8a29e]">{t("brand.free")}</p>
            </div>
          </form>

          {/* SIDE */}
          <div className="grid content-start gap-4">
            <div className="rounded-[24px] bg-[#17452e] p-6 text-white">
              <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#ffc53d]">{t("browse.title")}</p>
              <h3 className="font-display mt-1 text-[22px] font-black">{t("browse.heading")}</h3>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <label className="relative block">
                  <span className="sr-only">{t("browse.filterLang")}</span>
                  <select value={filter.lang} onChange={(e) => setFilter((f) => ({ ...f, lang: e.target.value }))} className="w-full min-w-0 appearance-none truncate rounded-xl border border-white/25 bg-white/10 py-3 pl-3.5 pr-9 text-[14px] font-bold text-white outline-none focus:border-[#ffc53d] [&>option]:bg-white [&>option]:text-[#1c1917]">
                    <option value="">{t("browse.allLang")}</option>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{opt(l)}</option>)}
                  </select>
                  <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#ffc53d]">▼</span>
                </label>
                <label className="relative block">
                  <span className="sr-only">{t("browse.filterCat")}</span>
                  <select value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))} className="w-full min-w-0 appearance-none truncate rounded-xl border border-white/25 bg-white/10 py-3 pl-3.5 pr-9 text-[14px] font-bold text-white outline-none focus:border-[#ffc53d] [&>option]:bg-white [&>option]:text-[#1c1917]">
                    <option value="">{t("browse.allCat")}</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{opt(c)}</option>)}
                  </select>
                  <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-[#ffc53d]">▼</span>
                </label>
              </div>
              <div className="mt-3 grid max-h-[420px] gap-2 overflow-y-auto">
                {filtered.length === 0 && <p className="rounded-xl bg-white/10 p-4 text-[13.5px]">No creators match yet — new profiles join daily. <Link href="/creators" className="font-bold text-[#ffc53d]">Invite creators →</Link></p>}
                {filtered.slice(0, 8).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/10 border border-white/10 p-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ffc53d] text-[15px] font-black text-black">{(c.name || "?").charAt(0).toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold">{c.name}</p>
                      <p className="truncate text-[12px] text-white/60">{opt(c.category)} • {(c.followers || 0).toLocaleString("en-IN")} • {opt(c.languages)}</p>
                    </div>
                  </div>
                ))}
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
                  href={whatsappWithText("Hi YaarLink! 👋 I'd like a price quote for promoting my business with creators.")}
                  value={SITE.phoneDisplay}
                  title="Get a quote on WhatsApp"
                  className="rounded-xl bg-[#25D366] py-3 text-center text-[14px] font-extrabold text-white hover:brightness-95"
                >
                  {t("price.wa")}
                </ContactLink>
                <ContactLink
                  kind="instagram"
                  href={instagramDmLink}
                  value={"@" + SITE.instagram}
                  title="Get a quote on Instagram"
                  className="rounded-xl border border-[#1c1917] py-3 text-center text-[14px] font-extrabold hover:bg-[#1c1917] hover:text-white"
                >
                  {t("price.ig")}
                </ContactLink>
              </div>
              <p className="mt-3 text-[12.5px] text-[#a8a29e]">{t("price.foot")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrandsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <BrandInner />
    </Suspense>
  );
}
