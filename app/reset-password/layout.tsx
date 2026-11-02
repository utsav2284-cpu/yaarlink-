import type { Metadata } from "next";
import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return canonicalMetadata("/reset-password");
}

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
