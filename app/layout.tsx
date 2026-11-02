import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "./globals.css";
import Navbar from "@/frontend/components/Navbar";
import Footer from "@/frontend/components/Footer";
import { LanguageProvider } from "@/frontend/i18n";
import { SITE } from "@/config/site";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable } from "@/backend/auth";

const description =
  "Connect brands, local businesses, creators, meme pages and communities. Simple marketing in English, Hindi & Punjabi.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `YaarLink · ${SITE.domain} — Simple marketing for everyone`,
    template: `%s · ${SITE.domain}`,
  },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: `YaarLink · ${SITE.domain}`,
    description,
    url: "/",
    siteName: SITE.domain,
    locale: "en_IN",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The enforcing CSP uses a fresh nonce for every document request. Waiting
  // for the request makes every page render dynamically so Next can apply
  // that nonce to its inline bootstrap/RSC scripts.
  await connection();

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#fffbf1] text-[#1c1917] antialiased">
        <LanguageProvider>
          <Navbar initialUser={initialUser} initialSessionStatus={initialSessionStatus} />
          <main id="main-content" tabIndex={-1} className="min-h-[70vh]">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
