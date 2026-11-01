import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/signup");

export default function SignupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
