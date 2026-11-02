import type { Metadata } from "next";
import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return canonicalMetadata("/how-it-works");
}

export default function HowItWorksLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
