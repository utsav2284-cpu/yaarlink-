"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";

export default function HowItWorks() {
  const { t } = useLang();
  return (
    <div>
      <section className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6">
        <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">{t("howp.eyebrow")}</p>
        <h1 className="font-display mt-2 text-[36px] font-black sm:text-[52px]">{t("howp.title")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-[16.5px] text-[#57534e]">
          {t("howp.sub")}
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
        <div className="grid gap-4">
          {[
            { n: "01", t: t("howp.1t"), d: t("howp.1d"), e: t("howp.1e"), c: "bg-[#fff4de]" },
            { n: "02", t: t("howp.2t"), d: t("howp.2d"), e: t("howp.2e"), c: "bg-white" },
            { n: "03", t: t("howp.3t"), d: t("howp.3d"), e: t("howp.3e"), c: "bg-white" },
            { n: "04", t: t("howp.4t"), d: t("howp.4d"), e: t("howp.4e"), c: "bg-[#eef5ef]" },
          ].map((s) => (
            <div key={s.n} className={`grid gap-4 rounded-[24px] border border-[#e9ddc3] ${s.c} p-6 grid-cols-1 sm:grid-cols-[80px_minmax(0,1fr)] sm:p-8`}>
              <p className="font-display text-[52px] font-black leading-none text-[#e4572e]">{s.n}</p>
              <div>
                <h3 className="font-display text-[24px] font-black">{s.t}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-[#57534e]">{s.d}</p>
                <p className="mt-3 inline-block rounded-xl bg-[#1c1917] px-4 py-2 text-[13.5px] font-bold text-[#ffc53d]">{s.e}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-6" aria-labelledby="workflow-scope-heading">
        <div className="rounded-[24px] border border-[#e9ddc3] bg-white p-6 sm:p-8">
          <h2 id="workflow-scope-heading" className="font-display text-[24px] font-black">
            {t("howp.scopeTitle")}
          </h2>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-[15px] font-extrabold text-[#17452e]">{t("howp.scopeOnTitle")}</h3>
              <ul className="mt-3 grid gap-2 text-[14.5px] leading-relaxed text-[#57534e]">
                <li>✓ {t("howp.scopeOn1")}</li>
                <li>✓ {t("howp.scopeOn2")}</li>
                <li>✓ {t("howp.scopeOn3")}</li>
              </ul>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold text-[#9a3412]">{t("howp.scopeOffTitle")}</h3>
              <ul className="mt-3 grid gap-2 text-[14.5px] leading-relaxed text-[#57534e]">
                <li>• {t("howp.scopeOff1")}</li>
                <li>• {t("howp.scopeOff2")}</li>
                <li>• {t("howp.scopeOff3")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] bg-[#1c1917] p-8 text-white">
            <h3 className="font-display text-[24px] font-black">{t("howp.forBrands")}</h3>
            <ul className="mt-3 grid gap-2 text-[15px] text-white/80">
              <li>{t("howp.b1")}</li>
              <li>{t("howp.b2")}</li>
              <li>{t("howp.b3")}</li>
              <li>{t("howp.b4")}</li>
            </ul>
            <Link href="/brands" className="mt-5 inline-block rounded-2xl bg-[#e4572e] px-6 py-3 text-[15px] font-bold text-white">{t("howp.startBrand")}</Link>
          </div>
          <div className="rounded-[24px] bg-[#ffc53d] p-8">
            <h3 className="font-display text-[24px] font-black">{t("howp.forCreators")}</h3>
            <ul className="mt-3 grid gap-2 text-[15px] font-semibold text-[#57534e]">
              <li>{t("howp.c1")}</li>
              <li>{t("howp.c2")}</li>
              <li>{t("howp.c3")}</li>
              <li>{t("howp.c4")}</li>
            </ul>
            <Link href="/creators" className="mt-5 inline-block rounded-2xl bg-[#1c1917] px-6 py-3 text-[15px] font-bold text-white">{t("howp.startCreator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
