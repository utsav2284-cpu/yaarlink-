import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";
import { canonicalMetadata } from "@/config/metadata";

export const metadata: Metadata = {
  title: "Your Data Rights",
  description: "How to access, download, correct, withdraw or delete personal information held by YaarLink.",
  ...canonicalMetadata("/data-rights"),
};

export default function DataRightsPage() {
  return <LegalPage page="data-rights" />;
}
