import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import Navbar from "@/frontend/components/Navbar";
import Footer from "@/frontend/components/Footer";
import { LanguageProvider } from "@/frontend/i18n";
import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  LANGUAGE_COOKIE_SYNC_KEY,
  LANGUAGE_STORAGE_KEY,
  LOCALES,
  OPEN_GRAPH_LOCALES,
} from "@/frontend/i18n/config";
import { ROUTE_TITLE_KEYS } from "@/frontend/i18n/routes";
import { getRequestLanguage, getRequestLocaleData } from "@/frontend/i18n/server";
import { translateMessage } from "@/frontend/i18n/translate";
import { SITE } from "@/config/site";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable } from "@/backend/auth";

export async function generateMetadata(): Promise<Metadata> {
  const [lang, localeData, requestHeaders] = await Promise.all([
    getRequestLanguage(),
    getRequestLocaleData(),
    headers(),
  ]);
  const locale = LOCALES[lang];
  const translate = (key: Parameters<typeof translateMessage>[2]) =>
    translateMessage(localeData.messages, locale, key);
  const description = translate("meta.siteDescription");
  const pathname = requestHeaders.get("x-yaarlink-pathname") ?? "/";
  const routeTitleKey = ROUTE_TITLE_KEYS[pathname];
  const defaultTitle = `YaarLink · ${SITE.domain} — ${translate("foot.tagline")}`;

  return {
    metadataBase: new URL(SITE.url),
    title: routeTitleKey
      ? {
          absolute: `${translate(routeTitleKey)} · YaarLink`,
          template: `%s · ${SITE.domain}`,
        }
      : {
          default: defaultTitle,
          template: `%s · ${SITE.domain}`,
        },
    description,
    alternates: { canonical: "/" },
    openGraph: {
      title: `YaarLink · ${SITE.domain}`,
      description,
      url: "/",
      siteName: SITE.domain,
      locale: OPEN_GRAPH_LOCALES[lang],
      type: "website",
    },
  };
}

const LANGUAGE_MIGRATION_SCRIPT = `
try {
  var saved = localStorage.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)});
  if (saved === "en" || saved === "hi" || saved === "pa") {
    var cookieLang = null;
    document.cookie.split(";").forEach(function (part) {
      var pair = part.trim().split("=");
      if (pair[0] === ${JSON.stringify(LANGUAGE_COOKIE)}) {
        cookieLang = decodeURIComponent(pair.slice(1).join("=") || "");
      }
    });
    if (cookieLang !== saved) {
      document.cookie = ${JSON.stringify(`${LANGUAGE_COOKIE}=`)} + encodeURIComponent(saved) +
        "; Path=/; Max-Age=" + ${LANGUAGE_COOKIE_MAX_AGE_SECONDS} + "; SameSite=Lax" +
        (window.location.protocol === "https:" ? "; Secure" : "");
    }
    var current = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    var marker = ${JSON.stringify(LANGUAGE_COOKIE_SYNC_KEY)};
    if (saved !== current && localStorage.getItem(marker) !== saved) {
      localStorage.setItem(marker, saved);
      window.location.replace(window.location.href);
    }
  }
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The enforcing CSP uses a fresh nonce for every document request. Waiting
  // for the request makes every page render dynamically so Next can apply
  // that nonce to its inline bootstrap/RSC scripts.
  await connection();

  const [initialLang, initialLocaleData, requestHeaders] = await Promise.all([
    getRequestLanguage(),
    getRequestLocaleData(),
    headers(),
  ]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  let initialUser: { id: string } | null = null;
  let initialSessionStatus: "ready" | "error" = "ready";
  try {
    const sessionUser = await getSessionUser();
    // The navbar only needs existence/identity to choose the correct actions;
    // do not embed the user's name or email in every document response.
    initialUser = sessionUser ? { id: sessionUser.id } : null;
  } catch (error) {
    // Session-store/configuration failure is unknown state, never proof the
    // visitor is logged out. The navbar keeps its retry state in that case.
    initialSessionStatus = "error";
    if (isSessionUnavailableError(error)) logSessionUnavailable(error);
    else console.error(error);
  }

  return (
    <html lang={LOCALES[initialLang]} dir="ltr">
      <head>
        {/*
          Existing visitors may have a language only in localStorage. This
          parser-blocking migration copies that code to the SSR cookie and
          reloads before the body can paint in the wrong language. New
          choices write the cookie immediately, so this is normally a no-op.
        */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LANGUAGE_MIGRATION_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#fffbf1] text-[#1c1917] antialiased">
        <LanguageProvider initialLang={initialLang} initialLocaleData={initialLocaleData}>
          <Navbar initialUser={initialUser} initialSessionStatus={initialSessionStatus} />
          <main id="main-content" tabIndex={-1} className="min-h-[70vh]">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
