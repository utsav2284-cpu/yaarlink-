import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Every admin route is behind AAL2 authentication and is not part of the public
 * index. robots.txt now disallows /admin, but robots.txt is only a request:
 * a crawler that learns the URL from a referrer, an error page or a pasted link
 * may still fetch and index it. This layout adds an explicit noindex so the
 * whole admin surface stays out of search results regardless of discovery path.
 */
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
