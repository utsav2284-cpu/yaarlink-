"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { fetchSessionUser } from "@/frontend/session";
import { buildAuthPath, DEFAULT_RETURN_TO, safeReturnTo } from "@/shared/return-to";
import { primaryUserRole, type UserRole } from "@/shared/user-roles";

type SignupForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
};

function SignupContent() {
  const { t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const initialRole = primaryUserRole(searchParams.get("role"));
  const [form, setForm] = useState<SignupForm>({ name: "", email: "", phone: "", password: "", role: initialRole });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const set = <K extends keyof SignupForm>(k: K, v: SignupForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let active = true;
    fetchSessionUser()
      .then((user) => {
        if (active && user) router.replace(returnTo);
      })
      .catch(() => {
        // Keep signup available if only the optional session probe fails.
      });
    return () => {
      active = false;
    };
  }, [returnTo, router]);

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
        body: JSON.stringify({ ...form, legalConsent: acceptedLegal, returnTo }),
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
        <p className="mt-1 text-[14.5px] text-[#6f6862]">{t("auth.signupSub")}</p>
        {returnTo !== DEFAULT_RETURN_TO && (
          <p role="status" className="mt-4 rounded-xl border border-[#bfe3c5] bg-[#f2fbf3] px-4 py-3 text-[13.5px] font-bold text-[#17452e]">
            {t("authFlow.returnAfterLogin")}
          </p>
        )}

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
                className="rounded-2xl bg-[#c7431f] py-3.5 text-[15.5px] font-extrabold text-white hover:bg-[#a93618] disabled:opacity-60"
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
                  aria-pressed={form.role === r}
                  className={`rounded-2xl border-2 p-4 text-left ${form.role === r ? "border-[#c7431f] bg-[#fff4de]" : "border-[#f0e6cc] bg-[#fffbf1]"}`}
                >
                  <p aria-hidden="true" className="text-[22px]">{r === "brand" ? "🏪" : "🎥"}</p>
                  <p className="mt-1 text-[15px] font-extrabold capitalize">{t(r === "brand" ? "auth.brand" : "auth.creator")}</p>
                  <p className="text-[12.5px] text-[#6f6862]">{r === "brand" ? t("auth.brandHint") : t("auth.creatorHint")}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-[#fff4de] px-4 py-3 text-[13px] font-semibold leading-relaxed text-[#6b4d12]">
              {t("authFlow.accountBothHint")}
            </p>
            <form onSubmit={submit} className="mt-5 grid gap-3">
              <label htmlFor="signup-name" className="sr-only">{form.role === "brand" ? t("auth.nameBrand") : t("auth.nameCreator")}</label>
              <input id="signup-name" value={form.name} onChange={(e) => set("name", e.target.value)} required autoComplete="name" placeholder={form.role === "brand" ? t("auth.nameBrand") : t("auth.nameCreator")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <label htmlFor="signup-email" className="sr-only">{t("auth.email")}</label>
              <input id="signup-email" value={form.email} onChange={(e) => set("email", e.target.value)} required type="email" autoComplete="email" placeholder={t("auth.email")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <label htmlFor="signup-phone" className="sr-only">{t("auth.phone")}</label>
              <input id="signup-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder={t("auth.phone")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <label htmlFor="signup-password" className="sr-only">{t("auth.password")}</label>
              <input id="signup-password" value={form.password} onChange={(e) => set("password", e.target.value)} required type="password" minLength={10} maxLength={256} autoComplete="new-password" placeholder={t("auth.pwHint")} className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
              <label htmlFor="signup-legal-consent" className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 text-[13.5px] font-semibold leading-relaxed text-[#57534e]">
                <input
                  id="signup-legal-consent"
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(e) => setAcceptedLegal(e.target.checked)}
                  required
                  className="mt-1 h-4 w-4 flex-none accent-[#c7431f]"
                />
                <span className="min-w-0 flex-1">
                  {t("auth.legalConsentStart")}{" "}
                  <Link href="/terms" target="_blank" rel="noreferrer" className="font-extrabold text-[#c7431f] underline-offset-2 hover:underline">
                    {t("legal.terms")}
                  </Link>{" "}
                  {t("auth.legalConsentAnd")}{" "}
                  <Link href="/privacy" target="_blank" rel="noreferrer" className="font-extrabold text-[#c7431f] underline-offset-2 hover:underline">
                    {t("legal.privacy")}
                  </Link>{" "}
                  {t("auth.legalConsentEnd")}
                </span>
              </label>
              {err && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
              <button disabled={saving} className="rounded-2xl bg-[#c7431f] py-3.5 text-[16px] font-extrabold text-white hover:bg-[#a93618] disabled:opacity-60">{saving ? t("auth.creating") : t("auth.signupBtn")}</button>
            </form>
          </>
        )}

        <p className="mt-4 text-center text-[14px] text-[#6f6862]">{t("auth.haveAccount")} <Link href={buildAuthPath("/login", { returnTo, role: form.role })} className="font-bold text-[#c7431f]">{t("auth.login")}</Link></p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const { t } = useLang();
  return (
    <Suspense fallback={<div role="status" className="p-10 text-center">{t("common.loading")}</div>}>
      <SignupContent />
    </Suspense>
  );
}
