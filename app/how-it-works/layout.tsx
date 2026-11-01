import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/how-it-works");

export default function HowItWorksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
