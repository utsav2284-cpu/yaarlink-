"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLang } from "@/frontend/i18n";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const subscribeNoop = () => () => {};

export default function ResetPasswordPage() {
  const { t } = useLang();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (newPassword.length < 10 || newPassword.length > 256) {
      setErr(t("auth.passwordPolicy"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr(t("auth.passwordsDoNotMatch"));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = (await res.json().catch(() => null)) as { code?: string } | null;
      if (!res.ok) {
        if (res.status === 429) setErr(t("auth.tooManyRequests"));
        else if (data?.code === "password_policy") setErr(t("auth.passwordPolicy"));
        else if (data?.code === "password_breached") setErr(t("auth.passwordBreached"));
        else if (data?.code === "password_breach_check_unavailable") setErr(t("auth.passwordBreachCheckUnavailable"));
        else setErr(t("auth.resetFailed"));
        return;
      }
      setSuccess(true);
      setToken("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setErr(t("auth.resetFailed"));
    } finally {
      setSaving(false);
    }
  };

  const invalidToken = mounted && !TOKEN_PATTERN.test(token) && !success;

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <h1 className="font-display text-[30px] font-black">{t("auth.resetTitle")}</h1>

        {success ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] p-5">
              <h2 className="text-[19px] font-black text-[#17452e]">{t("auth.resetSuccessTitle")}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#57534e]">{t("auth.resetSuccessBody")}</p>
            </div>
            <Link href="/login" className="mt-5 block rounded-2xl bg-[#1c1917] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-black">
              {t("auth.login")}
            </Link>
          </div>
        ) : invalidToken ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-[18px] font-black text-red-800">{t("auth.linkInvalidTitle")}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-red-700">{t("auth.linkInvalidBody")}</p>
            </div>
            <Link href="/forgot-password" className="mt-5 block rounded-2xl bg-[#e4572e] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-[#c7431f]">
              {t("auth.requestNewLink")}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] leading-relaxed text-[#78716c]">{t("auth.resetSub")}</p>
            <form onSubmit={submit} className="mt-5 grid gap-3">
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required type="password" minLength={10} maxLength={256} autoComplete="new-password" placeholder={t("auth.newPassword")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required type="password" minLength={10} maxLength={256} autoComplete="new-password" placeholder={t("auth.confirmPassword")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <p className="text-[13px] text-[#78716c]">{t("auth.passwordPolicy")}</p>
              {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
              <button disabled={!mounted || saving} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
                {saving ? t("auth.resetting") : t("auth.resetBtn")}
              </button>
            </form>
          </>
        )}

        {!success && (
          <p className="mt-5 text-center text-[14px]">
            <Link href="/login" className="font-bold text-[#e4572e]">{t("auth.backToLogin")}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
