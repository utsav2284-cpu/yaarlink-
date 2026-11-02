import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import Navbar from "@/frontend/components/Navbar";
import Footer from "@/frontend/components/Footer";
import { LanguageProvider } from "@/frontend/i18n";
import { SessionProvider } from "@/frontend/session-context";
import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  LANGUAGE_COOKIE_SYNC_KEY,
  LANGUAGE_STORAGE_KEY,
  LOCALES,
} from "@/frontend/i18n/config";
import { getRequestLanguage, getRequestLocaleData } from "@/frontend/i18n/server";
import { translateMessage } from "@/frontend/i18n/translate";
import { SITE } from "@/config/site";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable } from "@/backend/auth";

// Local variable-font files (Fraunces and Plus Jakarta Sans, Latin subsets;
// OFL licenses sit beside them in app/fonts). Using next/font/local removes
// the render-blocking Google Fonts stylesheet, third-party font requests,
// and any build-time dependency on reaching Google Fonts.
const fraunces = localFont({
  src: "./fonts/display-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-display-face",
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

const jakartaSans = localFont({
  src: "./fonts/sans-latin.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-sans-face",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#1c1917",
};

export async function generateMetadata(): Promise<Metadata> {
  const [lang, localeData] = await Promise.all([
    getRequestLanguage(),
    getRequestLocaleData(),
  ]);
  const locale = LOCALES[lang];
  const translate = (key: Parameters<typeof translateMessage>[2]) =>
    translateMessage(localeData.messages, locale, key);
  const defaultTitle = `YaarLink · ${SITE.domain} — ${translate("foot.tagline")}`;

  // Deliberately do not set a root description, canonical, or social object:
  // every page/layout supplies its own via canonicalMetadata(), and a root
  // fallback here is what formerly made unknown and less-specific routes
  // inherit the home page's search/social identity.
  return {
    metadataBase: new URL(SITE.url),
    applicationName: SITE.name,
    title: {
      default: defaultTitle,
      template: `%s · ${SITE.name}`,
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
    <html lang={LOCALES[initialLang]} dir="ltr" className={`${fraunces.variable} ${jakartaSans.variable}`}>
      <head>
        {/*
          Existing visitors may have a language only in localStorage. This
          parser-blocking migration copies that code to the SSR cookie and
          reloads before the body can paint in the wrong language. New
          choices write the cookie immediately, so this is normally a no-op.
        */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LANGUAGE_MIGRATION_SCRIPT }} />
      </head>
      <body className="bg-[#fffbf1] text-[#1c1917] antialiased">
        <LanguageProvider initialLang={initialLang} initialLocaleData={initialLocaleData}>
          <SessionProvider initialUser={initialUser} initialStatus={initialSessionStatus}>
            <Navbar />
            <main id="main-content" tabIndex={-1} className="min-h-[70vh]">{children}</main>
            <Footer />
          </SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
