import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";
import { canonicalMetadata } from "@/config/metadata";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern accounts, listings, applications and use of YaarLink on theyaar.com.",
  ...canonicalMetadata("/terms"),
};

export default function TermsPage() {
  return <LegalPage page="terms" />;
}
