import type { Metadata } from "next";
import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return canonicalMetadata("/verify-email");
}

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
