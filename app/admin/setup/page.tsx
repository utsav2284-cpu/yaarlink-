"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import AdminPasswordField from "@/frontend/components/admin/AdminPasswordField";
import { useLang, type TranslationKey } from "@/frontend/i18n";
import { isAdminPasswordCompliant } from "@/shared/admin-password-policy";
import type { AdminRole } from "@/shared/admin-rbac";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const subscribeNoop = () => () => {};

type SetupKind = "owner_setup" | "admin_invitation";
type Inspection = {
  purpose: SetupKind;
  email: string;
  name: string | null;
  role: AdminRole;
  expiresAt: string;
};

const ROLE_KEYS: Record<AdminRole, TranslationKey> = {
  super_admin: "adminIdentity.role.super_admin",
  admin: "adminIdentity.role.admin",
  operations_manager: "adminIdentity.role.operations_manager",
  verification_manager: "adminIdentity.role.verification_manager",
  support_manager: "adminIdentity.role.support_manager",
  finance_manager: "adminIdentity.role.finance_manager",
  content_manager: "adminIdentity.role.content_manager",
  analyst: "adminIdentity.role.analyst",
};

function fragmentValue(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get(name) || "";
}

export default function AdminSetupPage() {
  const { t, apiError } = useLang();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [token, setToken] = useState(() => fragmentValue("token"));
  const [kind] = useState<SetupKind>(() => (fragmentValue("kind") === "admin_invitation" ? "admin_invitation" : "owner_setup"));
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
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
        const response = await fetch("/api/admin/identity/setup/inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, kind }),
        });
        const data = (await response.json().catch(() => null)) as { inspection?: Inspection } | null;
        if (!cancelled && response.ok && data?.inspection) {
          setInspection(data.inspection);
          setName((current) => current || data.inspection?.name || "");
        }
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
  }, [kind, token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isAdminPasswordCompliant(password)) {
      setError(t("adminIdentity.passwordPolicy"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/identity/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, kind, name, password }),
      });
      const data = (await response.json().catch(() => null)) as { code?: string } | null;
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setSuccess(true);
      setToken("");
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError(t("adminIdentity.actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const invalid = mounted && !checking && !inspection && !success;
  const title = inspection?.purpose === "admin_invitation" ? t("adminIdentity.setupTitleInvite") : t("adminIdentity.setupTitleOwner");

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("adminIdentity.eyebrow")}</p>
        <h1 className="font-display mt-1 text-[30px] font-black">{title}</h1>

        {success ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] p-5">
              <h2 className="text-[19px] font-black text-[#17452e]">{t("adminIdentity.setupSuccessTitle")}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#57534e]">{t("adminIdentity.setupSuccessBody")}</p>
            </div>
            <Link href="/admin/sign-in" className="mt-5 block rounded-2xl bg-[#1c1917] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-black">
              {t("adminIdentity.goToSignIn")}
            </Link>
          </div>
        ) : invalid ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="text-[18px] font-black text-red-800">{t("auth.linkInvalidTitle")}</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-red-700">{t("auth.linkInvalidBody")}</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.setupSub")}</p>
            {checking || !inspection ? (
              <p className="mt-6 rounded-2xl bg-[#fffbf1] px-4 py-3 text-[14px] font-bold text-[#6f6862]">{t("adminIdentity.linkChecking")}</p>
            ) : (
              <>
                <div className="mt-5 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4 text-[14px] leading-relaxed">
                  <p>{t("adminIdentity.setupForEmail", { email: inspection.email })}</p>
                  <p className="mt-1 font-bold">
                    {t("adminIdentity.assignedRole")}: {t(ROLE_KEYS[inspection.role])}
                  </p>
                </div>
                <form onSubmit={submit} className="mt-5 grid gap-3">
                  <label htmlFor="admin-setup-name" className="text-[13.5px] font-bold">{t("admin.name")} *</label>
                  <input id="admin-setup-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoComplete="name" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
                  <label htmlFor="admin-setup-email" className="text-[13.5px] font-bold">{t("auth.email")}</label>
                  <input id="admin-setup-email" name="email" value={inspection.email} readOnly autoComplete="username" className="rounded-xl border border-[#e9ddc3] bg-[#f7f1df] px-4 py-3 text-[#6f6862] outline-none" />
                  <label htmlFor="admin-setup-password" className="text-[13.5px] font-bold">{t("auth.password")}</label>
                  <AdminPasswordField id="admin-setup-password" name="newPassword" value={password} onChange={setPassword} onSuggest={setConfirmPassword} placeholder={t("auth.password")} />
                  <label htmlFor="admin-setup-confirm-password" className="text-[13.5px] font-bold">{t("auth.confirmPassword")}</label>
                  <AdminPasswordField id="admin-setup-confirm-password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} placeholder={t("auth.confirmPassword")} showGuidance={false} />
                  {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-bold text-red-700">{error}</p>}
                  <button disabled={!mounted || saving || !name.trim() || !isAdminPasswordCompliant(password)} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
                    {saving ? t("adminIdentity.creating") : t("adminIdentity.createButton")}
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
