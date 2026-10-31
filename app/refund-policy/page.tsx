import type { Metadata } from "next";
import LegalPage from "@/frontend/components/LegalPage";

export const metadata: Metadata = {
  title: "Payments, Cancellation & Refunds",
  description: "How campaign budgets, separately agreed paid services, cancellations and refunds work on YaarLink.",
};

export default function RefundPolicyPage() {
  return <LegalPage page="refunds" />;
}
