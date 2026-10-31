"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LANGS, useLang, type Lang } from "@/frontend/i18n";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1c1917] text-[20px] font-black text-[#ffc53d]">
        ਯਾ
      </span>
      <span className={`text-[22px] font-extrabold tracking-tight ${dark ? "text-white" : "text-[#1c1917]"}`}>
        yaar<span className="text-[#e4572e]">link</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const { t, lang, setLang } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setUser(d.user ?? null))
      .catch(() => alive && setUser(null));
    return () => {
      alive = false;
    };
  }, [pathname]);

  const links = [
    { href: "/brands", label: t("nav.brands") },
    { href: "/creators", label: t("nav.creators") },
    { href: "/campaigns", label: t("nav.campaigns") },
    { href: "/how-it-works", label: t("nav.how") },
    { href: "/about", label: t("nav.about") },
    { href: "/contact", label: t("nav.contact") },
  ];

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#e9ddc3] bg-[#fffbf1]/95 backdrop-blur">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition ${
                pathname === l.href ? "bg-[#1c1917] text-white" : "text-[#44403c] hover:bg-[#fff4de] hover:text-[#1c1917]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* Language */}
          <div className="relative">
            <button
              onClick={() => setLangOpen((v) => !v)}
              aria-label={t("nav.chooseLanguage")}
              aria-expanded={langOpen}
              aria-haspopup="true"
              className="flex items-center gap-1.5 rounded-full border border-[#e9ddc3] bg-white px-3 py-2 text-[13.5px] font-bold text-[#1c1917]"
            >
              <span>🌐</span>
              <span>{LANGS.find((l) => l.code === lang)?.label}</span>
              <span className="text-[#a8a29e]">▾</span>
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-[#e9ddc3] bg-white shadow-xl">
                  {LANGS.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        setLang(l.code as Lang);
                        setLangOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-semibold hover:bg-[#fff4de] ${
                        lang === l.code ? "bg-[#fff4de] text-[#e4572e]" : "text-[#1c1917]"
                      }`}
                    >
                      <span>{l.code === "en" ? "🇬🇧 English" : l.code === "hi" ? "🇮🇳 हिन्दी" : "🟠 ਪੰਜਾਬੀ"}</span>
                      {lang === l.code && <span>✓</span>}
                    </button>
                  ))}
                  <p className="border-t border-[#f0e6cc] bg-[#fffbf1] px-4 py-2 text-[11px] text-[#78716c]">
                    {t("nav.moreLanguages")}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-full bg-[#17452e] px-4 py-2 text-[14px] font-bold text-white hover:bg-[#0f3321]"
                >
                  {t("nav.dashboard")}
                </Link>
                <Link
                  href="/account"
                  className="rounded-full border border-[#e9ddc3] bg-white px-3 py-2 text-[13px] font-bold text-[#44403c]"
                >
                  {t("nav.account")}
                </Link>
                <button
                  onClick={logout}
                  className="rounded-full border border-[#e9ddc3] bg-white px-3 py-2 text-[13px] font-bold text-[#78716c]"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-full px-3 py-2 text-[14px] font-bold text-[#44403c] hover:text-black">
                  {t("nav.login")}
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#e4572e] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#c7431f]"
                >
                  {t("nav.signup")}
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#e9ddc3] bg-white text-[18px] lg:hidden"
            aria-label={t("nav.menu")}
            aria-expanded={open}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-[#e9ddc3] bg-[#fffbf1] px-4 pb-5 pt-2 lg:hidden">
          <div className="grid gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-4 py-3 text-[15px] font-bold ${
                  pathname === l.href ? "bg-[#1c1917] text-white" : "bg-white text-[#1c1917] border border-[#f0e6cc]"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-[#17452e] px-4 py-3 text-center text-[15px] font-bold text-white"
                  >
                    {t("nav.dashboard")}
                  </Link>
                  <button onClick={() => { logout(); setOpen(false); }} className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-3 text-[15px] font-bold">
                    {t("nav.logout")}
                  </button>
                  <Link
                    href="/account"
                    onClick={() => setOpen(false)}
                    className="col-span-2 rounded-xl border border-[#e9ddc3] bg-white px-4 py-3 text-center text-[15px] font-bold"
                  >
                    {t("nav.account")}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-3 text-center text-[15px] font-bold"
                  >
                    {t("nav.login")}
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-[#e4572e] px-4 py-3 text-center text-[15px] font-bold text-white"
                  >
                    {t("nav.signup")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
