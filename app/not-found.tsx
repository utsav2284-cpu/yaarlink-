"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4 py-16 text-center">
      <div>
        <p className="font-display text-[96px] font-black leading-none text-[#e4572e]">404</p>
        <h1 className="font-display mt-3 text-[30px] font-black">{t("nf.title")}</h1>
        <p className="mt-2 text-[16px] text-[#57534e]">{t("nf.body")}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/" className="rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15px] font-bold text-white">{t("nf.home")}</Link>
          <Link href="/campaigns" className="rounded-2xl border border-[#e9ddc3] bg-white px-6 py-3.5 text-[15px] font-bold">{t("nf.browse")}</Link>
        </div>
      </div>
    </div>
  );
}
