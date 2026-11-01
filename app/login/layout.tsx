import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/login");

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
