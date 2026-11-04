"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLang } from "@/frontend/i18n";

export type AdminPasskeyView = {
  id: string;
  deviceName: string | null;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type AdminMfaStatusView = {
  mfaRequired: true;
  mfaEnrolled: boolean;
  mfaSatisfied: boolean;
  stepUpFresh: boolean;
  sessionMfaVerifiedAt: string | null;
  sessionExpiresAt: string;
  totp: {
    state: "not_started" | "pending" | "enrolled";
    verifiedAt: string | null;
    lastUsedAt: string | null;
  };
  recoveryCodesRemaining: number;
  passkeys: {
    count: number;
    enrollmentAvailable: true;
    items: AdminPasskeyView[];
  };
};

export type AdminMfaVerifiedMethod =
  | "totp_enrollment"
  | "totp"
  | "recovery_code"
  | "passkey"
  | "management";

type TotpSetup = {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
  replacing: boolean;
};

type ApiBody = {
  code?: string;
  mfa?: AdminMfaStatusView;
  secret?: string;
  otpauthUri?: string;
  qrDataUrl?: string;
  replacing?: boolean;
  recoveryCodes?: string[];
  recoveryCodesRemaining?: number;
  options?: unknown;
  passkey?: AdminPasskeyView;
  remainingPasskeys?: number;
} | null;

const inputClassName =
  "w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917] disabled:opacity-60";
const primaryButtonClassName =
  "rounded-2xl bg-[#1c1917] px-5 py-3 text-[14.5px] font-extrabold text-white transition-colors hover:bg-black disabled:opacity-60";
const secondaryButtonClassName =
  "rounded-full border border-[#d8c9a3] bg-white px-4 py-2 text-[13px] font-extrabold text-[#1c1917] transition-colors hover:bg-[#fffbf1] disabled:opacity-50";
const dangerButtonClassName =
  "rounded-full border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-extrabold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50";

function subscribeToBrowserPasskeySupport(): () => void {
  return () => undefined;
}

export default function AdminMfaPanel({
  onVerified,
  afterEnrollmentHref,
}: {
  onVerified?: (method: AdminMfaVerifiedMethod) => Promise<void> | void;
  afterEnrollmentHref?: string;
}) {
  const { t, apiError, formatDateTime, formatNumber } = useLang();
  const router = useRouter();
  const [status, setStatus] = useState<AdminMfaStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [managementPassword, setManagementPassword] = useState("");
  const [managementCode, setManagementCode] = useState("");
  const [issuedCodes, setIssuedCodes] = useState<string[] | null>(null);
  const [issuedCodesKind, setIssuedCodesKind] = useState<"enrollment" | "regeneration" | null>(null);
  const passkeySupported = useSyncExternalStore(
    subscribeToBrowserPasskeySupport,
    () => browserSupportsWebAuthn(),
    () => false,
  );
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyPassword, setPasskeyPassword] = useState("");

  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  const requestStatus = useCallback(async (): Promise<
    { status: AdminMfaStatusView; error?: undefined } | { status: null; error: string }
  > => {
    try {
      const response = await fetch("/api/admin/identity/mfa/status", { credentials: "include", cache: "no-store" });
      const data = (await response.json().catch(() => null)) as ApiBody;
      if (!response.ok || !data?.mfa) {
        return { status: null, error: apiError(response.status, data?.code, "adminIdentity.actionFailed") };
      }
      return { status: data.mfa };
    } catch {
      return { status: null, error: t("adminIdentity.actionFailed") };
    }
  }, [apiError, t]);

  const loadStatus = useCallback(async (): Promise<AdminMfaStatusView | null> => {
    const result = await requestStatus();
    if (result.status) setStatus(result.status);
    else setError(result.error);
    setLoading(false);
    return result.status;
  }, [requestStatus]);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const result = await requestStatus();
      if (cancelled) return;
      if (result.status) setStatus(result.status);
      else setError(result.error);
      setLoading(false);
    };
    void initialLoad();
    const interval = window.setInterval(() => {
      if (!document.hidden) void loadStatus();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadStatus, requestStatus]);

  const run = async (key: string, action: () => Promise<void>) => {
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

  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as ApiBody;
    return { response, data };
  };

  const refreshAfterVerified = async (method: AdminMfaVerifiedMethod = "management") => {
    await loadStatus();
    await onVerifiedRef.current?.(method);
  };

  const beginSetup = (event: React.FormEvent) => {
    event.preventDefault();
    void run("mfa-begin", async () => {
      const { response, data } = await post("/api/admin/identity/mfa/totp/begin", { currentPassword: setupPassword });
      setSetupPassword("");
      if (!response.ok || !data?.secret || !data.otpauthUri || !data.qrDataUrl) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setSetupCode("");
      setSetup({
        secret: data.secret,
        otpauthUri: data.otpauthUri,
        qrDataUrl: data.qrDataUrl,
        replacing: Boolean(data.replacing),
      });
    });
  };

  const confirmSetup = (event: React.FormEvent) => {
    event.preventDefault();
    void run("mfa-confirm", async () => {
      const { response, data } = await post("/api/admin/identity/mfa/totp/confirm", { code: setupCode });
      if (!response.ok || !Array.isArray(data?.recoveryCodes)) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setIssuedCodes(data.recoveryCodes);
      setIssuedCodesKind("enrollment");
      setSetup(null);
      setSetupCode("");
      setNotice(t("adminIdentity.mfaEnrollmentSuccess"));
      await refreshAfterVerified("totp_enrollment");
    });
  };

  const verifyTotp = (event: React.FormEvent) => {
    event.preventDefault();
    void run("mfa-verify", async () => {
      const { response, data } = await post("/api/admin/identity/mfa/totp/verify", { code: verifyCode });
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setVerifyCode("");
      setNotice(t("adminIdentity.mfaVerifiedSuccess"));
      await refreshAfterVerified("totp");
    });
  };

  const verifyRecovery = (event: React.FormEvent) => {
    event.preventDefault();
    void run("mfa-recovery", async () => {
      const { response, data } = await post("/api/admin/identity/mfa/recovery/verify", { code: recoveryCode });
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setRecoveryCode("");
      setNotice(
        t("adminIdentity.mfaRecoveryVerifiedSuccess", { count: data?.recoveryCodesRemaining ?? 0 }),
      );
      await refreshAfterVerified("recovery_code");
    });
  };

  const passkeyBrowserError = (error: unknown): string => {
    if (error instanceof WebAuthnError) {
      if (error.code === "ERROR_CEREMONY_ABORTED") return t("adminIdentity.mfaPasskeyCancelled");
      if (error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
        return t("adminIdentity.mfaPasskeyAlreadyRegistered");
      }
      if (error.code === "ERROR_INVALID_DOMAIN" || error.code === "ERROR_INVALID_RP_ID") {
        return t("adminIdentity.mfaPasskeyOriginUnavailable");
      }
      if (
        error.code === "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT" ||
        error.code === "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT" ||
        error.code === "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG"
      ) {
        return t("adminIdentity.mfaPasskeyUnsupported");
      }
    }
    if (error instanceof Error && error.name === "NotAllowedError") {
      return t("adminIdentity.mfaPasskeyCancelled");
    }
    return t("adminIdentity.actionFailed");
  };

  const registerPasskey = (event: React.FormEvent) => {
    event.preventDefault();
    void run("passkey-register", async () => {
      if (!passkeySupported) {
        setError(t("adminIdentity.mfaPasskeyUnsupported"));
        return;
      }
      const begin = await post("/api/admin/identity/mfa/passkeys/register/begin", {
        currentPassword: passkeyPassword,
      });
      setPasskeyPassword("");
      if (!begin.response.ok || !begin.data?.options) {
        setError(apiError(begin.response.status, begin.data?.code, "adminIdentity.actionFailed"));
        return;
      }

      let attestation;
      try {
        attestation = await startRegistration({
          optionsJSON: begin.data.options as PublicKeyCredentialCreationOptionsJSON,
        });
      } catch (browserError) {
        setError(passkeyBrowserError(browserError));
        return;
      }

      const finish = await post("/api/admin/identity/mfa/passkeys/register/finish", {
        response: attestation,
        deviceName: passkeyName.trim() || "Passkey",
      });
      if (!finish.response.ok || !finish.data?.passkey) {
        setError(apiError(finish.response.status, finish.data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setPasskeyName("");
      setNotice(t("adminIdentity.mfaPasskeyRegisteredSuccess"));
      await refreshAfterVerified();
    });
  };

  const verifyPasskey = () => {
    void run("passkey-verify", async () => {
      if (!passkeySupported) {
        setError(t("adminIdentity.mfaPasskeyUnsupported"));
        return;
      }
      const begin = await post("/api/admin/identity/mfa/passkeys/authenticate/begin", {});
      if (!begin.response.ok || !begin.data?.options) {
        setError(apiError(begin.response.status, begin.data?.code, "adminIdentity.actionFailed"));
        return;
      }

      let assertion;
      try {
        assertion = await startAuthentication({
          optionsJSON: begin.data.options as PublicKeyCredentialRequestOptionsJSON,
        });
      } catch (browserError) {
        setError(passkeyBrowserError(browserError));
        return;
      }

      const finish = await post("/api/admin/identity/mfa/passkeys/authenticate/finish", {
        response: assertion,
      });
      if (!finish.response.ok || !finish.data?.passkey) {
        setError(apiError(finish.response.status, finish.data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setNotice(t("adminIdentity.mfaPasskeyVerifiedSuccess"));
      await refreshAfterVerified("passkey");
    });
  };

  const revokePasskey = (passkey: AdminPasskeyView) => {
    const name = passkey.deviceName || t("adminIdentity.mfaPasskeyUnnamed");
    if (!window.confirm(t("adminIdentity.mfaPasskeyConfirmRevoke", { name }))) return;
    void run(`passkey-revoke-${passkey.id}`, async () => {
      const { response, data } = await post("/api/admin/identity/mfa/passkeys/revoke", {
        passkeyId: passkey.id,
        currentPassword: passkeyPassword,
      });
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setPasskeyPassword("");
      setNotice(t("adminIdentity.mfaPasskeyRevokedSuccess"));
      await refreshAfterVerified();
    });
  };

  const regenerateCodes = () => {
    if (!window.confirm(t("adminIdentity.mfaConfirmRegenerate"))) return;
    void run("mfa-regenerate", async () => {
      const { response, data } = await post("/api/admin/identity/mfa/recovery/regenerate", {
        currentPassword: managementPassword,
        code: managementCode,
      });
      if (!response.ok || !Array.isArray(data?.recoveryCodes)) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setIssuedCodes(data.recoveryCodes);
      setIssuedCodesKind("regeneration");
      setManagementPassword("");
      setManagementCode("");
      setNotice(t("adminIdentity.mfaRegeneratedSuccess"));
      await refreshAfterVerified();
    });
  };

  const disableTotp = () => {
    if (!window.confirm(t("adminIdentity.mfaConfirmDisable"))) return;
    void run("mfa-disable", async () => {
      const { response, data } = await post("/api/admin/identity/mfa/totp/disable", {
        currentPassword: managementPassword,
        code: managementCode,
      });
      if (!response.ok) {
        setError(apiError(response.status, data?.code, "adminIdentity.actionFailed"));
        return;
      }
      setManagementPassword("");
      setManagementCode("");
      setNotice(t("adminIdentity.mfaDisabledSuccess"));
      await loadStatus();
    });
  };

  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError("");
      setNotice(message);
    } catch {
      setNotice("");
      setError(t("adminIdentity.actionFailed"));
    }
  };

  const downloadCodes = () => {
    if (!issuedCodes) return;
    const content = `${t("adminIdentity.mfaRecoveryCodesTitle")}\n\n${t("adminIdentity.mfaRecoveryCodesHelp")}\n\n${issuedCodes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "yaarlink-admin-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const finishIssuedCodes = () => {
    const destination = issuedCodesKind === "enrollment" ? afterEnrollmentHref : undefined;
    setIssuedCodes(null);
    setIssuedCodesKind(null);
    if (!destination) return;
    window.sessionStorage.removeItem("yl-admin-after-mfa");
    router.replace(destination);
    router.refresh();
  };

  const totpStateText = status
    ? status.totp.state === "enrolled"
      ? t("adminIdentity.mfaTotpEnrolled")
      : status.totp.state === "pending"
        ? t("adminIdentity.mfaTotpPending")
        : t("adminIdentity.mfaTotpNotStarted")
    : "";
  const canBegin = Boolean(
    status && (status.totp.state !== "enrolled" || (status.mfaSatisfied && status.stepUpFresh)),
  );
  const needsTotpVerification = Boolean(
    status?.totp.state === "enrolled" && (!status.mfaSatisfied || !status.stepUpFresh),
  );
  const needsPasskeyVerification = Boolean(
    status && status.passkeys.count > 0 && (!status.mfaSatisfied || !status.stepUpFresh),
  );
  const needsVerification = needsTotpVerification || needsPasskeyVerification;
  const canManagePasskeys = Boolean(status?.mfaSatisfied && status.stepUpFresh);
  const canManage = Boolean(status?.totp.state === "enrolled" && status.mfaSatisfied && status.stepUpFresh);

  return (
    <section id="admin-mfa" data-testid="admin-mfa-panel" data-totp-state={status?.totp.state ?? "loading"} className="mt-6 rounded-[28px] border border-[#e9ddc3] bg-white p-6 card-shadow sm:p-8" aria-labelledby="admin-mfa-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="admin-mfa-title" className="text-[22px] font-black">{t("adminIdentity.mfaTitle")}</h2>
          <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaStatus")}</p>
        </div>
        <button type="button" onClick={() => void loadStatus()} disabled={loading || busyKey !== ""} className={secondaryButtonClassName}>
          {t("adminIdentity.mfaRefreshStatus")}
        </button>
      </div>

      {loading && !status && <p className="mt-5 rounded-2xl bg-[#fffbf1] p-4 font-bold text-[#6f6862]">{t("adminIdentity.mfaLoading")}</p>}
      {error && <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-5 rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] px-4 py-3 text-[14px] font-bold text-[#17452e]" role="status">{notice}</p>}

      {status && (
        <>
          <p className={`mt-5 rounded-2xl border px-4 py-3 text-[14px] font-bold ${status.mfaSatisfied && status.stepUpFresh ? "border-[#bfe3c5] bg-[#f2fbf3] text-[#17452e]" : "border-[#f0d49a] bg-[#fff8e6] text-[#6b4e12]"}`}>
            {!status.mfaSatisfied
              ? t("adminIdentity.mfaSessionPending")
              : status.stepUpFresh
                ? t("adminIdentity.mfaSessionVerified")
                : t("adminIdentity.mfaStepUpNeeded")}
          </p>

          <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-[#fffbf1] p-4">
              <dt className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("adminIdentity.mfaBeginTitle")}</dt>
              <dd className="mt-1 font-extrabold">{totpStateText}</dd>
              {status.totp.lastUsedAt && (
                <dd className="mt-1 text-[12.5px] text-[#6f6862]">{t("adminIdentity.mfaLastUsed")}: {formatDateTime(status.totp.lastUsedAt)}</dd>
              )}
            </div>
            <div className="rounded-2xl bg-[#fffbf1] p-4">
              <dt className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("adminIdentity.mfaRecoveryTitle")}</dt>
              <dd className="mt-1 font-extrabold">{t("adminIdentity.mfaRecoveryRemaining", { count: formatNumber(status.recoveryCodesRemaining) })}</dd>
            </div>
            <div className="rounded-2xl bg-[#fffbf1] p-4">
              <dt className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">Passkeys</dt>
              <dd className="mt-1 font-extrabold">{t("adminIdentity.mfaPasskeysCount", { count: formatNumber(status.passkeys.count) })}</dd>
            </div>
            <div className="rounded-2xl bg-[#fffbf1] p-4">
              <dt className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("account.expires")}</dt>
              <dd className="mt-1 font-bold">{formatDateTime(status.sessionExpiresAt)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[#6f6862]">
            {passkeySupported
              ? t("adminIdentity.mfaPasskeyDomainHelp")
              : t("adminIdentity.mfaPasskeyUnsupported")}
          </p>
        </>
      )}

      {issuedCodes && (
        <div className="mt-6 rounded-3xl border border-[#f0d49a] bg-[#fff8e6] p-5" role="alert">
          <h3 className="text-[18px] font-black">{t("adminIdentity.mfaRecoveryCodesTitle")}</h3>
          <p className="mt-1 text-[14px] leading-relaxed text-[#6b4e12]">{t("adminIdentity.mfaRecoveryCodesHelp")}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {issuedCodes.map((code) => (
              <code key={code} className="rounded-xl bg-white px-3 py-2 text-center font-mono text-[14px] font-bold tracking-wide">{code}</code>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyText(issuedCodes.join("\n"), t("adminIdentity.mfaCodesCopied"))} className={secondaryButtonClassName}>
              {t("adminIdentity.mfaCopyCodes")}
            </button>
            <button type="button" onClick={downloadCodes} className={secondaryButtonClassName}>
              {t("adminIdentity.mfaDownloadCodes")}
            </button>
            <button type="button" onClick={finishIssuedCodes} className={primaryButtonClassName}>
              {t("adminIdentity.mfaCodesSaved")}
            </button>
          </div>
        </div>
      )}

      {status && !setup && canBegin && (
        <form onSubmit={beginSetup} className="mt-6 rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
          <h3 className="text-[18px] font-black">
            {status.totp.state === "enrolled" ? t("adminIdentity.mfaReplaceTitle") : t("adminIdentity.mfaBeginTitle")}
          </h3>
          <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaBeginHelp")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label htmlFor="admin-mfa-setup-password" className="sr-only">{t("account.currentPassword")}</label>
              <input id="admin-mfa-setup-password" name="currentPassword" type="password" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} required maxLength={256} autoComplete="current-password" placeholder={t("account.currentPassword")} className={inputClassName} />
            </div>
            <button disabled={busyKey === "mfa-begin" || !setupPassword} className={primaryButtonClassName}>
              {busyKey === "mfa-begin" ? t("adminIdentity.mfaBeginning") : t("adminIdentity.mfaBeginButton")}
            </button>
          </div>
        </form>
      )}

      {setup && (
        <div className="mt-6 rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
          <h3 className="text-[18px] font-black">{setup.replacing ? t("adminIdentity.mfaReplaceTitle") : t("adminIdentity.mfaBeginTitle")}</h3>
          <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaSetupInstructions")}</p>
          <div className="mt-5 grid items-start gap-5 md:grid-cols-[220px_1fr]">
            <Image src={setup.qrDataUrl} alt={t("adminIdentity.mfaQrAlt")} width={220} height={220} unoptimized className="h-[220px] w-[220px] rounded-2xl border border-[#e9ddc3] bg-white p-2" />
            <div>
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#8a8178]">{t("adminIdentity.mfaManualSecret")}</p>
              <code className="mt-2 block break-all rounded-xl bg-white p-3 font-mono text-[13px] font-bold">{setup.secret}</code>
              <button type="button" onClick={() => void copyText(setup.secret, t("adminIdentity.mfaSecretCopied"))} className={`${secondaryButtonClassName} mt-3`}>
                {t("adminIdentity.mfaCopySecret")}
              </button>
              <form onSubmit={confirmSetup} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor="admin-mfa-setup-code" className="sr-only">{t("adminIdentity.mfaCodeLabel")}</label>
                  <input id="admin-mfa-setup-code" name="code" inputMode="numeric" autoComplete="one-time-code" value={setupCode} onChange={(event) => setSetupCode(event.target.value)} required maxLength={32} placeholder="123456" className={inputClassName} />
                </div>
                <button disabled={busyKey === "mfa-confirm" || !setupCode.trim()} className={primaryButtonClassName}>
                  {busyKey === "mfa-confirm" ? t("adminIdentity.mfaConfirming") : t("adminIdentity.mfaConfirmButton")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {status && needsVerification && !setup && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {needsTotpVerification && (
            <form onSubmit={verifyTotp} className="rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
              <h3 className="text-[18px] font-black">{t("adminIdentity.mfaVerifyTitle")}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaVerifyHelp")}</p>
              <label htmlFor="admin-mfa-verify-code" className="mt-4 block text-[13.5px] font-bold">{t("adminIdentity.mfaCodeLabel")}</label>
              <input id="admin-mfa-verify-code" name="code" inputMode="numeric" autoComplete="one-time-code" value={verifyCode} onChange={(event) => setVerifyCode(event.target.value)} required maxLength={32} placeholder="123456" className={`${inputClassName} mt-2`} />
              <button disabled={busyKey === "mfa-verify" || !verifyCode.trim()} className={`${primaryButtonClassName} mt-3 w-full`}>
                {busyKey === "mfa-verify" ? t("adminIdentity.mfaVerifying") : t("adminIdentity.mfaVerifyButton")}
              </button>
            </form>
          )}

          {needsPasskeyVerification && (
            <div className="rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
              <h3 className="text-[18px] font-black">{t("adminIdentity.mfaPasskeyVerifyTitle")}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaPasskeyVerifyHelp")}</p>
              <button type="button" onClick={verifyPasskey} disabled={busyKey === "passkey-verify" || !passkeySupported} className={`${primaryButtonClassName} mt-4 w-full`}>
                {busyKey === "passkey-verify" ? t("adminIdentity.mfaPasskeyVerifying") : t("adminIdentity.mfaPasskeyVerifyButton")}
              </button>
              {!passkeySupported && (
                <p className="mt-3 text-[13.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaPasskeyUnsupported")}</p>
              )}
            </div>
          )}

          {status.recoveryCodesRemaining > 0 && (
            <form onSubmit={verifyRecovery} className="rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
              <h3 className="text-[18px] font-black">{t("adminIdentity.mfaRecoveryTitle")}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaRecoveryHelp")}</p>
              <label htmlFor="admin-mfa-recovery-code" className="mt-4 block text-[13.5px] font-bold">{t("adminIdentity.mfaRecoveryLabel")}</label>
              <input id="admin-mfa-recovery-code" name="code" autoComplete="one-time-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} required maxLength={64} placeholder="ABCD-EFGH-JKMN" className={`${inputClassName} mt-2 font-mono`} />
              <button disabled={busyKey === "mfa-recovery" || !recoveryCode.trim()} className={`${primaryButtonClassName} mt-3 w-full`}>
                {busyKey === "mfa-recovery" ? t("adminIdentity.mfaVerifying") : t("adminIdentity.mfaRecoveryButton")}
              </button>
            </form>
          )}
        </div>
      )}

      {status && canManagePasskeys && !setup && (
        <div className="mt-6 rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
          <h3 className="text-[18px] font-black">{t("adminIdentity.mfaPasskeyTitle")}</h3>
          <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaPasskeyHelp")}</p>

          {status.passkeys.items.length > 0 ? (
            <ul className="mt-4 divide-y divide-[#f0e4c8] rounded-2xl border border-[#f0e4c8] bg-white">
              {status.passkeys.items.map((passkey) => (
                <li key={passkey.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-extrabold">{passkey.deviceName || t("adminIdentity.mfaPasskeyUnnamed")}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#6f6862]">
                      {t("adminIdentity.mfaPasskeyCreated")}: {formatDateTime(passkey.createdAt)}
                      <br />
                      {t("adminIdentity.mfaPasskeyLastUsed")}: {passkey.lastUsedAt ? formatDateTime(passkey.lastUsedAt) : t("adminIdentity.mfaPasskeyNeverUsed")}
                      {passkey.transports.length > 0 && (
                        <>
                          <br />
                          {t("adminIdentity.mfaPasskeyTransports")}: {passkey.transports.join(", ")}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokePasskey(passkey)}
                    disabled={busyKey === `passkey-revoke-${passkey.id}` || !passkeyPassword}
                    className={dangerButtonClassName}
                  >
                    {busyKey === `passkey-revoke-${passkey.id}`
                      ? t("adminIdentity.mfaPasskeyRemoving")
                      : t("adminIdentity.mfaPasskeyRevokeButton")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl bg-white p-4 text-[13.5px] font-bold text-[#6f6862]">{t("adminIdentity.mfaPasskeyNone")}</p>
          )}

          <form onSubmit={registerPasskey} className="mt-5 border-t border-[#f0e4c8] pt-5">
            <p className="text-[13.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaPasskeyPasswordHelp")}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="admin-passkey-name" className="text-[13.5px] font-bold">{t("adminIdentity.mfaPasskeyNameLabel")}</label>
                <input id="admin-passkey-name" name="deviceName" type="text" value={passkeyName} onChange={(event) => setPasskeyName(event.target.value)} maxLength={120} autoComplete="off" placeholder={t("adminIdentity.mfaPasskeyNamePlaceholder")} className={`${inputClassName} mt-2`} />
              </div>
              <div>
                <label htmlFor="admin-passkey-password" className="text-[13.5px] font-bold">{t("account.currentPassword")}</label>
                <input id="admin-passkey-password" name="currentPassword" type="password" value={passkeyPassword} onChange={(event) => setPasskeyPassword(event.target.value)} maxLength={256} autoComplete="current-password" className={`${inputClassName} mt-2`} />
              </div>
            </div>
            <button disabled={busyKey === "passkey-register" || !passkeyPassword || !passkeySupported} className={`${primaryButtonClassName} mt-4`}>
              {busyKey === "passkey-register" ? t("adminIdentity.mfaPasskeyAdding") : t("adminIdentity.mfaPasskeyAddButton")}
            </button>
            {!passkeySupported && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaPasskeyUnsupported")}</p>
            )}
          </form>
        </div>
      )}

      {status && canManage && !setup && (
        <div className="mt-6 rounded-3xl border border-[#e9ddc3] bg-[#fffbf1] p-5">
          <h3 className="text-[18px] font-black">{t("adminIdentity.mfaRegenerateTitle")}</h3>
          <p className="mt-1 text-[14px] leading-relaxed text-[#6f6862]">{t("adminIdentity.mfaRegenerateHelp")}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="admin-mfa-management-password" className="text-[13.5px] font-bold">{t("account.currentPassword")}</label>
              <input id="admin-mfa-management-password" name="currentPassword" type="password" value={managementPassword} onChange={(event) => setManagementPassword(event.target.value)} maxLength={256} autoComplete="current-password" className={`${inputClassName} mt-2`} />
            </div>
            <div>
              <label htmlFor="admin-mfa-management-code" className="text-[13.5px] font-bold">{t("adminIdentity.mfaCodeLabel")}</label>
              <input id="admin-mfa-management-code" name="code" inputMode="numeric" autoComplete="one-time-code" value={managementCode} onChange={(event) => setManagementCode(event.target.value)} maxLength={32} placeholder="123456" className={`${inputClassName} mt-2`} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={regenerateCodes} disabled={busyKey === "mfa-regenerate" || !managementPassword || !managementCode.trim()} className={primaryButtonClassName}>
              {t("adminIdentity.mfaRegenerateButton")}
            </button>
            {status.passkeys.count > 0 && (
              <button type="button" onClick={disableTotp} disabled={busyKey === "mfa-disable" || !managementPassword || !managementCode.trim()} className={dangerButtonClassName}>
                {t("adminIdentity.mfaDisableButton")}
              </button>
            )}
          </div>
          {status.passkeys.count === 0 && (
            <p className="mt-4 border-t border-[#f0e4c8] pt-4 text-[13.5px] leading-relaxed text-[#6f6862]">
              <strong>{t("adminIdentity.mfaDisableTitle")}:</strong> {t("adminIdentity.mfaDisableLastMethod")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
