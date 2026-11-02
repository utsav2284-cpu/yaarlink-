import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";
import { canonicalMetadata } from "@/config/metadata";
import { translateForRequest } from "@/frontend/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [title, description, canonical] = await Promise.all([
    translateForRequest("legal.terms"),
    translateForRequest("meta.termsDescription"),
    canonicalMetadata("/terms"),
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

export default function TermsPage() {
  return <LegalPage page="terms" />;
}
