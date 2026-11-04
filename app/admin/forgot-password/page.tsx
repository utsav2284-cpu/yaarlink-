"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/frontend/i18n";

export default function AdminForgotPasswordPage() {
  const { t, apiError } = useLang();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/admin/identity/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("adminIdentity.actionFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("adminIdentity.eyebrow")}</p>
        <h1 className="font-display mt-1 text-[30px] font-black">{t("adminIdentity.forgotTitle")}</h1>
        <p className="mt-1 text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.forgotSub")}</p>

        {sent ? (
          <div className="mt-6 rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] p-5">
            <h2 className="text-[19px] font-black text-[#17452e]">{t("adminIdentity.resetRequestedTitle")}</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[#57534e]">{t("adminIdentity.resetRequestedBody")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-3">
            <label htmlFor="admin-forgot-email" className="text-[13.5px] font-bold">{t("auth.email")}</label>
            <input id="admin-forgot-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-bold text-red-700">{error}</p>}
            <button disabled={sending} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
              {sending ? t("adminIdentity.forgotSending") : t("adminIdentity.forgotButton")}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-[14px]">
          <Link href="/admin/sign-in" className="font-bold text-[#c7431f]">{t("auth.backToLogin")}</Link>
        </p>
      </div>
    </div>
  );
}
