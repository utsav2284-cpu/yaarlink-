"use client";

import { useLang } from "@/frontend/i18n";
import { useState } from "react";
import { SITE } from "@/config/site";

/** Big, memorable domain strip with Copy + Share on WhatsApp. */
export default function DomainShare() {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const tld = SITE.domain.match(/\.[^.]+$/)?.[0] ?? "";
  const shareText = t("dom.shareText").replace("{url}", SITE.url);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(SITE.url);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = SITE.url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      window.prompt(t("dom.copyPrompt"), SITE.url);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[#1c1917] px-6 py-10 text-center text-white sm:px-10 sm:py-14">
      <div className="dotted-bg pointer-events-none absolute inset-0 opacity-[0.07]" />
      <div className="relative">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.2em] text-[#ffc53d]">{t("dom.kicker")}</p>
        <p className="font-display mt-3 whitespace-nowrap text-[clamp(30px,10vw,44px)] font-black leading-none tracking-tight sm:text-[76px]">
          the<span className="text-[#ffc53d]">yaar</span>
          <span className="text-[#ff8a5c]">{tld}</span>
        </p>
        <p className="mx-auto mt-4 max-w-md text-[15.5px] text-white/70">
          {t("dom.sub")}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
          <button
            onClick={copy}
            className="rounded-2xl bg-white px-6 py-3.5 text-[15px] font-extrabold text-[#1c1917] hover:bg-[#ffc53d]"
          >
            {copied ? t("dom.copied") : <><span aria-hidden="true">🔗</span> {t("dom.copy")} {SITE.host}</>}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl bg-[#0f7a3f] px-6 py-3.5 text-[15px] font-extrabold text-white hover:brightness-95"
          >
            {t("dom.share")}
          </a>
        </div>
      </div>
    </div>
  );
}
