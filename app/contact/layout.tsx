import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/contact");

export default function ContactLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
