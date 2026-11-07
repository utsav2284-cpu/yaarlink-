"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Shared recovery screen for the app-level and root-level error boundaries.
 *
 * Next.js ships an unstyled default boundary, so before this file any uncaught
 * render error in the client tree dropped the visitor onto bare browser text
 * with no branding, no navigation and no way back. The copy deliberately does
 * not blame the visitor and does not print the raw error message: server
 * errors in production carry only an opaque digest.
 */
export default function ErrorRecovery({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLang();

  useEffect(() => {
    // Keep a correlation hook for client-side logging without exposing the
    // message to the visitor. The digest is what the server log records.
    console.error("client_render_error", { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4 py-16 text-center">
      <div>
        <p className="font-display text-[64px] font-black leading-none text-[#c7431f]">!</p>
        <h1 className="font-display mt-3 text-[28px] font-black">{t("nf.errorTitle")}</h1>
        <p className="mt-2 text-[16px] text-[#57534e]">{t("nf.errorBody")}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl bg-[#1c1917] px-6 py-3.5 text-[15px] font-bold text-white"
          >
            {t("nf.errorRetry")}
          </button>
          <Link href="/" className="rounded-2xl border border-[#e9ddc3] bg-white px-6 py-3.5 text-[15px] font-bold">
            {t("nf.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
