import type { Metadata } from "next";
import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return canonicalMetadata("/creators");
}

export default function CreatorsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
