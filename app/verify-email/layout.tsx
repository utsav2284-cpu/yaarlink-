import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/verify-email");

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
