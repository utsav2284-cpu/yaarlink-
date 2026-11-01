"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";

type SignupForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
};

export default function SignupPage() {
  const { t } = useLang();
  const [form, setForm] = useState<SignupForm>({ name: "", email: "", phone: "", password: "", role: "brand" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const set = (k: keyof SignupForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const errorForStatus = (status: number, code?: string) => {
    if (code === "password_breached") return t("auth.passwordBreached");
    if (code === "password_policy") return t("auth.passwordPolicy");
    if (code === "password_breach_check_unavailable") return t("auth.passwordBreachCheckUnavailable");
    if (code === "legal_consent_required") return t("auth.legalConsentRequired");
    if (status === 400) return t("auth.signupInvalid");
    if (status === 429) return t("auth.tooManyRequests");
    if (status === 503) return t("auth.signupUnavailable");
    return t("auth.signupFailed");
  };

  const requestVerification = async () => {
    if (!acceptedLegal) {
      setErr(t("auth.legalConsentRequired"));
      return;
    }
    setErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, legalConsent: acceptedLegal }),
      });
      const data = (await res.json().catch(() => null)) as { status?: string; code?: string } | null;
      if (!res.ok || data?.status !== "verification_required") {
        setErr(errorForStatus(res.status, data?.code));
        return;
      }

      // This response is intentionally identical for new and existing email
      // addresses. It never means "account created" by itself.
      setSubmittedEmail(form.email.trim());
      setSent(true);
      setResendSeconds(60);
    } catch {
      setErr(t("auth.signupFailed"));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestVerification();
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <h1 className="font-display text-[30px] font-black">{t("auth.signupTitle")}</h1>
        <p className="mt-1 text-[14.5px] text-[#78716c]">{t("auth.signupSub")}</p>

        {sent ? (
          <div className="mt-6">
            <div className="rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] p-5">
              <h2 className="text-[19px] font-black">{t("auth.checkEmailTitle")}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#57534e]">{t("auth.checkEmailBody")}</p>
              <p className="mt-1 break-all text-[15px] font-extrabold text-[#1c1917]">{submittedEmail}</p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[#57534e]">{t("auth.checkEmailHelp")}</p>
            </div>

            {err && (
              <p className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>
            )}

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                disabled={saving || resendSeconds > 0}
                onClick={requestVerification}
                className="rounded-2xl bg-[#e4572e] py-3.5 text-[15.5px] font-extrabold text-white hover:bg-[#c7431f] disabled:opacity-60"
              >
                {saving
                  ? t("auth.creating")
                  : resendSeconds > 0
                    ? `${t("auth.resendIn")} ${resendSeconds}s`
                    : t("auth.resendVerification")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErr("");
                  setSent(false);
                }}
                className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] py-3 text-[15px] font-extrabold text-[#1c1917] hover:border-[#1c1917]"
              >
                {t("auth.editDetails")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {(["brand", "creator"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("role", r)}
                  className={`rounded-2xl border-2 p-4 text-left ${form.role === r ? "border-[#e4572e] bg-[#fff4de]" : "border-[#f0e6cc] bg-[#fffbf1]"}`}
                >
                  <p className="text-[22px]">{r === "brand" ? "🏪" : "🎥"}</p>
                  <p className="mt-1 text-[15px] font-extrabold capitalize">{t(r === "brand" ? "auth.brand" : "auth.creator")}</p>
                  <p className="text-[12.5px] text-[#78716c]">{r === "brand" ? t("auth.brandHint") : t("auth.creatorHint")}</p>
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="mt-5 grid gap-3">
              <input value={form.name} onChange={(e) => set("name", e.target.value)} required autoComplete="name" placeholder={form.role === "brand" ? t("auth.nameBrand") : t("auth.nameCreator")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <input value={form.email} onChange={(e) => set("email", e.target.value)} required type="email" autoComplete="email" placeholder={t("auth.email")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder={t("auth.phone")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <input value={form.password} onChange={(e) => set("password", e.target.value)} required type="password" minLength={10} maxLength={256} autoComplete="new-password" placeholder={t("auth.pwHint")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <label htmlFor="signup-legal-consent" className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 text-[13.5px] font-semibold leading-relaxed text-[#57534e]">
                <input
                  id="signup-legal-consent"
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(e) => setAcceptedLegal(e.target.checked)}
                  required
                  className="mt-1 h-4 w-4 shrink-0 accent-[#e4572e]"
                />
                <span>
                  {t("auth.legalConsentStart")}{" "}
                  <Link href="/terms" target="_blank" rel="noreferrer" className="font-extrabold text-[#e4572e] underline-offset-2 hover:underline">
                    {t("legal.terms")}
                  </Link>{" "}
                  {t("auth.legalConsentAnd")}{" "}
                  <Link href="/privacy" target="_blank" rel="noreferrer" className="font-extrabold text-[#e4572e] underline-offset-2 hover:underline">
                    {t("legal.privacy")}
                  </Link>{" "}
                  {t("auth.legalConsentEnd")}
                </span>
              </label>
              {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
              <button disabled={saving} className="rounded-2xl bg-[#e4572e] py-3.5 text-[16px] font-extrabold text-white hover:bg-[#c7431f] disabled:opacity-60">{saving ? t("auth.creating") : t("auth.signupBtn")}</button>
            </form>
          </>
        )}

        <p className="mt-4 text-center text-[14px] text-[#78716c]">{t("auth.haveAccount")} <Link href="/login" className="font-bold text-[#e4572e]">{t("auth.login")}</Link></p>
      </div>
    </div>
  );
}
