"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { t, apiErrorKey } = useLang();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errKey, setErrKey] = useState("");
  const [saving, setSaving] = useState(false);

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
      router.push("/dashboard");
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
        <p className="mt-1 text-[14.5px] text-[#78716c]">{t("auth.loginSub")}</p>
        <form onSubmit={submit} className="mt-5 grid gap-3">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required type="email" placeholder={t("auth.email")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required type="password" placeholder={t("auth.password")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          {errKey && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{t(errKey)}</p>}
          <button disabled={saving} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">{saving ? t("auth.loggingIn") : t("auth.loginBtn")}</button>
          <Link href="/forgot-password" className="text-center text-[14px] font-bold text-[#e4572e]">{t("auth.forgotPassword")}</Link>
        </form>
        <p className="mt-4 text-center text-[14px] text-[#78716c]">{t("auth.newHere")} <Link href="/signup" className="font-bold text-[#e4572e]">{t("auth.signup")}</Link></p>
      </div>
    </div>
  );
}
