import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";

export const metadata: Metadata = {
  title: "Your Data Rights",
  description: "How to access, download, correct, withdraw or delete personal information held by YaarLink.",
};

export default function DataRightsPage() {
  return <LegalPage page="data-rights" />;
}
