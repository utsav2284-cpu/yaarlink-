"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLang } from "@/frontend/i18n";
import { PROMOTION_TYPES } from "@/shared/constants";
import { SITE } from "@/config/site";
import DomainShare from "@/frontend/components/DomainShare";
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

function formatFollowers(n: number) {
  if (!n) return "—";
  if (n >= 100000) return (n / 100000).toFixed(1).replace(/\.0$/, "") + "L";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export default function HomePage() {
  const { t } = useLang();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);

  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.json()).then((d) => setCampaigns(d.campaigns?.slice(0, 3) ?? [])).catch(() => {});
    fetch("/api/creators").then((r) => r.json()).then((d) => setCreators(d.creators?.slice(0, 4) ?? [])).catch(() => {});
  }, []);

  return (
    <div>
      {/* Announcement */}
      <div className="bg-[#1c1917] px-4 py-2 text-center text-[12.5px] font-semibold text-[#fff4de]">
        🎉 We&apos;re live at <span className="font-extrabold text-[#ffc53d]">{SITE.domain}</span>
        <span className="hidden sm:inline"> — pages in every region of India & beyond, ready for your brand</span>
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
                  className="nudge rounded-2xl bg-[#e4572e] px-7 py-4 text-center text-[17px] font-extrabold text-white shadow-[0_10px_24px_-8px_rgba(228,87,46,0.6)] transition hover:-translate-y-0.5 hover:bg-[#c7431f]"
                >
                  {t("hero.ctaBrand")} <span className="arrow">→</span>
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
                  <p className="mt-1 text-[13.5px] text-[#78716c]">{t("hero.from")}</p>
                </div>
              </div>
            </div>

            {/* Hero visual */}
            <div className="relative">
              <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-5 card-shadow">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold uppercase tracking-widest text-[#a8a29e]">How a brief looks</p>
                  <span className="rounded-full bg-[#fff4de] border border-[#e9ddc3] px-2.5 py-1 text-[12px] font-bold text-[#92400e]">Example</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    { shop: "Balle Balle Cafe • Ludhiana", what: "Weekend offer • 4 Story promos", tag: "Story", lang: "ਪੰਜਾਬੀ" },
                    { shop: "GlowKart Skincare • Delhi", what: "UGC Reel + Story • Hindi", tag: "UGC", lang: "हिन्दी" },
                    { shop: "Chandigarh Food Fest", what: "6 meme pages • Ticket push", tag: "Meme pages", lang: "English" },
                  ].map((c) => (
                    <div key={c.shop} className="flex items-center gap-3 rounded-2xl border border-[#f0e6cc] bg-[#fffbf1] p-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ffc53d] text-[20px] font-black">★</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-extrabold">{c.shop}</p>
                        <p className="truncate text-[13px] text-[#78716c]">{c.what}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13.5px] font-extrabold">{c.tag}</p>
                        <p className="text-[11.5px] font-bold text-[#a8a29e]">{c.lang}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/campaigns" className="mt-4 block rounded-xl bg-[#1c1917] py-3 text-center text-[14.5px] font-bold text-white hover:bg-black">
                  Browse open campaigns →
                </Link>
              </div>
              <div className="absolute -bottom-4 left-3 max-w-[calc(100%-1.5rem)] float-b rounded-2xl border border-[#e9ddc3] bg-[#17452e] px-4 py-2.5 text-white shadow-lg">
                <p className="text-[13px] font-extrabold">Stories • Reels • Posts • UGC</p>
              </div>
              <div className="absolute -top-4 right-3 max-w-[calc(100%-1.5rem)] float-a rounded-2xl border border-[#e9ddc3] bg-[#ffc53d] px-4 py-2 text-[13px] font-extrabold text-[#1c1917] shadow-lg">
                No jargon. Just yaars. 🤝
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
                <p className="text-[13.5px] text-[#78716c]">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STRIP */}
      <section className="border-y border-[#e9ddc3] bg-[#fff4de]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
          <span className="shrink-0 text-[13px] font-bold uppercase tracking-widest text-[#a8a29e]">Made for</span>
          <div className="marquee min-w-0 flex-1 overflow-hidden">
            <div className="marquee-track gap-2">
              {[0, 1].map((copy) =>
                ["🛒 Kirana stores", "☕ Cafes & dhabas", "💇 Salons & gyms", "📦 D2C brands", "📱 New apps", "📚 Coaching", "🎟️ Events", "▶️ YouTubers", "😂 Meme pages", "🎥 UGC creators"].map((x) => (
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
          <p className="text-[13px] font-bold uppercase tracking-widest text-[#e4572e]">Start here</p>
          <h2 className="font-display mt-2 text-[32px] font-black leading-tight sm:text-[44px]">{t("promo.title")}</h2>
          <p className="mt-2 text-[16.5px] text-[#57534e]">{t("promo.sub")}</p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROMOTION_TYPES.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 90}>
            <Link href={`/brands?type=${encodeURIComponent(p.id)}`} className="lift group block h-full rounded-3xl border border-[#e9ddc3] bg-white p-6 card-shadow hover:border-[#1c1917]">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff4de] text-[26px] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">{p.emoji}</span>
              <h3 className="mt-4 text-[19px] font-extrabold">{p.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#57534e]">{p.desc}</p>
              <p className="mt-3 inline-block rounded-full bg-[#fffbf1] border border-[#f0e6cc] px-3 py-1 text-[12.5px] font-bold text-[#78716c]">{p.example}</p>
              <p className="nudge mt-3 text-[14px] font-bold text-[#e4572e]">Start a campaign <span className="arrow">→</span></p>
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
              <p className="text-[13px] font-bold uppercase tracking-widest text-[#ffc53d]">Simple. Really simple.</p>
              <h2 className="font-display mt-2 text-[32px] font-black sm:text-[44px]">{t("how.title")}</h2>
              <p className="mt-2 text-[16px] text-white/70">{t("how.sub")}</p>
            </div>
            <Link href="/how-it-works" className="w-fit rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-[#17452e] hover:bg-[#ffc53d] hover:text-black">
              See details →
            </Link>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              { n: "01", title: t("how.1t"), desc: t("how.1d") },
              { n: "02", title: t("how.2t"), desc: t("how.2d") },
              { n: "03", title: t("how.3t"), desc: t("how.3d") },
              { n: "04", title: t("how.4t"), desc: t("how.4d") },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 110} className="h-full"><div className="h-full rounded-3xl bg-white/[0.07] border border-white/15 p-6">
                <p className="font-display text-[40px] font-black text-[#ffc53d]">{s.n}</p>
                <h3 className="mt-2 text-[18px] font-extrabold">{s.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/70">{s.desc}</p>
              </div></Reveal>
            ))}
          </div>
          <p className="mt-6 text-center font-display text-[22px] italic text-[#ffc53d]">Simple.</p>
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
              {["🌾 North", "🌴 South", "🐅 East", "🌊 West", "🏔️ Northeast", "🌍 International"].map((r) => (
                <span key={r} className="rounded-full border border-[#e9ddc3] bg-[#fffbf1] px-3 py-1.5 text-[13px] font-bold">
                  {r}
                </span>
              ))}
            </div>
            <div className="mt-6 grid gap-2.5">
              {["Pages in every state & language — from Punjab to Tamil Nadu", "International influencers & global-audience pages", "Local shops to international brands — one simple process"].map((x) => (
                <p key={x} className="flex items-start gap-2.5 text-[15px] font-semibold">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-100 text-green-800 text-[13px]">✓</span>
                  {x}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-[#fffbf1] border border-[#f0e6cc] p-6">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#78716c]">{t("exp.nofake")}</p>
            <div className="mt-3 grid gap-2.5">
              {['❌ "10,000 brands trust us"', "❌ Fake testimonials with stock photos", "❌ Inflated reach screenshots"].map((x) => (
                <p key={x} className="rounded-xl bg-white border border-[#f0e6cc] px-4 py-3 text-[14.5px] font-bold text-[#78716c] line-through decoration-[#e4572e]/60">
                  {x}
                </p>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#1c1917] p-5 text-white">
              <p className="text-[14.5px] font-bold leading-relaxed">“We show real campaigns, real briefs, real creators. As we grow, we will publish verified numbers — not before.”</p>
              <p className="mt-2 text-[13px] text-white/60">— Team YaarLink, Ludhiana</p>
            </div>
          </div>
        </div>
      </section></Reveal>

      {/* SPLIT */}
      <Reveal><section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] bg-[#ffc53d] p-8 sm:p-10">
            <p className="text-[13px] font-bold uppercase tracking-widest">For brands</p>
            <h3 className="font-display mt-2 text-[28px] font-black leading-tight">Tell us what you want to promote. We will help you find the right creators.</h3>
            <ul className="mt-4 grid gap-2 text-[15px] font-semibold">
              <li>✓ Post a campaign in 3 minutes</li>
              <li>✓ Filter creators by language & city</li>
              <li>✓ Stories, Reels, Posts & UGC</li>
            </ul>
            <Link href="/brands" className="mt-6 inline-block rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15.5px] font-bold text-white hover:bg-black">
              Create campaign →
            </Link>
          </div>
          <div className="rounded-[28px] bg-[#1c1917] p-8 text-white sm:p-10">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#ffc53d]">For creators</p>
            <h3 className="font-display mt-2 text-[28px] font-black leading-tight">Turn your audience into opportunity.</h3>
            <ul className="mt-4 grid gap-2 text-[15px] font-semibold text-white/85">
              <li>✓ Join free — meme pages welcome</li>
              <li>✓ Get paid brand campaigns</li>
              <li>✓ Hindi, Punjabi & English deals</li>
            </ul>
            <Link href="/creators" className="mt-6 inline-block rounded-2xl bg-[#e4572e] px-6 py-3.5 text-[15.5px] font-bold text-white hover:bg-[#c7431f]">
              Join network →
            </Link>
          </div>
        </div>
      </section></Reveal>

      {/* LIVE PREVIEWS */}
      <Reveal><section className="border-t border-[#e9ddc3] bg-[#fffdf6]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-[28px] font-black sm:text-[36px]">Fresh on YaarLink</h2>
              <p className="text-[15px] text-[#78716c]">Real campaigns & creators joining right now.</p>
            </div>
            <Link href="/campaigns" className="hidden rounded-full border border-[#1c1917] px-5 py-2.5 text-[14px] font-bold hover:bg-[#1c1917] hover:text-white sm:block">
              View all →
            </Link>
          </div>
          <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <p className="mb-3 text-[12.5px] font-bold uppercase tracking-widest text-[#a8a29e]">Open campaigns</p>
              <div className="grid gap-3">
                {campaigns.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14.5px] text-[#78716c]">
                    No campaigns yet — be the first brand to post one. <Link href="/brands" className="font-bold text-[#e4572e]">Create →</Link>
                  </div>
                )}
                {campaigns.map((c) => (
                  <Link key={c.id} href="/campaigns" className="flex items-center justify-between gap-3 rounded-2xl border border-[#e9ddc3] bg-white p-4 hover:border-[#1c1917]">
                    <div>
                      <p className="text-[15px] font-extrabold">{c.title}</p>
                      <p className="text-[13px] text-[#78716c]">{c.businessName} • {c.location} • {c.language} • {c.format}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#17452e] px-3 py-1.5 text-[13px] font-bold text-white">{c.promotionType}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-[12.5px] font-bold uppercase tracking-widest text-[#a8a29e]">New creators</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {creators.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14.5px] text-[#78716c] sm:col-span-2">
                    No creators yet — <Link href="/creators" className="font-bold text-[#e4572e]">join the network →</Link>
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
                        <p className="text-[12px] text-[#78716c]">{cr.category} • {formatFollowers(cr.followers)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[12.5px] font-semibold text-[#57534e]">{cr.location} • {cr.languages}</p>
                  </div>
                ))}
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
          <h2 className="font-display text-[28px] font-black sm:text-[38px]">Apni bhaasha mein marketing.</h2>
          <p className="mx-auto mt-2 max-w-xl text-[15.5px] text-[#57534e]">Start with English, हिन्दी and ਪੰਜਾਬੀ. Bengali, Marathi, Tamil & more coming as our creator family grows.</p>
          <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              { f: "🇬🇧", l: "English", d: "For D2C & startups" },
              { f: "🇮🇳", l: "हिन्दी", d: "देश की भाषा में" },
              { f: "🟠", l: "ਪੰਜਾਬੀ", d: "ਆਪਣੀ ਮਿੱਟੀ ਦੀ" },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl border border-[#f0e6cc] bg-[#fffbf1] p-5">
                <p className="text-[28px]">{x.f}</p>
                <p className="mt-1 text-[18px] font-extrabold">{x.l}</p>
                <p className="text-[13px] text-[#78716c]">{x.d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] bg-[#e4572e] p-8 text-center text-white sm:p-12">
          <h2 className="font-display text-[30px] font-black sm:text-[42px]">{t("cta.title")}</h2>
          <p className="mt-2 text-[16px] text-white/85">{t("cta.sub")}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/brands" className="rounded-2xl bg-white px-7 py-3.5 text-[16px] font-extrabold text-[#1c1917] hover:bg-[#ffc53d]">I&apos;m a Brand</Link>
            <Link href="/creators" className="rounded-2xl border-2 border-white px-7 py-3 text-[16px] font-extrabold text-white hover:bg-white hover:text-[#1c1917]">I&apos;m a Creator</Link>
          </div>
        </div>
      </section></Reveal>
    </div>
  );
}
