"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/frontend/i18n";
import { fetchSessionUser } from "@/frontend/session";
import { buildAuthPath, DEFAULT_RETURN_TO, safeReturnTo } from "@/shared/return-to";
import { normalizeUserRole } from "@/shared/user-roles";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, apiErrorKey } = useLang();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const requestedRole = normalizeUserRole(searchParams.get("role"));
  const [form, setForm] = useState({ email: "", password: "" });
  const [errKey, setErrKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSessionUser()
      .then((user) => {
        if (active && user) router.replace(returnTo);
      })
      .catch(() => {
        // An unavailable session service should not prevent showing the form.
      });
    return () => {
      active = false;
    };
  }, [returnTo, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrKey("");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrKey(apiErrorKey(res.status, d?.code, "api.wrongCredentials"));
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch {
      setErrKey("api.network");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <h1 className="font-display text-[30px] font-black">{t("auth.loginTitle")}</h1>
        <p className="mt-1 text-[14.5px] text-[#6f6862]">{t("auth.loginSub")}</p>
        {returnTo !== DEFAULT_RETURN_TO && (
          <p role="status" className="mt-4 rounded-xl border border-[#bfe3c5] bg-[#f2fbf3] px-4 py-3 text-[13.5px] font-bold text-[#17452e]">
            {t("authFlow.returnAfterLogin")}
          </p>
        )}
        <form onSubmit={submit} className="mt-5 grid gap-3">
          <label htmlFor="login-email" className="sr-only">{t("auth.email")}</label>
          <input id="login-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required type="email" placeholder={t("auth.email")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          <label htmlFor="login-password" className="sr-only">{t("auth.password")}</label>
          <input id="login-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required type="password" maxLength={256} autoComplete="current-password" placeholder={t("auth.password")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          {errKey && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{t(errKey)}</p>}
          <button disabled={saving} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">{saving ? t("auth.loggingIn") : t("auth.loginBtn")}</button>
          <Link href={buildAuthPath("/forgot-password", { returnTo })} className="text-center text-[14px] font-bold text-[#c7431f]">{t("auth.forgotPassword")}</Link>
        </form>
        <p className="mt-4 text-center text-[14px] text-[#6f6862]">{t("auth.newHere")} <Link href={buildAuthPath("/signup", { returnTo, role: requestedRole ?? undefined })} className="font-bold text-[#c7431f]">{t("auth.signup")}</Link></p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useLang();
  return (
    <Suspense fallback={<div role="status" className="p-10 text-center">{t("common.loading")}</div>}>
      <LoginContent />
    </Suspense>
  );
}
