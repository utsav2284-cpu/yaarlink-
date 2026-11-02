import type { Metadata } from "next";
import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return canonicalMetadata("/login");
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
