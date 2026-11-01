import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";
import { canonicalMetadata } from "@/config/metadata";

export const metadata: Metadata = {
  title: "Payments, Cancellation & Refunds",
  description: "How campaign budgets, separately agreed paid services, cancellations and refunds work on YaarLink.",
  ...canonicalMetadata("/refund-policy"),
};

export default function RefundPolicyPage() {
  return <LegalPage page="refunds" />;
}
