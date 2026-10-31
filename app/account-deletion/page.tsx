import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";

export const metadata: Metadata = {
  title: "Delete Your Account",
  description: "Public instructions for permanently deleting a YaarLink account and understanding what data is removed.",
};

export default function AccountDeletionPage() {
  return <LegalPage page="account-deletion" />;
}
