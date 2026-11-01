import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Navbar from "@/frontend/components/Navbar";
import Footer from "@/frontend/components/Footer";
import { LanguageProvider } from "@/frontend/i18n";
import { SITE } from "@/config/site";

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

export default function RootLayout({ children }: { children: ReactNode }) {
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
          <Navbar />
          <main className="min-h-[70vh]">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
