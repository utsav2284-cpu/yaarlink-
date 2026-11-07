import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The preview dashboard renders synthetic sample data only and must never be
 * indexed: it is not a real admin surface, and an indexed copy would mislead
 * anyone searching for YaarLink. robots.txt disallows it and this adds the
 * noindex header-equivalent so it stays out of results even if a crawler
 * follows a direct link.
 */
export const metadata: Metadata = {
  title: "Admin preview",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
