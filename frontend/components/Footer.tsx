"use client";

import Link from "next/link";
import { Logo } from "./Navbar";
import { useLang } from "@/frontend/i18n";
import { SITE, callLink, gmailComposeLink, instagramLink, mailtoLink, whatsappLink } from "@/config/site";
import ContactLink from "./ContactLink";

export default function Footer() {
  const { lang, t } = useLang();
  return (
    <footer className="bg-[#14100d] text-[#e7e5e4]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-xs text-[14.5px] leading-relaxed text-[#a8a29e]">
{t("foot.tagline")} {t("foot.blurb")}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["English", "हिन्दी", "ਪੰਜਾਬੀ"].map((l) => (
                <span key={l} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12.5px] font-bold">
                  {l}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[13px] font-semibold text-[#a8a29e]">
{t("foot.born")}
            </p>
          </div>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-[#78716c]">{t("foot.explore")}</p>
            <div className="mt-3 grid gap-2 text-[14.5px] font-semibold">
              <Link href="/brands" className="hover:text-[#ffc53d]">{t("foot.brands")}</Link>
              <Link href="/creators" className="hover:text-[#ffc53d]">{t("foot.creators")}</Link>
              <Link href="/campaigns" className="hover:text-[#ffc53d]">{t("nav.campaigns")}</Link>
              <Link href="/how-it-works" className="hover:text-[#ffc53d]">{t("nav.how")}</Link>
            </div>
          </div>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-[#78716c]">{t("foot.company")}</p>
            <div className="mt-3 grid gap-2 text-[14.5px] font-semibold">
              <Link href="/about" className="hover:text-[#ffc53d]">{t("nav.about")}</Link>
              <Link href="/contact" className="hover:text-[#ffc53d]">{t("nav.contact")}</Link>
              <Link href="/signup" className="hover:text-[#ffc53d]">{t("nav.signup")}</Link>
              <Link href="/login" className="hover:text-[#ffc53d]">{t("nav.login")}</Link>
            </div>
          </div>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-[#78716c]">{t("foot.contact")}</p>
            <div className="mt-3 grid gap-2 text-[14.5px]">
              {SITE.phoneDisplay && (
                <ContactLink kind="call" href={callLink} value={SITE.phoneDisplay} title={t("cont.call")} className="hover:text-[#ffc53d]">📞 {SITE.phoneDisplay}</ContactLink>
              )}
              <ContactLink kind="email" href={mailtoLink()} webHref={gmailComposeLink()} value={SITE.email} title={t("cont.email")} className="break-all hover:text-[#ffc53d]">✉️ {SITE.email}</ContactLink>
              {SITE.instagram && (
                <ContactLink kind="instagram" href={instagramLink} value={"@" + SITE.instagram} title={t("cont.ig")} className="hover:text-[#ffc53d]">📸 @{SITE.instagram}</ContactLink>
              )}
              <p className="text-[#a8a29e]">📍 {SITE.city}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {whatsappLink && (
                  <ContactLink kind="whatsapp" href={whatsappLink} value={SITE.phoneDisplay} title={t("cont.wa")} className="inline-flex w-fit rounded-full bg-[#25D366] px-4 py-2 text-[13.5px] font-bold text-white hover:brightness-95">
                    {t("cont.wa")}
                  </ContactLink>
                )}
                <Link href="/contact" className="inline-flex w-fit rounded-full bg-[#e4572e] px-4 py-2 text-[13.5px] font-bold text-white hover:bg-[#c7431f]">
                  {t("cont.askAs")} →
                </Link>
              </div>
            </div>
          </div>
        </div>
        <a
          href={SITE.url}
          className="font-display mt-14 block select-none whitespace-nowrap text-center text-[11vw] font-black leading-[0.9] tracking-tight text-white/[0.07] transition hover:text-white/[0.12] md:text-[150px]"
          aria-label={SITE.domain}
        >
          the<span className="text-[#ffc53d]/30">yaar</span>.com
        </a>
        <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-6 text-[12.5px] text-[#78716c] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 YaarLink · <span className="font-bold text-[#ffc53d]">{SITE.domain}</span> · {t("foot.rights")} {lang === "hi" ? "• सरल मार्केटिंग, सबके लिए" : lang === "pa" ? "• ਸਧਾਰਨ ਮਾਰਕੀਟਿੰਗ, ਸਭ ਲਈ" : "• Simple marketing for everyone."}</p>
          <p>{t("foot.principle")}</p>
        </div>
      </div>
    </footer>
  );
}
