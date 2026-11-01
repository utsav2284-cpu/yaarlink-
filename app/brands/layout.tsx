import type { ReactNode } from "react";
import { canonicalMetadata } from "@/config/metadata";

export const metadata = canonicalMetadata("/brands");

export default function BrandsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
