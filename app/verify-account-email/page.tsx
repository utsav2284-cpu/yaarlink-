"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLang } from "@/frontend/i18n";
import { ApiResponseError, fetchJsonObject } from "@/frontend/api-json";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const subscribeNoop = () => () => {};

type Kind = "verify" | "change";

function initialHashValue(key: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get(key) || "";
}

export default function VerifyAccountEmailPage() {
  const { t } = useLang();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [token, setToken] = useState(() => initialHashValue("token"));
  const [kind] = useState<Kind | "">(() => {
    const value = initialHashValue("kind");
    return value === "verify" || value === "change" ? value : "";
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionState, setSessionState] = useState<"not-checked" | "checking" | "logged-in" | "logged-out" | "unknown">("not-checked");

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  const invalid = mounted && (!TOKEN_PATTERN.test(token) || !kind) && !success;
  // Render the generic verification copy during hydration; the fragment is
  // client-only, so using it immediately could produce different first HTML.
  const isChange = mounted && kind === "change";

  const checkSession = async () => {
    setSessionState("checking");
    try {
      const me = await fetchJsonObject("/api/auth/me", { cache: "no-store" });
      if (!("user" in me)) throw new ApiResponseError(502, "service_unavailable");
      const user = me.user;
      if (user === null) {
        setSessionState("logged-out");
      } else if (typeof user === "object" && !Array.isArray(user) && typeof (user as { id?: unknown }).id === "string") {
        setSessionState("logged-in");
      } else {
        throw new ApiResponseError(502, "service_unavailable");
      }
    } catch {
      setSessionState("unknown");
    }
  };

  const confirm = async () => {
    setErr("");
    setSaving(true);
    try {
      const res = await fetch(isChange ? "/api/auth/confirm-email-change" : "/api/auth/verify-account-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => null)) as { code?: string } | null;
      if (!res.ok) {
        if (res.status === 429) setErr(t("auth.tooManyRequests"));
        else if (data?.code === "email_unavailable") setErr(t("account.errorEmailUnavailable"));
        else setErr(t("auth.accountActionFailed"));
        return;
      }

      setSuccess(true);
      setToken("");
      if (!isChange) {
        await checkSession();
      } else {
        setSessionState("logged-out");
      }
    } catch {
      setErr(t("auth.accountActionFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <h1 className="font-display text-[30px] font-black">{t(isChange ? "auth.emailChangeTitle" : "auth.verifyAccountTitle")}</h1>

        {success ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-[#bfe3c5] bg-[#f2fbf3] p-5">
              <p className="text-[15px] font-bold leading-relaxed text-[#17452e]">{t(isChange ? "auth.emailChangeSuccess" : "auth.verifyAccountSuccess")}</p>
            </div>
            {!isChange && sessionState === "checking" ? (
              <p role="status" aria-live="polite" className="mt-5 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] px-5 py-3.5 text-center text-[14.5px] font-bold text-[#57534e]">
                {t("session.checking")}
              </p>
            ) : !isChange && sessionState === "unknown" ? (
              <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-[14.5px] font-semibold text-red-800">
                <p>{t("session.unavailable")}</p>
                <button
                  type="button"
                  onClick={() => void checkSession()}
                  className="mt-3 w-full rounded-xl bg-[#1c1917] py-3 text-[14px] font-extrabold text-white hover:bg-black"
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : (
              <Link
                href={!isChange && sessionState === "logged-in" ? "/dashboard" : "/login"}
                className="mt-5 block rounded-2xl bg-[#1c1917] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-black"
              >
                {!isChange && sessionState === "logged-in" ? t("auth.goDashboard") : t("auth.login")}
              </Link>
            )}
          </div>
        ) : invalid ? (
          <div className="mt-5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-[18px] font-black text-red-800">{t("auth.linkInvalidTitle")}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-red-700">{t("auth.linkInvalidBody")}</p>
            </div>
            <Link href="/account" className="mt-5 block rounded-2xl bg-[#e4572e] py-3.5 text-center text-[15.5px] font-extrabold text-white hover:bg-[#c7431f]">
              {t("auth.requestNewLink")}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] leading-relaxed text-[#78716c]">{t(isChange ? "auth.emailChangeSub" : "auth.verifyAccountSub")}</p>
            {err && <p className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
            <button onClick={confirm} disabled={!mounted || saving} className="mt-5 w-full rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
              {saving ? t("auth.confirming") : t(isChange ? "auth.emailChangeBtn" : "auth.verifyAccountBtn")}
            </button>
          </>
        )}

        {!success && (
          <p className="mt-5 text-center text-[14px]">
            <Link href="/login" className="font-bold text-[#e4572e]">{t("auth.backToLogin")}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
