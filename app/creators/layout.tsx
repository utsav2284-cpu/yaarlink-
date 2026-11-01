import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/creators");

export default function CreatorsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
