import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/dashboard");

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
