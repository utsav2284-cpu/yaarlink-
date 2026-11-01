import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/campaigns");

export default function CampaignsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
