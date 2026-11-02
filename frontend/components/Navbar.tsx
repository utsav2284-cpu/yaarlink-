"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LANGS, useLang, type Lang } from "@/frontend/i18n";
import { fetchSessionUser, requestLogout, type SessionUserSummary } from "@/frontend/session";
import { buildAuthPath, DEFAULT_RETURN_TO, safeReturnTo } from "@/shared/return-to";

export function Logo({ dark = false }: { dark?: boolean }) {
  const { t } = useLang();
  return (
    <Link href="/" aria-label={t("nav.home")} className="flex items-center gap-2">
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-[#1c1917] text-[20px] font-black text-[#ffc53d]">
        ਯਾ
      </span>
      <span aria-hidden="true" className={`text-[22px] font-extrabold tracking-tight ${dark ? "text-white" : "text-[#1c1917]"}`}>
        yaar<span className="text-[#c7431f]">link</span>
      </span>
    </Link>
  );
}

type NavbarSessionUser = Pick<SessionUserSummary, "id">;

export default function Navbar({
  initialUser = null,
  initialSessionStatus = "loading",
}: {
  initialUser?: NavbarSessionUser | null;
  initialSessionStatus?: "loading" | "ready" | "error";
} = {}) {
  const { t, lang, pendingLang, languagePending, setLang } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [user, setUser] = useState<SessionUserSummary | NavbarSessionUser | null>(initialUser);
  const [sessionStatus, setSessionStatus] = useState<"loading" | "ready" | "error">(initialSessionStatus);
  const [sessionCheckId, setSessionCheckId] = useState(0);
  const sessionCheckKey = `${pathname ?? ""}:${sessionCheckId}`;
  const [completedSessionCheck, setCompletedSessionCheck] = useState(
    initialSessionStatus === "loading" ? "" : sessionCheckKey,
  );
  const [lastPathname, setLastPathname] = useState(pathname);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const initialUserKey = initialUser
    ? initialUser.id
    : initialSessionStatus === "error"
      ? "error"
      : "guest";
  const [lastInitialUserKey, setLastInitialUserKey] = useState(initialUserKey);
  const sessionCheckComplete = completedSessionCheck === sessionCheckKey;
  const sessionChecking = !sessionCheckComplete || sessionStatus === "loading";
  const sessionFailed = sessionCheckComplete && sessionStatus === "error";
  const authReturnTo = pathname && pathname !== "/" ? safeReturnTo(pathname, DEFAULT_RETURN_TO) : DEFAULT_RETURN_TO;
  const loginHref = buildAuthPath("/login", { returnTo: authReturnTo });
  const signupHref = buildAuthPath("/signup", { returnTo: authReturnTo });

  const retrySessionCheck = () => {
    setSessionStatus("loading");
    setSessionCheckId((value) => value + 1);
  };

  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const languageOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [languageFocusIndex, setLanguageFocusIndex] = useState(0);
  const displayLang = pendingLang ?? lang;
  const currentLanguageIndex = Math.max(0, LANGS.findIndex((l) => l.code === displayLang));
  const currentLanguageLabel = LANGS[currentLanguageIndex]?.label;

  const closeLanguageMenu = (returnFocus = false) => {
    if (returnFocus) languageButtonRef.current?.focus();
    setLangOpen(false);
  };

  const toggleLanguageMenu = () => {
    if (langOpen) {
      closeLanguageMenu(true);
      return;
    }
    setLanguageFocusIndex(currentLanguageIndex);
    setLangOpen(true);
  };

  const closeMobileMenu = (returnFocus = false) => {
    if (returnFocus) mobileMenuButtonRef.current?.focus();
    setOpen(false);
  };

  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
    setLangOpen(false);
    setLogoutFailed(false);
  }

  // A router.refresh() after login/logout re-renders the server layout with
  // fresh session props. Adopt that authoritative result immediately rather
  // than briefly retaining the previous client-side auth actions.
  if (lastInitialUserKey !== initialUserKey) {
    setLastInitialUserKey(initialUserKey);
    setUser(initialUser);
    setSessionStatus(initialSessionStatus);
    setCompletedSessionCheck(initialSessionStatus === "loading" ? "" : sessionCheckKey);
    setLogoutFailed(false);
  }

  useEffect(() => {
    if (!langOpen) return;
    languageOptionRefs.current[languageFocusIndex]?.focus();
  }, [langOpen, languageFocusIndex]);

  useEffect(() => {
    if (!open && !langOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (langOpen) {
        languageButtonRef.current?.focus();
        setLangOpen(false);
      } else {
        mobileMenuButtonRef.current?.focus();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, langOpen]);

  const onLanguageMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      closeLanguageMenu(true);
      return;
    }
    const lastIndex = LANGS.length - 1;
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = languageFocusIndex === lastIndex ? 0 : languageFocusIndex + 1;
    if (event.key === "ArrowUp") nextIndex = languageFocusIndex === 0 ? lastIndex : languageFocusIndex - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex !== null) {
      event.preventDefault();
      setLanguageFocusIndex(nextIndex);
    }
  };

  useEffect(() => {
    let alive = true;
    const checkKey = sessionCheckKey;
    fetchSessionUser()
      .then((nextUser) => {
        if (!alive) return;
        setUser(nextUser);
        setSessionStatus("ready");
        setCompletedSessionCheck(checkKey);
      })
      .catch(() => {
        if (!alive) return;
        // Keep any already-known user visible. Only a successful 200 with
        // user:null is treated as logged out; an outage stays unknown.
        setSessionStatus("error");
        setCompletedSessionCheck(checkKey);
      });
    return () => {
      alive = false;
    };
  }, [sessionCheckKey]);

  const links = [
    { href: "/brands", label: t("nav.brands") },
    { href: "/creators", label: t("nav.creators") },
    { href: "/campaigns", label: t("nav.campaigns") },
    { href: "/how-it-works", label: t("nav.how") },
    { href: "/about", label: t("nav.about") },
    { href: "/contact", label: t("nav.contact") },
  ];

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutFailed(false);
    const loggedOut = await requestLogout();
    if (!loggedOut) {
      // Do not present the account as logged out when this browser may still
      // hold a valid session cookie. Keep the authenticated actions visible
      // and offer the same button as an immediate retry path.
      setLogoutFailed(true);
      setLoggingOut(false);
      return;
    }
    setUser(null);
    setSessionStatus("ready");
    setCompletedSessionCheck(sessionCheckKey);
    setOpen(false);
    setLoggingOut(false);
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[#1c1917] focus:px-4 focus:py-2 focus:font-bold focus:text-white"
      >
        {t("a11y.skipToContent")}
      </a>
    <header className="sticky top-0 z-50 border-b border-[#e9ddc3] bg-[#fffbf1]/95 backdrop-blur">
      {logoutFailed && user && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-[13px] font-semibold text-red-800">
          {t("session.logoutFailed")}
        </div>
      )}
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav aria-label={t("nav.primary")} className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
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
              ref={languageButtonRef}
              type="button"
              onClick={toggleLanguageMenu}
              aria-label={`${t("nav.chooseLanguage")}: ${currentLanguageLabel}`}
              aria-expanded={langOpen}
              aria-haspopup="listbox"
              aria-controls="language-menu"
              aria-busy={languagePending}
              className="flex items-center gap-1.5 rounded-full border border-[#e9ddc3] bg-white px-3 py-2 text-[13.5px] font-bold text-[#1c1917]"
            >
              <span aria-hidden="true">🌐</span>
              <span>{currentLanguageLabel}</span>
              <span aria-hidden="true" className="text-[#6f6862]">▾</span>
            </button>
            {langOpen && (
              <>
                <div aria-hidden="true" className="fixed inset-0 z-40" onClick={() => closeLanguageMenu(true)} />
                <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-[#e9ddc3] bg-white shadow-xl">
                  <div
                    id="language-menu"
                    role="listbox"
                    aria-label={t("nav.chooseLanguage")}
                    onKeyDown={onLanguageMenuKeyDown}
                  >
                  {LANGS.map((l, index) => (
                    <button
                      key={l.code}
                      ref={(element) => {
                        languageOptionRefs.current[index] = element;
                      }}
                      type="button"
                      role="option"
                      aria-selected={displayLang === l.code}
                      disabled={languagePending}
                      tabIndex={index === languageFocusIndex ? 0 : -1}
                      onMouseEnter={() => setLanguageFocusIndex(index)}
                      onClick={() => {
                        void setLang(l.code as Lang);
                        closeLanguageMenu(true);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-semibold hover:bg-[#fff4de] disabled:cursor-wait disabled:opacity-60 ${
                        displayLang === l.code ? "bg-[#fff4de] text-[#c7431f]" : "text-[#1c1917]"
                      }`}
                    >
                      <span>{l.code === "en" ? "🇬🇧 English" : l.code === "hi" ? "🇮🇳 हिन्दी" : "🟠 ਪੰਜਾਬੀ"}</span>
                      {displayLang === l.code && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                  </div>
                  <p className="border-t border-[#f0e6cc] bg-[#fffbf1] px-4 py-2 text-[11px] text-[#6f6862]">
                    {t("nav.moreLanguages")}
                  </p>
                </div>
              </>
            )}
          </div>

          <div aria-busy={sessionChecking && !user} className="hidden min-w-[196px] items-center justify-end gap-2 sm:flex">
            {user ? (
              <>
                {sessionFailed && (
                  <button
                    type="button"
                    onClick={retrySessionCheck}
                    title={t("session.unavailable")}
                    aria-label={`${t("common.retry")}: ${t("session.unavailable")}`}
                    className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-bold text-red-700"
                  >
                    {t("common.retry")}
                  </button>
                )}
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
                  type="button"
                  onClick={() => void logout()}
                  disabled={loggingOut}
                  aria-busy={loggingOut}
                  title={logoutFailed ? t("session.logoutFailed") : undefined}
                  className="rounded-full border border-[#e9ddc3] bg-white px-3 py-2 text-[13px] font-bold text-[#6f6862] disabled:opacity-60"
                >
                  {loggingOut ? t("session.loggingOut") : t("nav.logout")}
                </button>
              </>
            ) : sessionChecking ? (
              <span role="status" aria-live="polite" className="flex items-center gap-2" data-testid="nav-session-loading">
                <span className="sr-only">{t("session.checking")}</span>
                <span aria-hidden="true" className="h-9 w-[76px] animate-pulse rounded-full bg-[#f0e6cc] motion-reduce:animate-none" />
                <span aria-hidden="true" className="h-10 w-[112px] animate-pulse rounded-full bg-[#e9ddc3] motion-reduce:animate-none" />
              </span>
            ) : sessionFailed ? (
              <>
                <span role="alert" className="max-w-[220px] text-[12.5px] font-semibold leading-tight text-red-700">
                  {t("session.unavailable")}
                </span>
                <button
                  type="button"
                  onClick={retrySessionCheck}
                  className="rounded-full bg-[#1c1917] px-3 py-2 text-[13px] font-bold text-white hover:bg-black"
                >
                  {t("common.retry")}
                </button>
              </>
            ) : (
              <>
                <Link href={loginHref} className="rounded-full px-3 py-2 text-[14px] font-bold text-[#44403c] hover:text-black">
                  {t("nav.login")}
                </Link>
                <Link
                  href={signupHref}
                  className="rounded-full bg-[#c7431f] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#a93618]"
                >
                  {t("nav.signup")}
                </Link>
              </>
            )}
          </div>

          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => (open ? closeMobileMenu(true) : setOpen(true))}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#e9ddc3] bg-white text-[18px] lg:hidden"
            aria-label={t(open ? "nav.closeMenu" : "nav.openMenu")}
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-navigation" aria-label={t("nav.primary")} className="border-t border-[#e9ddc3] bg-[#fffbf1] px-4 pb-5 pt-2 lg:hidden">
          <div className="grid gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
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
                  {sessionFailed && (
                    <div role="alert" className="col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-800">
                      <p>{t("session.unavailable")}</p>
                      <button
                        type="button"
                        onClick={retrySessionCheck}
                        className="mt-2 rounded-lg bg-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-white"
                      >
                        {t("common.retry")}
                      </button>
                    </div>
                  )}
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-[#17452e] px-4 py-3 text-center text-[15px] font-bold text-white"
                  >
                    {t("nav.dashboard")}
                  </Link>
                  <button type="button" onClick={() => void logout()} disabled={loggingOut} aria-busy={loggingOut} className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-3 text-[15px] font-bold disabled:opacity-60">
                    {loggingOut ? t("session.loggingOut") : t("nav.logout")}
                  </button>
                  <Link
                    href="/account"
                    onClick={() => setOpen(false)}
                    className="col-span-2 rounded-xl border border-[#e9ddc3] bg-white px-4 py-3 text-center text-[15px] font-bold"
                  >
                    {t("nav.account")}
                  </Link>
                </>
              ) : sessionChecking ? (
                <p role="status" aria-live="polite" className="col-span-2 rounded-xl border border-[#e9ddc3] bg-white px-4 py-3 text-center text-[14px] font-semibold text-[#6f6862]">
                  {t("session.checking")}
                </p>
              ) : sessionFailed ? (
                <div role="alert" className="col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-800">
                  <p>{t("session.unavailable")}</p>
                  <button
                    type="button"
                    onClick={retrySessionCheck}
                    className="mt-2 rounded-lg bg-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-white"
                  >
                    {t("common.retry")}
                  </button>
                </div>
              ) : (
                <>
                  <Link
                    href={loginHref}
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-3 text-center text-[15px] font-bold"
                  >
                    {t("nav.login")}
                  </Link>
                  <Link
                    href={signupHref}
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-[#c7431f] px-4 py-3 text-center text-[15px] font-bold text-white"
                  >
                    {t("nav.signup")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
    </>
  );
}
