"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth } from "@/lib/admin-supabase";

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, maxWidth: 420, margin: "8vh auto" };
const input: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #d1d5db", borderRadius: 10, margin: "6px 0 14px", boxSizing: "border-box" };

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const { error } = await adminAuth().signInWithPassword({ email: email.trim(), password });
      if (error) { setError("Invalid credentials, or this account is not an invited administrator."); return; }
      const { data: aal } = await adminAuth().mfa.getAuthenticatorAssuranceLevel();
      router.replace(aal?.nextLevel === "aal2" || !aal ? "/admin/mfa" : "/admin");
    } catch { setError("Admin Preview is not configured in this environment."); } finally { setBusy(false); }
  }
  async function reset() {
    setError(""); setInfo("");
    if (!email.trim()) { setError("Enter your email first, then request a password reset."); return; }
    setBusy(true);
    try {
      const { error } = await adminAuth().resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin/auth/callback` });
      if (error) setError("Could not request a reset email. Check the configuration and try again.");
      else setInfo("If the account is eligible, a reset email may arrive; delivery depends on email configuration.");
    } catch { setError("Could not request a reset email. Check the configuration and try again."); }
    finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7fb", padding: 20, fontFamily: "system-ui,sans-serif", color: "#111827" }}>
      <form onSubmit={login} style={card}>
        <div style={{ fontWeight: 800, fontSize: 22 }}>YaarLink <span style={{ color: "#2563eb" }}>Admin</span></div>
        <p style={{ color: "#6b7280" }}>Administrator sign-in · Preview environment · Invitation-only. There is no public registration.</p>
        <label>Email<input style={input} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input style={input} type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
        {info && <p style={{ color: "#15803d" }}>{info}</p>}
        <button disabled={busy} style={{ width: "100%", padding: 12, borderRadius: 10, border: 0, background: "#1d4ed8", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" disabled={busy} onClick={reset} style={{ width: "100%", padding: 10, marginTop: 10, background: "transparent", border: 0, color: "#2563eb", cursor: "pointer" }}>Forgot password?</button>
        <section aria-labelledby="first-admin-heading" style={{ marginTop: 20, padding: 16, background: "#f8faff", border: "1px solid #dbeafe", borderRadius: 10 }}>
          <h2 id="first-admin-heading" style={{ fontSize: 16, margin: "0 0 8px" }}>First time setting up YaarLink Admin?</h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>A trusted invitation is required. This does not create an account or grant access.</p>
          <a href="/admin/setup" style={{ display: "block", textAlign: "center", border: "1px solid #1d4ed8", borderRadius: 10, padding: 10, color: "#1d4ed8", fontWeight: 700, textDecoration: "none" }}>Set Up First Administrator</a>
        </section>
        <p style={{ fontSize: 12, color: "#6b7280" }}>MFA (authenticator app) is mandatory after sign-in. Demo visual preview: <a href="/admin-preview">/admin-preview</a> (synthetic, no admin powers).</p>
      </form>
    </main>
  );
}
