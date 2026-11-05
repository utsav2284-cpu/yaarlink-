import { notFound } from "next/navigation";
import PreviewRuntimeVerification from "@/frontend/components/admin/PreviewRuntimeVerification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPECTED_BRANCH = "arena/9b3c6e40-yaarlink";

export default function PreviewRuntimeCheckPage() {
  // Keep the temporary page out of Production and all other Preview branches.
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) {
    notFound();
  }

  return <PreviewRuntimeVerification />;
}
