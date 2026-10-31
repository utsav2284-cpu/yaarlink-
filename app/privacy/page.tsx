import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How YaarLink collects, uses, shares and protects personal information on theyaar.com.",
};

export default function PrivacyPage() {
  return <LegalPage page="privacy" />;
}
