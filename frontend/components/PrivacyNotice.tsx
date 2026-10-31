"use client";

import Link from "next/link";
import { useLang } from "@/frontend/i18n";

type PrivacyNoticeProps = {
  textKey: string;
  className?: string;
  compact?: boolean;
};

/**
 * Short, just-in-time explanation shown before a form collects or shares
 * personal data. It always links to the full Privacy Policy.
 */
export default function PrivacyNotice({ textKey, className = "", compact = false }: PrivacyNoticeProps) {
  const { t } = useLang();

  return (
    <div
      role="note"
      className={`rounded-xl border border-[#d9e8dc] bg-[#f2fbf3] text-[#36513c] ${
        compact ? "px-3 py-2 text-[12px] leading-relaxed" : "px-4 py-3 text-[13.5px] leading-relaxed"
      } ${className}`}
    >
      <p>
        <span aria-hidden="true" className="mr-1.5">🔒</span>
        {t(textKey)}{" "}
        <Link href="/privacy" className="font-extrabold text-[#17452e] underline decoration-2 underline-offset-2 hover:text-black">
          {t("legal.privacy")}
        </Link>
      </p>
    </div>
  );
}
