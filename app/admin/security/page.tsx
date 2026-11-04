"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AdminMfaPanel, { type AdminMfaVerifiedMethod } from "@/frontend/components/admin/AdminMfaPanel";
import AdminPasswordField from "@/frontend/components/admin/AdminPasswordField";
import { useLang, type TranslationKey } from "@/frontend/i18n";
import { isAdminPasswordCompliant } from "@/shared/admin-password-policy";
import { ADMIN_ROLES, type AdminPermission, type AdminRole } from "@/shared/admin-rbac";

type AdminAccount = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  status: "invited" | "active" | "suspended" | "revoked";
  permissions: string[];
  emailVerifiedAt: string | null;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitationExpiresAt?: string | null;
  invitationUsedAt?: string | null;
  invitationRevokedAt?: string | null;
};

type AdminSession = {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  mfaVerifiedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
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

const inputClassName =
  "w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]";
const primaryButtonClassName =
  "rounded-2xl bg-[#1c1917] px-5 py-3 text-[14.5px] font-extrabold text-white transition-colors hover:bg-black disabled:opacity-60";
const secondaryButtonClassName =
  "rounded-full border border-[#d8c9a3] bg-white px-4 py-2 text-[13px] font-extrabold text-[#1c1917] transition-colors hover:bg-[#fffbf1] disabled:opacity-50";
const dangerButtonClassName =
  "rounded-full border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-extrabold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50";

export default function AdminSecurityPage() {
  const { t, apiError, formatDateTime, status: localizeStatus } = useLang();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [mfaSatisfied, setMfaSatisfied] = useState(false);
  const [afterMfaDestination, setAfterMfaDestination] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionUnverified, setSessionUnverified] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("operations_manager");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AdminRole>>({});

  const permissions = useMemo(() => new Set(admin?.permissions ?? []), [admin?.permissions]);
  const can = (permission: AdminPermission) => permissions.has(permission);

  const loadSessions = async () => {
    const response = await fetch("/api/admin/identity/sessions", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { sessions?: AdminSession[] } | null;
    if (response.ok && Array.isArray(data?.sessions)) setSessions(data.sessions);
  };

  const loadAccounts = async () => {
    const response = await fetch("/api/admin/identity/accounts", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { accounts?: AdminAccount[] } | null;
    if (response.ok && Array.isArray(data?.accounts)) {
      setAccounts(data.accounts);
      setRoleDrafts(Object.fromEntries(data.accounts.map((account) => [account.id, account.role])));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/admin/identity/me", { credentials: "include", cache: "no-store" });
        const data = (await response.json().catch(() => null)) as {
          admin?: AdminAccount;
          code?: string;
          session?: { mfaSatisfied?: boolean };
        } | null;
        if (cancelled) return;
        if (!response.ok || !data?.admin) {
          if (response.status === 401) {
            // The browser is not presenting a session cookie. Show an
            // explicit explanation instead of silently bouncing to the
            // sign-in page: right after a successful password step, the
            // instant redirect looked like an authentication failure, when
            // the real cause is that the session cookie never comes back
            // (embedded preview frames, blocked cookies). No account data
            // is rendered in this state and nothing is granted.
            window.sessionStorage.removeItem("yl-admin-after-mfa");
            setSessionUnverified(true);
            return;
          }
          setError(apiError(response.status, data?.code, "api.loadFailed"));
          return;
        }
        setAdmin(data.admin);
        const verified = data.session?.mfaSatisfied === true;
        setMfaSatisfied(verified);
        const requestedDestination = window.sessionStorage.getItem("yl-admin-after-mfa");
        const safeDestination =
          requestedDestination === "/admin" && data.admin.role === "super_admin" ? requestedDestination : null;
        setAfterMfaDestination(safeDestination);
        if (verified && safeDestination) {
          window.sessionStorage.removeItem("yl-admin-after-mfa");
          router.replace(safeDestination);
          return;
        }
        if (verified) {
          await loadSessions();
          if (data.admin.permissions.includes("admin_users.view")) await loadAccounts();
        }
      } catch {
        if (!cancelled) setError(t("api.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // Initial identity load only; follow-up refreshes call the loaders directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await action();
    } catch {
      setError(t("adminIdentity.actionFailed"));
    } finally {
      setBusyKey("");
    }
  };

  const signOut = () =>
    runAction("signout", async () => {
      await fetch("/api/admin/identity/logout", { method: "POST", credentials: "include", cache: "no-store" });
      window.sessionStorage.removeItem("yl-admin-after-mfa");
      router.replace("/admin/sign-in");
      router.refresh();
    });

  const handleMfaVerified = async (method: AdminMfaVerifiedMethod) => {
    setMfaSatisfied(true);
    await loadSessions();
    if (admin?.permissions.includes("admin_users.view")) await loadAccounts();

    const completesLogin = method === "totp" || method === "recovery_code" || method === "passkey";
    if (completesLogin && afterMfaDestination === "/admin" && admin?.role === "super_admin") {
      window.sessionStorage.removeItem("yl-admin-after-mfa");
      setAfterMfaDestination(null);
      router.replace("/admin");
      router.refresh();
    }
  };

  const changePassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdminPasswordCompliant(newPassword)) {
      setError(t("adminIdentity.passwordPolicy"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }
    void runAction("password", async () => {
      const response = await fetch("/api/admin/identity/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json().catch(() => null)) as { admin?: AdminAccount; code?: string } | null;
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      if (data?.admin) setAdmin(data.admin);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(t("adminIdentity.passwordChangeSuccess"));
      await loadSessions();
    });
  };

  const revokeSession = (sessionId: string) =>
    runAction(`session:${sessionId}`, async () => {
      const response = await fetch("/api/admin/identity/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "revoke", sessionId }),
      });
      const data = (await response.json().catch(() => null)) as { sessions?: AdminSession[]; code?: string } | null;
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      if (Array.isArray(data?.sessions)) setSessions(data.sessions);
      setNotice(t("adminIdentity.sessionsUpdated"));
    });

  const revokeOtherSessions = () =>
    runAction("sessions:others", async () => {
      const response = await fetch("/api/admin/identity/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "revoke_others" }),
      });
      const data = (await response.json().catch(() => null)) as { sessions?: AdminSession[]; code?: string } | null;
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      if (Array.isArray(data?.sessions)) setSessions(data.sessions);
      setNotice(t("adminIdentity.sessionsUpdated"));
    });

  const inviteAdmin = (event: React.FormEvent) => {
    event.preventDefault();
    void runAction("invite", async () => {
      const response = await fetch("/api/admin/identity/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = (await response.json().catch(() => null)) as { accounts?: AdminAccount[]; code?: string } | null;
      if (Array.isArray(data?.accounts)) {
        setAccounts(data.accounts);
        setRoleDrafts(Object.fromEntries(data.accounts.map((account) => [account.id, account.role])));
      }
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setInviteEmail("");
      setNotice(t("adminIdentity.inviteSent"));
    });
  };

  const patchAccount = (account: AdminAccount, action: string, extra: Record<string, unknown> = {}) => {
    if (action === "update_status" && extra.status === "suspended" && !window.confirm(t("adminIdentity.confirmSuspend"))) return;
    if (action === "update_status" && extra.status === "revoked" && !window.confirm(t("adminIdentity.confirmRevokeAccess"))) return;
    if (action === "revoke_sessions" && !window.confirm(t("adminIdentity.confirmRevokeSessions"))) return;
    if (action === "update_role" && !window.confirm(t("adminIdentity.confirmRoleChange"))) return;

    void runAction(`account:${account.id}:${action}`, async () => {
      const response = await fetch("/api/admin/identity/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, adminId: account.id, ...extra }),
      });
      const data = (await response.json().catch(() => null)) as { accounts?: AdminAccount[]; code?: string } | null;
      if (Array.isArray(data?.accounts)) {
        setAccounts(data.accounts);
        setRoleDrafts(Object.fromEntries(data.accounts.map((item) => [item.id, item.role])));
      }
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setNotice(
        action === "resend_invitation" ? t("adminIdentity.inviteSent") : t("adminIdentity.accountUpdated"),
      );
    });
  };

  const statusLabel = (account: AdminAccount) =>
    account.status === "invited"
      ? t("adminIdentity.status.invited")
      : account.status === "revoked"
        ? t("adminIdentity.status.revoked")
        : localizeStatus(account.status);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <p className="rounded-2xl border border-[#e9ddc3] bg-white p-6 font-bold text-[#6f6862]">{t("admin.checking")}</p>
      </div>
    );
  }

  if (sessionUnverified) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("adminIdentity.eyebrow")}</p>
          <h1 className="font-display mt-1 text-[28px] font-black">{t("adminIdentity.sessionNotStickingTitle")}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6f6862]">{t("adminIdentity.sessionNotSticking")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.location.reload()} className={primaryButtonClassName}>
              {t("adminIdentity.checkSessionAgain")}
            </button>
            <Link href="/admin/sign-in" className={secondaryButtonClassName}>{t("auth.backToLogin")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("adminIdentity.eyebrow")}</p>
          <h1 className="font-display mt-1 text-[34px] font-black">{t("adminIdentity.securityTitle")}</h1>
          <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[#6f6862]">{t("adminIdentity.securitySub")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mfaSatisfied && admin?.role === "super_admin" && <Link href="/admin" className={primaryButtonClassName}>{t("adminIdentity.openDashboard")}</Link>}
          <button type="button" onClick={() => void signOut()} disabled={busyKey === "signout"} className={secondaryButtonClassName}>
            {t("adminIdentity.signOut")}
          </button>
        </div>
      </div>

      {error && <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700">{error}</p>}
      {notice && <p className="mt-6 rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] px-5 py-4 text-[14px] font-bold text-[#17452e]">{notice}</p>}

      {admin && (
        <section className="mt-8 rounded-[28px] border border-[#e9ddc3] bg-white p-6 card-shadow sm:p-8">
          <h2 className="text-[22px] font-black">{t("adminIdentity.accountDetails")}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("adminIdentity.signedInAs")}</p>
              <p className="mt-1 font-extrabold">{admin.name || admin.email}</p>
              <p className="break-all text-[13px] text-[#6f6862]">{admin.email}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("adminIdentity.assignedRole")}</p>
              <p className="mt-1 font-extrabold">{t(ROLE_KEYS[admin.role])}</p>
              <p className="text-[13px] text-[#6f6862]">{statusLabel(admin)}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("adminIdentity.lastLogin")}</p>
              <p className="mt-1 font-bold">{admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : t("adminIdentity.never")}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("adminIdentity.passwordChanged")}</p>
              <p className="mt-1 font-bold">{admin.passwordChangedAt ? formatDateTime(admin.passwordChangedAt) : t("adminIdentity.never")}</p>
            </div>
          </div>
        </section>
      )}

      {admin && (
        <AdminMfaPanel
          onVerified={handleMfaVerified}
          afterEnrollmentHref={afterMfaDestination === "/admin" && admin.role === "super_admin" ? "/admin" : undefined}
        />
      )}

      {mfaSatisfied && (
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[28px] border border-[#e9ddc3] bg-white p-6 card-shadow sm:p-8">
          <h2 className="text-[22px] font-black">{t("adminIdentity.changePasswordTitle")}</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.changePasswordHelp")}</p>
          <form onSubmit={changePassword} className="mt-5 grid gap-3">
            <label htmlFor="admin-current-password" className="text-[13.5px] font-bold">{t("account.currentPassword")}</label>
            <input id="admin-current-password" name="currentPassword" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" className={inputClassName} />
            <label htmlFor="admin-new-password" className="text-[13.5px] font-bold">{t("auth.newPassword")}</label>
            <AdminPasswordField id="admin-new-password" name="newPassword" value={newPassword} onChange={setNewPassword} onSuggest={setConfirmPassword} placeholder={t("auth.newPassword")} />
            <label htmlFor="admin-confirm-password" className="text-[13.5px] font-bold">{t("auth.confirmPassword")}</label>
            <AdminPasswordField id="admin-confirm-password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} placeholder={t("auth.confirmPassword")} showGuidance={false} />
            <button disabled={busyKey === "password" || !currentPassword || !isAdminPasswordCompliant(newPassword)} className={primaryButtonClassName}>
              {busyKey === "password" ? t("adminIdentity.changingPassword") : t("adminIdentity.changePasswordButton")}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-[#e9ddc3] bg-white p-6 card-shadow sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-black">{t("adminIdentity.sessionsTitle")}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.sessionsHelp")}</p>
            </div>
            <button type="button" onClick={() => void revokeOtherSessions()} disabled={busyKey === "sessions:others"} className={secondaryButtonClassName}>
              {t("adminIdentity.revokeOthers")}
            </button>
          </div>
          <div className="mt-5 grid gap-3">
            {sessions.length === 0 && <p className="rounded-2xl bg-[#fffbf1] p-4 text-[14px] font-bold text-[#6f6862]">{t("adminIdentity.noSessions")}</p>}
            {sessions.map((session) => (
              <article key={session.id} className="rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{session.userAgent || t("adminIdentity.deviceUnknown")}</p>
                    {session.current && <p className="mt-1 text-[12.5px] font-black uppercase tracking-widest text-[#17452e]">{t("adminIdentity.currentSession")}</p>}
                    {session.revokedAt && <p className="mt-1 text-[12.5px] font-black uppercase tracking-widest text-red-700">{localizeStatus("deleted")}</p>}
                  </div>
                  {!session.current && !session.revokedAt && (
                    <button type="button" onClick={() => void revokeSession(session.id)} disabled={busyKey === `session:${session.id}`} className={dangerButtonClassName}>
                      {t("account.revokeSession")}
                    </button>
                  )}
                </div>
                <dl className="mt-3 grid gap-2 text-[13px] text-[#6f6862] sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="font-bold">{t("adminIdentity.created")}</dt><dd>{formatDateTime(session.createdAt)}</dd></div>
                  <div><dt className="font-bold">{t("account.lastActive")}</dt><dd>{formatDateTime(session.lastSeenAt)}</dd></div>
                  <div><dt className="font-bold">MFA</dt><dd>{session.mfaVerifiedAt ? formatDateTime(session.mfaVerifiedAt) : t("adminIdentity.never")}</dd></div>
                  <div><dt className="font-bold">{t("account.expires")}</dt><dd>{formatDateTime(session.expiresAt)}</dd></div>
                </dl>
                {session.ipAddress && <p className="mt-2 text-[12.5px] text-[#8a8178]">{t("admin.ipAddress")}: {session.ipAddress}</p>}
              </article>
            ))}
          </div>
        </section>
      </div>
      )}

      {mfaSatisfied && can("admin_users.view") && (
        <section className="mt-6 rounded-[28px] border border-[#e9ddc3] bg-white p-6 card-shadow sm:p-8">
          <h2 className="text-[24px] font-black">{t("adminIdentity.accountsTitle")}</h2>
          <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.accountsSub")}</p>

          {can("admin_users.invite") && (
            <form onSubmit={inviteAdmin} className="mt-6 rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
              <h3 className="text-[18px] font-black">{t("adminIdentity.inviteTitle")}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.inviteHelp")}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px_auto]">
                <div>
                  <label htmlFor="admin-invite-email" className="sr-only">{t("auth.email")}</label>
                  <input id="admin-invite-email" name="email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required placeholder="name@example.com" className={inputClassName} />
                </div>
                <div>
                  <label htmlFor="admin-invite-role" className="sr-only">{t("adminIdentity.assignedRole")}</label>
                  <select id="admin-invite-role" name="role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as AdminRole)} className={inputClassName}>
                    {ADMIN_ROLES.map((role) => (
                      <option key={role} value={role}>{t(ROLE_KEYS[role])}</option>
                    ))}
                  </select>
                </div>
                <button disabled={busyKey === "invite" || !inviteEmail.trim()} className={primaryButtonClassName}>
                  {busyKey === "invite" ? t("adminIdentity.sendingInvite") : t("adminIdentity.sendInvite")}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 grid gap-4">
            {accounts.length === 0 && <p className="rounded-2xl bg-[#fffbf1] p-4 font-bold text-[#6f6862]">{t("adminIdentity.accountsEmpty")}</p>}
            {accounts.map((account) => {
              const isSelf = account.id === admin?.id;
              const draftRole = roleDrafts[account.id] ?? account.role;
              return (
                <article key={account.id} className="rounded-3xl border border-[#e9ddc3] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[18px] font-black">{account.name || account.email}</h3>
                      <p className="break-all text-[13.5px] text-[#6f6862]">{account.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-extrabold">
                        <span className="rounded-full bg-[#1c1917] px-3 py-1 text-white">{t(ROLE_KEYS[account.role])}</span>
                        <span className="rounded-full bg-[#fff3d6] px-3 py-1 text-[#6b4e12]">{statusLabel(account)}</span>
                      </div>
                      {account.status === "invited" && account.invitationExpiresAt && !account.invitationRevokedAt && (
                        <p className="mt-2 text-[13px] text-[#6f6862]">{t("adminIdentity.invitationExpires")}: {formatDateTime(account.invitationExpiresAt)}</p>
                      )}
                      {account.status === "invited" && account.invitationRevokedAt && (
                        <p className="mt-2 text-[13px] font-bold text-red-700">{t("adminIdentity.invitationRevoked")}</p>
                      )}
                      {account.lastLoginAt && (
                        <p className="mt-2 text-[13px] text-[#6f6862]">{t("adminIdentity.lastLogin")}: {formatDateTime(account.lastLoginAt)}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {account.status === "invited" && can("admin_users.invite") && (
                      <>
                        <button type="button" onClick={() => patchAccount(account, "resend_invitation")} disabled={busyKey.startsWith(`account:${account.id}:`)} className={secondaryButtonClassName}>
                          {t("adminIdentity.resendInvite")}
                        </button>
                        <button type="button" onClick={() => patchAccount(account, "revoke_invitation")} disabled={busyKey.startsWith(`account:${account.id}:`)} className={dangerButtonClassName}>
                          {t("adminIdentity.revokeInvite")}
                        </button>
                      </>
                    )}
                    {!isSelf && account.status === "active" && can("admin_users.suspend") && (
                      <button type="button" onClick={() => patchAccount(account, "update_status", { status: "suspended" })} disabled={busyKey.startsWith(`account:${account.id}:`)} className={dangerButtonClassName}>
                        {t("adminIdentity.suspend")}
                      </button>
                    )}
                    {!isSelf && account.status === "suspended" && can("admin_users.suspend") && (
                      <button type="button" onClick={() => patchAccount(account, "update_status", { status: "active" })} disabled={busyKey.startsWith(`account:${account.id}:`)} className={secondaryButtonClassName}>
                        {t("adminIdentity.reactivate")}
                      </button>
                    )}
                    {!isSelf && (account.status === "active" || account.status === "suspended") && can("admin_users.suspend") && (
                      <button type="button" onClick={() => patchAccount(account, "update_status", { status: "revoked" })} disabled={busyKey.startsWith(`account:${account.id}:`)} className={dangerButtonClassName}>
                        {t("adminIdentity.revokeAccess")}
                      </button>
                    )}
                    {!isSelf && account.status !== "invited" && can("admin_users.sessions.manage") && (
                      <button type="button" onClick={() => patchAccount(account, "revoke_sessions")} disabled={busyKey.startsWith(`account:${account.id}:`)} className={secondaryButtonClassName}>
                        {t("adminIdentity.revokeSessions")}
                      </button>
                    )}
                  </div>

                  {can("admin_users.manage_roles") && (
                    <div className="mt-4 grid gap-3 border-t border-[#f0e4c8] pt-4 sm:grid-cols-[1fr_auto]">
                      <div>
                        <label htmlFor={`admin-role-${account.id}`} className="sr-only">{t("adminIdentity.assignedRole")}</label>
                        <select id={`admin-role-${account.id}`} value={draftRole} disabled={isSelf} onChange={(event) => setRoleDrafts((current) => ({ ...current, [account.id]: event.target.value as AdminRole }))} className={inputClassName}>
                          {ADMIN_ROLES.map((role) => (
                            <option key={role} value={role}>{t(ROLE_KEYS[role])}</option>
                          ))}
                        </select>
                      </div>
                      <button type="button" disabled={isSelf || draftRole === account.role || busyKey.startsWith(`account:${account.id}:`)} onClick={() => patchAccount(account, "update_role", { role: draftRole })} className={secondaryButtonClassName}>
                        {t("adminIdentity.saveRole")}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
