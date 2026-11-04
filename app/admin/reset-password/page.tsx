"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import AdminPasswordField from "@/frontend/components/admin/AdminPasswordField";
import { useLang } from "@/frontend/i18n";
import { isAdminPasswordCompliant } from "@/shared/admin-password-policy";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const subscribeNoop = () => () => {};

type Inspection = { email: string; expiresAt: string };

function fragmentValue(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get(name) || "";
}

export default function AdminResetPasswordPage() {
  const { t, apiError } = useLang();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [token, setToken] = useState(() => fragmentValue("token"));
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [checking, setChecking] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const inspect = async () => {
      if (!TOKEN_PATTERN.test(token)) {
        setChecking(false);
        return;
      }
      try {
        const response = await fetch("/api/admin/identity/password/reset/inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const data = (await response.json().catch(() => null)) as { inspection?: Inspection } | null;
        if (!cancelled && response.ok && data?.inspection) setInspection(data.inspection);
      } catch {
        if (!cancelled) setInspection(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    void inspect();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isAdminPasswordCompliant(newPassword)) {
      setError(t("adminIdentity.passwordPolicy"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/identity/password/reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, newPassword }),
      });
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setSuccess(true);
      setToken("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError(t("adminIdentity.actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const invalid = mounted && !checking && !inspection && !success;

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("adminIdentity.eyebrow")}</p>
        <h1 className="font-display mt-1 text-[30px] font-black">{t("adminIdentity.resetTitle")}</h1>

        {success ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] p-5">
              <h2 className="text-[19px] font-black text-[#17452e]">{t("adminIdentity.resetSuccessTitle")}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#57534e]">{t("adminIdentity.resetSuccessBody")}</p>
            </div>
            <Link href="/admin/sign-in" className="mt-5 block rounded-2xl bg-[#1c1917] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-black">
              {t("adminIdentity.goToSignIn")}
            </Link>
          </div>
        ) : invalid ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-[18px] font-black text-red-800">{t("auth.linkInvalidTitle")}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-red-700">{t("auth.linkInvalidBody")}</p>
            </div>
            <Link href="/admin/forgot-password" className="mt-5 block rounded-2xl bg-[#c7431f] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-[#a93618]">
              {t("auth.requestNewLink")}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.resetSub")}</p>
            {checking || !inspection ? (
              <p className="mt-6 rounded-2xl bg-[#fffbf1] px-4 py-3 text-[14px] font-bold text-[#6f6862]">{t("adminIdentity.linkChecking")}</p>
            ) : (
              <>
                <p className="mt-5 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4 text-[14px]">
                  {t("adminIdentity.setupForEmail", { email: inspection.email })}
                </p>
                <form onSubmit={submit} className="mt-5 grid gap-3">
                  <label htmlFor="admin-reset-new-password" className="text-[13.5px] font-bold">{t("auth.newPassword")}</label>
                  <AdminPasswordField id="admin-reset-new-password" name="newPassword" value={newPassword} onChange={setNewPassword} onSuggest={setConfirmPassword} placeholder={t("auth.newPassword")} />
                  <label htmlFor="admin-reset-confirm-password" className="text-[13.5px] font-bold">{t("auth.confirmPassword")}</label>
                  <AdminPasswordField id="admin-reset-confirm-password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} placeholder={t("auth.confirmPassword")} showGuidance={false} />
                  {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-bold text-red-700">{error}</p>}
                  <button disabled={!mounted || saving || !isAdminPasswordCompliant(newPassword)} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
                    {saving ? t("adminIdentity.resetting") : t("adminIdentity.resetButton")}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
