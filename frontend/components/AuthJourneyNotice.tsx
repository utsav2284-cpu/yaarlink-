"use client";

import Link from "next/link";
import { useLang, type TranslationKey } from "@/frontend/i18n";
import type { SessionLoadStatus, SessionUserSummary } from "@/frontend/session";
import { buildAuthPath } from "@/shared/return-to";
import type { UserRole } from "@/shared/user-roles";

export default function AuthJourneyNotice({
  status,
  user,
  messageKey,
  returnTo,
  role,
  onRetry,
  forceGuest = false,
  id,
}: {
  status: SessionLoadStatus;
  user: SessionUserSummary | null;
  messageKey: TranslationKey;
  returnTo: string;
  role: UserRole;
  onRetry: () => void;
  forceGuest?: boolean;
  id?: string;
}) {
  const { t } = useLang();

  if (user && !forceGuest) return null;

  if (status === "loading" && !forceGuest) {
    return (
      <div id={id} role="status" aria-live="polite" className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 text-[13.5px] font-bold text-[#6f6862]">
        {t("session.checking")}
      </div>
    );
  }

  if (status === "error" && !forceGuest) {
    return (
      <div id={id} role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-800">
        <p>{t("session.unavailable")}</p>
        <button type="button" onClick={onRetry} className="mt-2 rounded-lg bg-[#1c1917] px-3 py-1.5 text-[12.5px] font-bold text-white">
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div id={id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-[14.5px] font-extrabold text-amber-950">{t("authFlow.loginRequiredTitle")}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-[#57534e]">{t(messageKey)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={buildAuthPath("/login", { returnTo, role })} className="rounded-xl bg-[#1c1917] px-4 py-2.5 text-[13.5px] font-extrabold text-white hover:bg-black">
          {t("auth.login")}
        </Link>
        <Link href={buildAuthPath("/signup", { returnTo, role })} className="rounded-xl bg-[#c7431f] px-4 py-2.5 text-[13.5px] font-extrabold text-white hover:bg-[#a93618]">
          {t("auth.signup")}
        </Link>
      </div>
    </div>
  );
}
