"use client";

import { useLang } from "@/frontend/i18n";
import ProblemStories from "@/frontend/components/ProblemStories";
import Link from "next/link";

export default function About() {
  const { t, formatNumber } = useLang();
  return (
    <div>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("about.eyebrow")}</p>
        <h1 className="font-display mt-2 text-[36px] font-black leading-tight sm:text-[52px]">
          {t("about.title")}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[#57534e]">
          {t("about.p1")}
        </p>
        <p className="mt-3 text-[17px] leading-relaxed text-[#57534e]">
          {t("about.p2")}
        </p>
      </section>

      <ProblemStories />

      <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { t: t("about.v1"), d: t("about.v1d") },
            { t: t("about.v2"), d: t("about.v2d") },
            { t: t("about.v3"), d: t("about.v3d") },
          ].map((v) => (
            <div key={v.t} className="rounded-3xl border border-[#e9ddc3] bg-white p-6">
              <h3 className="font-display text-[20px] font-black">{v.t}</h3>
              <p className="mt-2 text-[14.5px] text-[#57534e]">{v.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[28px] bg-[#17452e] p-8 text-white sm:p-10">
          <h2 className="font-display text-[26px] font-black">{t("about.where")}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { s: t("about.nowLabel"), d: t("about.now") },
              { s: t("about.nextLabel"), d: t("about.next") },
              { s: t("about.laterLabel"), d: t("about.later") },
              { s: t("about.dreamLabel"), d: t("about.dream") },
            ].map((r) => (
              <div key={r.s} className="rounded-2xl bg-white/10 border border-white/15 p-5">
                <p className="text-[12px] font-bold uppercase tracking-widest text-[#ffc53d]">{r.s}</p>
                <p className="mt-1 text-[15px] font-semibold">{r.d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-[#e9ddc3] bg-white p-8 text-center">
          <h2 className="font-display text-[26px] font-black">{t("about.ctaTitle")}</h2>
          <p className="mt-2 text-[15px] text-[#57534e]">
            {t("about.ctaBody").replace("{brands}", formatNumber(100)).replace("{creators}", formatNumber(200))}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/signup" className="rounded-2xl bg-[#c7431f] px-6 py-3 text-[15px] font-bold text-white">{t("about.join")}</Link>
            <Link href="/contact" className="rounded-2xl border border-[#1c1917] px-6 py-3 text-[15px] font-bold">{t("about.talk")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
