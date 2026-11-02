import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";
import { canonicalMetadata } from "@/config/metadata";
import { translateForRequest } from "@/frontend/i18n/server";
import { SITE } from "@/config/site";

export async function generateMetadata(): Promise<Metadata> {
  const [title, description, canonical] = await Promise.all([
    translateForRequest("legal.privacy"),
    translateForRequest("meta.privacyDescription").then((value) => value.replaceAll("{domain}", SITE.domain)),
    canonicalMetadata("/privacy"),
  ]);
  return {
    title: { absolute: `${title} · YaarLink` },
    description,
    ...canonical,
    openGraph: {
      ...canonical.openGraph,
      title: `${title} · YaarLink`,
      description,
    },
  };
}

export default function PrivacyPage() {
  return <LegalPage page="privacy" />;
}
