"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "@/frontend/i18n";

type IdentitySessionView = {
  admin?: { role?: string };
  session?: { mfaSatisfied?: boolean; mfaEnrolled?: boolean };
  code?: string;
} | null;

export default function AdminSignInPage() {
  const { t, apiError } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  // Inside an embedded cross-site preview frame the browser may refuse to
  // send the session cookie back (see shared/admin-cookie.ts). Detect that
  // context up front so the owner can open sign-in as a first-party tab,
  // where the same secure cookie works normally. On the real site the page
  // is never framed, this stays false, and nothing extra renders.
  const [framed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.self !== window.top;
    } catch {
      return true;
    }
  });
  // Some embedded previews swallow new-tab clicks entirely; showing the
  // absolute address as copyable text guarantees a manual path to a
  // first-party tab even when the button cannot work.
  const [fullTabUrl] = useState(() =>
    typeof window !== "undefined" ? `${window.location.origin}/admin/sign-in` : "/admin/sign-in",
  );

  useEffect(() => {
    let cancelled = false;
    const resumeExistingSession = async () => {
      try {
        // Stage 1 first run: while no administrator account exists, the
        // sign-in screen hands over to the one-time first-account setup.
        try {
          const setupResponse = await fetch("/api/admin/identity/first-admin", { credentials: "include", cache: "no-store" });
          const setupData = (await setupResponse.json().catch(() => null)) as { setupOpen?: boolean } | null;
          if (!cancelled && setupResponse.ok && setupData?.setupOpen) {
            router.replace("/admin/setup");
            return;
          }
        } catch {
          // Fall through to the normal session probe / credential form.
        }
        const response = await fetch("/api/admin/identity/me", { credentials: "include", cache: "no-store" });
        const data = (await response.json().catch(() => null)) as IdentitySessionView;
        if (cancelled || !response.ok || !data?.admin) return;
        if (data.session?.mfaSatisfied) {
          router.replace(data.admin.role === "super_admin" ? "/admin" : "/admin/security");
          return;
        }
        if (data.admin.role === "super_admin") {
          window.sessionStorage.setItem("yl-admin-after-mfa", "/admin");
        }
        router.replace("/admin/security#admin-mfa");
      } catch {
        // The normal credential form remains available if the session probe
        // cannot be completed.
      }
    };
    void resumeExistingSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSigningIn(true);
    try {
      const response = await fetch("/api/admin/identity/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => null)) as IdentitySessionView;
      if (!response.ok) {
        setPassword("");
        setError(
          data?.code === "admin_not_configured"
            ? t("adminIdentity.notConfigured")
            : apiError(response.status, data?.code, "api.adminWrongCredentials"),
        );
        return;
      }
      setPassword("");
      if (!data?.session?.mfaSatisfied && data?.admin?.role === "super_admin") {
        window.sessionStorage.setItem("yl-admin-after-mfa", "/admin");
      }
      // Confirm the freshly created session is actually being presented
      // back by the browser before navigating. In some contexts (embedded
      // preview frames, blocked third-party cookies) the password step
      // succeeds but the session cookie is never sent again; navigating
      // anyway produced a confusing flash-and-bounce between this page and
      // the security page. Instead, stay here and explain the real
      // problem. This check grants nothing: it only decides navigation.
      let sessionConfirmed = false;
      for (let attempt = 0; attempt < 3 && !sessionConfirmed; attempt += 1) {
        try {
          const check = await fetch("/api/admin/identity/me", { credentials: "include", cache: "no-store" });
          sessionConfirmed = check.ok;
        } catch {
          sessionConfirmed = false;
        }
        if (!sessionConfirmed && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }
      if (!sessionConfirmed) {
        window.sessionStorage.removeItem("yl-admin-after-mfa");
        setError(t("adminIdentity.sessionNotSticking"));
        return;
      }
      // Stage 1 simple mode: the password session is already complete, so
      // go straight to the dashboard. Stage 2 (MFA required): password
      // success creates only a pending session and the security page
      // remains the MFA enrolment/verification stage.
      router.replace(data?.session?.mfaSatisfied ? "/admin" : "/admin/security#admin-mfa");
      router.refresh();
    } catch {
      setError(t("api.adminLoginFailed"));
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <form onSubmit={submit} className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow">
        <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#c7431f]">{t("adminIdentity.eyebrow")}</p>
        <h1 className="font-display mt-1 text-[30px] font-black">{t("adminIdentity.signInTitle")}</h1>
        <p className="mt-1 text-[14.5px] leading-relaxed text-[#6f6862]">{t("adminIdentity.signInSub")}</p>

        {framed && (
          <div className="mt-5 rounded-2xl border border-[#f0d9a8] bg-[#fff8e6] p-4">
            <p className="text-[13.5px] font-bold leading-relaxed text-[#7a5410]">{t("adminIdentity.embeddedPreviewNotice")}</p>
            <a
              href="/admin/sign-in"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-2xl bg-[#1c1917] py-3 text-center text-[15px] font-extrabold text-white hover:bg-black"
            >
              {t("adminIdentity.openFullTab")}
            </a>
            <p className="mt-3 text-[12.5px] font-bold leading-relaxed text-[#7a5410]">{t("adminIdentity.openFullTabFallback")}</p>
            <code className="mt-1 block select-all break-all rounded-lg bg-white/70 px-3 py-2 text-[12.5px] font-semibold text-[#1c1917]">{fullTabUrl}</code>
          </div>
        )}

        <div className="mt-6 grid gap-3">
          <label htmlFor="admin-signin-email" className="text-[13.5px] font-bold">{t("auth.email")}</label>
          <input id="admin-signin-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          <label htmlFor="admin-signin-password" className="text-[13.5px] font-bold">{t("auth.password")}</label>
          <input id="admin-signin-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} autoComplete="current-password" className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]" />
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-bold text-red-700">{error}</p>}
          <button disabled={signingIn} className="rounded-2xl bg-[#1c1917] py-3.5 text-[16px] font-extrabold text-white hover:bg-black disabled:opacity-60">
            {signingIn ? t("adminIdentity.signingIn") : t("adminIdentity.signInButton")}
          </button>
        </div>

        <div className="mt-5 text-[14px] font-bold">
          <Link href="/admin/forgot-password" className="text-[#c7431f]">{t("auth.forgotPassword")}</Link>
        </div>
      </form>
    </div>
  );
}
