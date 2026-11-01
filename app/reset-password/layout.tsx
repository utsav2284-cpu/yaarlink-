import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/reset-password");

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
