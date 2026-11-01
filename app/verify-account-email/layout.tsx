import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/verify-account-email");

export default function VerifyAccountEmailLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
