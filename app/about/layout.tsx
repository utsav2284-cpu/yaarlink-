import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/about");

export default function AboutLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
