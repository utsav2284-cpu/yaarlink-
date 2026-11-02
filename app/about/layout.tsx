import type { Metadata } from "next";
import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return canonicalMetadata("/about");
}

export default function AboutLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
