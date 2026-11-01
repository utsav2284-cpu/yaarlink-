"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const subscribeNoop = () => () => {};

export default function VerifyEmailPage() {
  const router = useRouter();
  const { t } = useLang();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
  });
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) {
      // Keep the one-time token out of the address bar/history after reading it.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [token]);

  const errorForStatus = (status: number, code?: string) => {
    if (code === "password_breached") return t("auth.passwordBreached");
    if (code === "password_breach_check_unavailable") return t("auth.passwordBreachCheckUnavailable");
    if (status === 400) return t("auth.verifyFailed");
    if (status === 429) return t("auth.tooManyRequests");
    if (status === 503) return t("auth.signupUnavailable");
    return t("auth.signupFailed");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => null)) as { user?: { id?: string }; code?: string } | null;
      if (!res.ok || !data?.user?.id) {
        setErr(errorForStatus(res.status, data?.code));
        return;
      }

      setSuccess(true);
      setPassword("");
      setToken("");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setErr(t("auth.signupFailed"));
    } finally {
      setSaving(false);
    }
  };

  const invalidToken = mounted && !TOKEN_PATTERN.test(token) && !success;

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <h1 className="font-display text-[30px] font-black">{t("auth.verifyTitle")}</h1>

        {success ? (
          <p className="mt-5 rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] px-5 py-4 text-[15px] font-bold text-[#17452e]">
            {t("auth.verifySuccess")}
          </p>
        ) : invalidToken ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-[18px] font-black text-red-800">{t("auth.verifyInvalidTitle")}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-red-700">{t("auth.verifyInvalidBody")}</p>
            </div>
            <Link href="/signup" className="mt-5 block rounded-2xl bg-[#e4572e] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-[#c7431f]">
              {t("auth.signupAgain")}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] leading-relaxed text-[#78716c]">{t("auth.verifySub")}</p>
            <form onSubmit={submit} className="mt-5 grid gap-3">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                type="password"
                minLength={10}
                maxLength={256}
                autoComplete="current-password"
                placeholder={t("auth.password")}
                className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]"
              />
              {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
              <button disabled={!mounted || saving} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
                {saving ? t("auth.verifying") : t("auth.verifyBtn")}
              </button>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-[14px] text-[#78716c]">
          {t("auth.alreadyFinished")} <Link href="/login" className="font-bold text-[#e4572e]">{t("auth.login")}</Link>
        </p>
        {!invalidToken && !success && (
          <p className="mt-2 text-center text-[14px] text-[#78716c]">
            <Link href="/signup" className="font-bold text-[#e4572e]">{t("auth.signupAgain")}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
