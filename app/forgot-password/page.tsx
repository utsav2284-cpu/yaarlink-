"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useLang } from "@/frontend/i18n";
import { buildAuthPath, safeReturnTo } from "@/shared/return-to";

function ForgotPasswordContent() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const errorFor = (status: number, code?: string) => {
    if (code === "invalid_email") return t("account.errorInvalidEmail");
    if (status === 429) return t("auth.tooManyRequests");
    if (status === 503) return t("account.errorEmailUnavailable");
    return t("auth.accountActionFailed");
  };

  const requestReset = async () => {
    setErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, returnTo }),
      });
      const data = (await res.json().catch(() => null)) as { code?: string; status?: string } | null;
      if (!res.ok || data?.status !== "reset_email_requested") {
        setErr(errorFor(res.status, data?.code));
        return;
      }
      setSubmittedEmail(email.trim());
      setSent(true);
      setResendSeconds(60);
    } catch {
      setErr(t("auth.accountActionFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <h1 className="font-display text-[30px] font-black">{t("auth.forgotTitle")}</h1>

        {sent ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] p-5">
              <h2 className="text-[19px] font-black">{t("auth.resetRequestedTitle")}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#57534e]">{t("auth.resetRequestedBody")}</p>
              <p className="mt-1 break-all text-[15px] font-extrabold text-[#1c1917]">{submittedEmail}</p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[#57534e]">{t("auth.resetRequestedHelp")}</p>
            </div>
            {err && <p className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
            <button
              type="button"
              disabled={saving || resendSeconds > 0}
              onClick={requestReset}
              className="mt-5 w-full rounded-2xl bg-[#c7431f] py-3.5 text-[15.5px] font-extrabold text-white hover:bg-[#a93618] disabled:opacity-60"
            >
              {saving ? t("auth.creating") : resendSeconds > 0 ? t("auth.resendIn", { seconds: resendSeconds }) : t("auth.sendAgain")}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] leading-relaxed text-[#6f6862]">{t("auth.forgotSub")}</p>
            <form
              className="mt-5 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                requestReset();
              }}
            >
              <label htmlFor="forgot-password-email" className="sr-only">{t("auth.email")}</label>
              <input
                id="forgot-password-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                autoComplete="email"
                placeholder={t("auth.email")}
                className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]"
              />
              {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
              <button disabled={saving} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
                {saving ? t("auth.creating") : t("auth.sendResetLink")}
              </button>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-[14px]">
          <Link href={buildAuthPath("/login", { returnTo })} className="font-bold text-[#c7431f]">{t("auth.backToLogin")}</Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const { t } = useLang();
  return (
    <Suspense fallback={<div role="status" className="p-10 text-center">{t("common.loading")}</div>}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
