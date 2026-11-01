import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/admin");

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
