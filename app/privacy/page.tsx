import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";
import { canonicalMetadata } from "@/config/metadata";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How YaarLink collects, uses, shares and protects personal information on theyaar.com.",
  ...canonicalMetadata("/privacy"),
};

export default function PrivacyPage() {
  return <LegalPage page="privacy" />;
}
