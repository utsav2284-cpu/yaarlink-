"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/frontend/i18n";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerifiedAt: string | null;
  createdAt: string;
};

type AccountSession = {
  id: string;
  current: boolean;
  browser: string | null;
  os: string | null;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

type PendingEmailChange = { email: string; expiresAt: string } | null;

type AccountData = {
  user: AccountUser;
  sessions: AccountSession[];
  pendingEmailChange: PendingEmailChange;
};

type ApiData = {
  code?: string;
  status?: string;
  revokedCount?: number;
};

const inputClass = "w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 text-[14px] outline-none focus:border-[#1c1917]";
const labelClass = "grid gap-1.5 text-[13.5px] font-bold";
const primaryButtonClass = "rounded-2xl bg-[#1c1917] px-5 py-3 text-[14.5px] font-extrabold text-white hover:bg-black disabled:opacity-60";
const secondaryButtonClass = "rounded-2xl border border-[#e9ddc3] bg-white px-5 py-3 text-[14.5px] font-extrabold text-[#1c1917] hover:border-[#1c1917] disabled:opacity-60";

/** Marks an already-localized message that is safe to show; other exceptions stay hidden. */
class ActionError extends Error {}

function Section({ title, help, children, danger = false }: { title: string; help?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={`rounded-[24px] border bg-white p-6 card-shadow ${danger ? "border-red-200" : "border-[#e9ddc3]"}`}>
      <h2 className={`text-[20px] font-black ${danger ? "text-red-800" : "text-[#1c1917]"}`}>{title}</h2>
      {help && <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{help}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { t, formatDateTime: formatDate } = useLang();
  const [data, setData] = useState<AccountData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const [emailForm, setEmailForm] = useState({ newEmail: "", currentPassword: "" });
  const [phoneForm, setPhoneForm] = useState({ phone: "", currentPassword: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [exportPassword, setExportPassword] = useState("");
  const [deleteForm, setDeleteForm] = useState({ currentPassword: "", confirmationEmail: "" });

  const applyData = useCallback((d: AccountData) => {
    setData(d);
    setPhoneForm({ phone: d.user.phone ?? "", currentPassword: "" });
  }, []);

  const fetchAccount = useCallback(async (): Promise<AccountData | null> => {
    const res = await fetch("/api/me/account", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/login");
      return null;
    }
    const d = (await res.json().catch(() => null)) as AccountData | null;
    if (!res.ok || !d?.user) throw new Error("load_failed");
    return d;
  }, [router]);

  const refresh = useCallback(async () => {
    const d = await fetchAccount();
    if (d) applyData(d);
  }, [applyData, fetchAccount]);

  useEffect(() => {
    fetchAccount()
      .then((d) => {
        if (d) applyData(d);
      })
      .catch(() => setLoadFailed(true));
  }, [applyData, fetchAccount]);

  useEffect(() => {
    if (!data) return;
    const targetId = window.location.hash.slice(1);
    if (targetId !== "export-data" && targetId !== "delete-account") return;
    document.getElementById(targetId)?.scrollIntoView({ block: "start" });
  }, [data]);

  const errorMessage = useCallback(
    (status: number, code?: string) => {
      if (status === 401) return t("account.errorUnauthorized");
      if (status === 429) return t("auth.tooManyRequests");
      switch (code) {
        case "wrong_password":
          return t("account.errorWrongPassword");
        case "current_password_required":
          return t("account.errorCurrentPasswordRequired");
        case "invalid_email":
          return t("account.errorInvalidEmail");
        case "email_unchanged":
          return t("account.errorEmailUnchanged");
        case "email_unavailable":
          return t("account.errorEmailUnavailable");
        case "invalid_phone":
          return t("account.errorInvalidPhone");
        case "password_policy":
          return t("auth.passwordPolicy");
        case "password_breached":
          return t("auth.passwordBreached");
        case "password_breach_check_unavailable":
          return t("auth.passwordBreachCheckUnavailable");
        case "same_password":
          return t("account.errorSamePassword");
        case "session_not_found":
          return t("account.errorSessionNotFound");
        case "current_session":
          return t("account.errorCurrentSession");
        case "confirmation_mismatch":
          return t("account.errorConfirmationMismatch");
        default:
          return t("account.actionFailed");
      }
    },
    [t],
  );

  const run = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setNotice("");
    setActionError("");
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof ActionError ? e.message : t("account.actionFailed"));
    } finally {
      setBusyKey("");
    }
  };

  const patchAccount = async (body: Record<string, unknown>): Promise<ApiData> => {
    const res = await fetch("/api/me/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await res.json().catch(() => null)) as ApiData | null;
    if (!res.ok) throw new ActionError(errorMessage(res.status, d?.code));
    return d ?? {};
  };


  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 text-center card-shadow">
          {loadFailed ? (
            <>
              <p className="text-[16px] font-bold text-red-700">{t("account.loadFailed")}</p>
              <button onClick={() => window.location.reload()} className={`${primaryButtonClass} mt-5`}>{t("account.retry")}</button>
            </>
          ) : (
            <p className="text-[16px] font-bold text-[#6f6862]">{t("account.loading")}</p>
          )}
        </div>
      </div>
    );
  }

  const { user, sessions, pendingEmailChange } = data;
  const otherSessions = sessions.filter((session) => !session.current);
  const roleLabel = user.role === "creator" ? t("dash.creatorAccount") : t("dash.brandAccount");

  const sendVerification = () =>
    run("verify-email", async () => {
      const result = await patchAccount({ action: "request_email_verification" });
      setNotice(result.status === "already_sent" ? t("account.alreadySent") : t("account.verificationSent"));
      await refresh();
    });

  const submitEmailChange = (e: React.FormEvent) => {
    e.preventDefault();
    run("change-email", async () => {
      if (emailForm.newEmail.trim().toLowerCase() === user.email) throw new ActionError(t("account.errorEmailUnchanged"));
      const result = await patchAccount({ action: "request_email_change", ...emailForm });
      setNotice(result.status === "already_sent" ? t("account.alreadySent") : t("account.emailChangeSent"));
      setEmailForm((f) => ({ ...f, currentPassword: "" }));
      await refresh();
    });
  };

  const cancelEmailChange = () =>
    run("cancel-email-change", async () => {
      await patchAccount({ action: "cancel_email_change" });
      setNotice(t("account.emailChangeCancelled"));
      await refresh();
    });

  const submitPhone = (e: React.FormEvent) => {
    e.preventDefault();
    run("change-phone", async () => {
      await patchAccount({ action: "change_phone", ...phoneForm });
      setNotice(t("account.phoneSaved"));
      await refresh();
    });
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    run("change-password", async () => {
      if (passwordForm.newPassword.length < 10 || passwordForm.newPassword.length > 256) {
        throw new ActionError(t("auth.passwordPolicy"));
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new ActionError(t("auth.passwordsDoNotMatch"));
      }
      await patchAccount({
        action: "change_password",
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice(t("account.passwordSaved"));
      await refresh();
    });
  };

  const revokeSession = (session: AccountSession) => {
    if (!window.confirm(t("account.confirmRevokeSession"))) return;
    run(`revoke:${session.id}`, async () => {
      await patchAccount({ action: "revoke_session", sessionId: session.id });
      setNotice(t("account.sessionRevoked"));
      await refresh();
    });
  };

  const revokeOthers = () => {
    if (!window.confirm(t("account.confirmRevokeOthers"))) return;
    run("revoke-others", async () => {
      const result = await patchAccount({ action: "revoke_other_sessions" });
      setNotice(result.revokedCount ? t("account.otherSessionsRevoked") : t("account.noOtherSessions"));
      await refresh();
    });
  };

  const exportData = (e: React.FormEvent) => {
    e.preventDefault();
    run("export", async () => {
      const res = await fetch("/api/me/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: exportPassword }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as ApiData | null;
        throw new ActionError(errorMessage(res.status, d?.code));
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `yaarlink-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExportPassword("");
      setNotice(t("account.exportReady"));
    });
  };

  const deleteAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteForm.confirmationEmail.trim().toLowerCase() !== user.email) {
      setNotice("");
      setActionError(t("account.errorConfirmationMismatch"));
      return;
    }
    if (!window.confirm(t("account.confirmDelete"))) return;
    run("delete-account", async () => {
      const res = await fetch("/api/me/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deleteForm),
      });
      const d = (await res.json().catch(() => null)) as ApiData | null;
      if (!res.ok) throw new ActionError(errorMessage(res.status, d?.code));
      router.push("/");
      router.refresh();
    });
  };

  const deviceLabel = (session: AccountSession) => {
    if (session.browser && session.os) return `${session.browser} ${t("account.deviceOn")} ${session.os}`;
    return session.browser ?? session.os ?? t("account.unknownDevice");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/dashboard" className="text-[14px] font-bold text-[#c7431f]">{t("account.backDashboard")}</Link>
      <div className="mt-3">
        <h1 className="font-display text-[34px] font-black sm:text-[42px]">{t("account.title")}</h1>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[#6f6862]">{t("account.subtitle")}</p>
      </div>

      <nav aria-label={t("legal.navLabel")} className="mt-4 flex flex-wrap gap-2 text-[13.5px] font-extrabold">
        <Link href="/privacy" className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 hover:border-[#1c1917]">{t("legal.privacy")}</Link>
        <Link href="/terms" className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 hover:border-[#1c1917]">{t("legal.terms")}</Link>
        <Link href="/data-rights" className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 hover:border-[#1c1917]">{t("legal.dataRights")}</Link>
        <Link href="/account-deletion" className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 hover:border-[#1c1917]">{t("legal.accountDeletion")}</Link>
      </nav>

      {notice && <p role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[14px] font-bold text-green-800">{notice}</p>}
      {actionError && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-700">{actionError}</p>}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
        <Section title={t("account.overview")}>
          <dl className="grid gap-3 text-[14.5px]">
            <div className="flex justify-between gap-4 border-b border-[#f0e6cc] pb-3">
              <dt className="font-bold text-[#6f6862]">{t("account.name")}</dt>
              <dd className="text-right font-extrabold">{user.name}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-[#f0e6cc] pb-3">
              <dt className="font-bold text-[#6f6862]">{t("account.role")}</dt>
              <dd className="text-right font-extrabold">{roleLabel}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-[#f0e6cc] pb-3">
              <dt className="font-bold text-[#6f6862]">{t("brand.email")}</dt>
              <dd className="break-all text-right font-extrabold">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-[#f0e6cc] pb-3">
              <dt className="font-bold text-[#6f6862]">{t("auth.phone")}</dt>
              <dd className="text-right font-extrabold">{user.phone || t("account.notSet")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-bold text-[#6f6862]">{t("account.memberSince")}</dt>
              <dd className="text-right font-extrabold">{formatDate(user.createdAt)}</dd>
            </div>
          </dl>

          <div className={`mt-5 rounded-2xl border p-4 ${user.emailVerifiedAt ? "border-[#bfe3c5] bg-[#f2fbf3]" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-[15px] font-black">{user.emailVerifiedAt ? `✓ ${t("account.emailVerified")}` : t("account.emailUnverified")}</p>
            {user.emailVerifiedAt ? (
              <p className="mt-1 text-[13.5px] text-[#57534e]">{formatDate(user.emailVerifiedAt)}</p>
            ) : (
              <>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#57534e]">{t("account.emailVerificationHelp")}</p>
                <button onClick={sendVerification} disabled={busyKey === "verify-email"} className={`${primaryButtonClass} mt-3`}>
                  {t("account.sendVerification")}
                </button>
              </>
            )}
          </div>
        </Section>

        <Section title={t("account.changeEmail")} help={t("account.changeEmailHelp")}>
          {pendingEmailChange && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="break-all text-[14px] font-bold text-amber-950">
                {t("account.pendingEmailChange")
                  .replace("{email}", pendingEmailChange.email)
                  .replace("{date}", formatDate(pendingEmailChange.expiresAt))}
              </p>
              <button onClick={cancelEmailChange} disabled={busyKey === "cancel-email-change"} className={`${secondaryButtonClass} mt-3 px-4 py-2 text-[13.5px]`}>
                {t("account.cancelEmailChange")}
              </button>
            </div>
          )}
          <form onSubmit={submitEmailChange} className="grid gap-3">
            <label className={labelClass} htmlFor="account-new-email">
              {t("account.newEmail")}
              <input id="account-new-email" value={emailForm.newEmail} onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))} required type="email" autoComplete="email" className={inputClass} />
            </label>
            <label className={labelClass} htmlFor="account-email-current-password">
              {t("account.currentPassword")}
              <input id="account-email-current-password" value={emailForm.currentPassword} onChange={(e) => setEmailForm((f) => ({ ...f, currentPassword: e.target.value }))} required type="password" maxLength={256} autoComplete="current-password" className={inputClass} />
            </label>
            <button disabled={busyKey === "change-email"} className={primaryButtonClass}>{t("account.sendChangeLink")}</button>
          </form>
        </Section>

        <Section title={t("account.changePhone")} help={t("account.changePhoneHelp")}>
          <form onSubmit={submitPhone} className="grid gap-3">
            <label className={labelClass} htmlFor="account-phone">
              {t("auth.phone")}
              <input id="account-phone" value={phoneForm.phone} onChange={(e) => setPhoneForm((f) => ({ ...f, phone: e.target.value }))} type="tel" autoComplete="tel" className={inputClass} />
            </label>
            <label className={labelClass} htmlFor="account-phone-current-password">
              {t("account.currentPassword")}
              <input id="account-phone-current-password" value={phoneForm.currentPassword} onChange={(e) => setPhoneForm((f) => ({ ...f, currentPassword: e.target.value }))} required type="password" maxLength={256} autoComplete="current-password" className={inputClass} />
            </label>
            <button disabled={busyKey === "change-phone"} className={primaryButtonClass}>{t("account.savePhone")}</button>
          </form>
        </Section>

        <Section title={t("account.changePassword")} help={t("account.changePasswordHelp")}>
          <form onSubmit={submitPassword} className="grid gap-3">
            <label className={labelClass} htmlFor="account-current-password">
              {t("account.currentPassword")}
              <input id="account-current-password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))} required type="password" maxLength={256} autoComplete="current-password" className={inputClass} />
            </label>
            <label className={labelClass} htmlFor="account-new-password">
              {t("auth.newPassword")}
              <input id="account-new-password" aria-describedby="account-password-policy" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))} required type="password" minLength={10} maxLength={256} autoComplete="new-password" className={inputClass} />
            </label>
            <label className={labelClass} htmlFor="account-confirm-password">
              {t("auth.confirmPassword")}
              <input id="account-confirm-password" aria-describedby="account-password-policy" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))} required type="password" minLength={10} maxLength={256} autoComplete="new-password" className={inputClass} />
            </label>
            <p id="account-password-policy" className="text-[13px] text-[#6f6862]">{t("auth.passwordPolicy")}</p>
            <button disabled={busyKey === "change-password"} className={primaryButtonClass}>{t("account.changePassword")}</button>
          </form>
        </Section>
      </div>

      <div className="mt-5">
        <Section title={t("account.sessions")} help={t("account.sessionsHelp")}>
          <div className="grid gap-3">
            {sessions.map((session) => (
              <div key={session.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[15px] font-extrabold">
                    {deviceLabel(session)}{" "}
                    {session.current && <span className="ml-1 rounded-full bg-[#17452e] px-2.5 py-1 text-[11.5px] font-bold text-white">{t("account.currentDevice")}</span>}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#6f6862]">
                    {t("account.signedIn")}: {formatDate(session.createdAt)} · {t("account.lastActive")}: {formatDate(session.lastSeenAt)} · {t("account.expires")}: {formatDate(session.expiresAt)}
                  </p>
                </div>
                {!session.current && (
                  <button onClick={() => revokeSession(session)} disabled={busyKey === `revoke:${session.id}`} className={`${secondaryButtonClass} shrink-0 px-4 py-2 text-[13.5px]`}>
                    {t("account.revokeSession")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={revokeOthers} disabled={!otherSessions.length || busyKey === "revoke-others"} className={secondaryButtonClass}>
              {t("account.revokeOthers")}
            </button>
            {!otherSessions.length && <p className="text-[13.5px] font-bold text-[#6f6862]">{t("account.noOtherSessions")}</p>}
          </div>
        </Section>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <div id="export-data" className="scroll-mt-24">
        <Section title={t("account.exportTitle")} help={t("account.exportHelp")}>
          <form onSubmit={exportData} className="grid gap-3">
            <label className={labelClass} htmlFor="account-export-password">
              {t("account.currentPassword")}
              <input id="account-export-password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} required type="password" maxLength={256} autoComplete="current-password" className={inputClass} />
            </label>
            <button disabled={busyKey === "export"} className={primaryButtonClass}>
              {busyKey === "export" ? t("account.exporting") : t("account.exportBtn")}
            </button>
          </form>
        </Section>
        </div>

        <div id="delete-account" className="scroll-mt-24">
        <Section title={t("account.deleteTitle")} help={t("account.deleteHelp")} danger>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] font-bold text-amber-900">{t("account.deleteWarning")}</p>
          <form onSubmit={deleteAccount} className="mt-4 grid gap-3">
            <label className={labelClass} htmlFor="account-delete-password">
              {t("account.currentPassword")}
              <input id="account-delete-password" value={deleteForm.currentPassword} onChange={(e) => setDeleteForm((f) => ({ ...f, currentPassword: e.target.value }))} required type="password" maxLength={256} autoComplete="current-password" className={inputClass} />
            </label>
            <label className={labelClass} htmlFor="account-delete-email">
              {t("account.confirmEmailLabel")}
              <input id="account-delete-email" value={deleteForm.confirmationEmail} onChange={(e) => setDeleteForm((f) => ({ ...f, confirmationEmail: e.target.value }))} required type="email" autoComplete="off" placeholder={user.email} className={inputClass} />
            </label>
            <button disabled={busyKey === "delete-account"} className="rounded-2xl bg-red-700 px-5 py-3 text-[14.5px] font-extrabold text-white hover:bg-red-800 disabled:opacity-60">
              {busyKey === "delete-account" ? t("account.deleting") : t("account.deleteBtn")}
            </button>
          </form>
        </Section>
        </div>
      </div>
    </div>
  );
}
