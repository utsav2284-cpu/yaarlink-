import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/account");

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
