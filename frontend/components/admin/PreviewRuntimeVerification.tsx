"use client";

import { useState } from "react";

type Check = {
  status: "PASS" | "FAIL";
  expected?: string;
  actual?: string | null;
  expectedProject?: string;
  expectedProjectRef?: string;
  actualProjectRef?: string | null;
  detected?: boolean | null;
  connectionEstablished?: boolean;
  selectOneSucceeded?: boolean;
  identityQuerySucceeded?: boolean;
  stage?: string;
  category?: string | null;
  explanation?: string;
  configuration?: {
    urlConfigured: boolean;
    urlParseable: boolean;
    configuredPreviewProject: boolean;
    configuredApplicationRole: boolean;
    caCertificateConfigured: boolean;
  };
};

type VerificationResponse = {
  ok?: boolean;
  error?: string;
  checks?: {
    environment: Check;
    branch: Check;
    databaseConnection: Check;
    supabaseProject: Check;
    applicationRole: Check;
    applicationRolePrivileges: Check;
    productionDatabase: Check;
  };
};

const CHECK_LABELS: Record<keyof NonNullable<VerificationResponse["checks"]>, string> = {
  environment: "Vercel environment",
  branch: "Git branch",
  databaseConnection: "Application database connection",
  supabaseProject: "Supabase project identity",
  applicationRole: "Application database role",
  applicationRolePrivileges: "Application role restrictions",
  productionDatabase: "Production database not used",
};

export default function PreviewRuntimeVerification() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState<VerificationResponse["checks"]>();

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const token = formData.get("verificationToken");
    if (typeof token !== "string" || !token) {
      setChecks(undefined);
      setMessage("Enter the Preview verification token configured in Vercel.");
      return;
    }

    setPending(true);
    setChecks(undefined);
    setMessage("Running read-only checks against the Preview application database…");
    try {
      const response = await fetch("/api/admin/preview-runtime-check", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as VerificationResponse | null;
      if (data?.checks) {
        setChecks(data.checks);
        setMessage(data.ok ? "All runtime verification checks passed." : "One or more runtime checks failed. Do not create an Admin account.");
      } else {
        const errorMessages: Record<string, string> = {
          preview_target_only: "This check is only enabled on the approved Preview branch.",
          same_origin_required: "The request was not accepted as same-origin. Reload this page and retry.",
          rate_limited: "Too many attempts. Wait one minute before retrying.",
          verification_not_configured: "The Preview verification token is not configured correctly.",
          not_authorized: "The verification token was not accepted.",
          invalid_request: "The verification request was invalid. Reload the page and retry.",
        };
        setMessage(errorMessages[data?.error ?? ""] ?? `Verification failed (HTTP ${response.status}).`);
      }
    } catch {
      setMessage("The verification request did not complete. Check the Preview page connection and retry.");
    } finally {
      // Do not retain the token in React state or browser storage.
      form.reset();
      setPending(false);
    }
  }

  const allPassed = checks ? Object.values(checks).every((check) => check.status === "PASS") : false;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <section className="rounded-3xl border border-[#e9ddc3] bg-white p-7 shadow-sm sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c7431f]">Temporary Preview check</p>
        <h1 className="mt-2 text-2xl font-black text-[#1c1917]">Preview database verification</h1>
        <p className="mt-3 text-sm leading-6 text-[#57534e]">
          This performs a fixed, read-only query through the same server-side PostgreSQL pool used by the Admin application. It checks the Preview deployment, branch, Supabase project, and restricted application role. No Admin account or database records are changed.
        </p>

        <form onSubmit={verify} className="mt-6 grid gap-3">
          <label htmlFor="preview-runtime-token" className="text-sm font-bold text-[#1c1917]">Preview verification token</label>
          <input
            id="preview-runtime-token"
            name="verificationToken"
            type="password"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            pattern="[0-9a-fA-F]{64}"
            required
            aria-describedby="preview-runtime-token-help"
            className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 font-mono outline-none focus:border-[#1c1917]"
          />
          <p id="preview-runtime-token-help" className="text-xs leading-5 text-[#6f6862]">
            Use the 64-character hexadecimal value you configured for the Preview-only PREVIEW_RUNTIME_VERIFY_TOKEN variable. It is sent only in the POST body and is cleared from this form after the request.
          </p>
          <button type="submit" disabled={pending} className="mt-2 rounded-xl bg-[#1c1917] px-5 py-3 font-extrabold text-white hover:bg-black disabled:cursor-wait disabled:opacity-60">
            {pending ? "Verifying…" : "Verify Preview database"}
          </button>
        </form>

        {message && <p role={checks ? "status" : "alert"} className={`mt-5 rounded-xl px-4 py-3 text-sm font-semibold ${allPassed ? "bg-green-50 text-green-800" : checks ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{message}</p>}

        {checks && (
          <ul className="mt-4 divide-y divide-[#eee6d8] rounded-xl border border-[#eee6d8]">
            {(Object.keys(CHECK_LABELS) as Array<keyof typeof CHECK_LABELS>).map((key) => {
              const check = checks[key];
              const detail = key === "environment"
                ? `Expected ${check.expected}; actual ${check.actual ?? "unavailable"}`
                : key === "branch"
                  ? `Expected ${check.expected}; actual ${check.actual ?? "unavailable"}`
                  : key === "supabaseProject"
                    ? `Expected ${check.expectedProject} (${check.expectedProjectRef}); actual ${check.actualProjectRef ?? "unidentified"}`
                    : key === "applicationRole"
                      ? `Expected ${check.expected}; actual ${check.actual ?? "unavailable"}`
                      : key === "applicationRolePrivileges"
                        ? `Expected ${check.expected}; actual ${check.actual ?? "unavailable"}`
                        : key === "productionDatabase"
                        ? check.detected === true ? "Production database detected" : check.detected === false ? "Current Production system identifier not detected" : "Production usage not verified"
                        : key === "databaseConnection"
                          ? `Stage: ${check.stage ?? "unavailable"}. ${check.connectionEstablished ? "Connection established" : "Connection not established"}; SELECT 1 ${check.selectOneSucceeded ? "succeeded" : "did not succeed"}; identity query ${check.identityQuerySucceeded ? "succeeded" : "did not succeed"}. Config: URL ${check.configuration?.urlConfigured ? "set" : "missing"}/${check.configuration?.urlParseable ? "valid" : "invalid"}; Preview target ${check.configuration?.configuredPreviewProject ? "matches" : "does not match"}; role ${check.configuration?.configuredApplicationRole ? "matches" : "does not match"}; CA PEM ${check.configuration?.caCertificateConfigured ? "present" : "missing/invalid"}. ${check.category ?? ""}${check.explanation ? ` — ${check.explanation}` : ""}`
                          : "Fixed read-only query through the application pool";
              return (
                <li key={key} className="flex items-start justify-between gap-4 p-4 text-sm">
                  <span className="font-semibold text-[#292524]">{CHECK_LABELS[key]}<span className="mt-1 block text-xs font-normal leading-5 text-[#6f6862]">{detail}</span></span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${check.status === "PASS" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{check.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
