"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { adminAuth, adminSupabase } from "@/lib/admin-supabase";
import { totpQrImageSource } from "@/lib/admin-totp-qr";
import { destinationAfterMfa } from "@/lib/admin-navigation";

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, maxWidth: 480, margin: "6vh auto" };
const input: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #d1d5db", borderRadius: 10, margin: "6px 0 14px", boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "11px 16px", borderRadius: 10, border: 0, background: "#1d4ed8", color: "#fff", fontWeight: 700, cursor: "pointer" };

export default function AdminMfa() {
  const router = useRouter();
  const [qr, setQr] = useState(""); const [secret, setSecret] = useState(""); const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState(""); const [error, setError] = useState("");
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false);


  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const auth = adminAuth();
        const { data: { session }, error: sessionError } = await auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) { if (!cancelled) router.replace("/admin/login"); return; }
        const assurance = await auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error) throw assurance.error;
        if (assurance.data?.currentLevel === "aal2") { const destination = await destinationAfterMfa(async () => await adminSupabase().schema("public").rpc("first_admin_setup_available")); if (!cancelled) router.replace(destination); return; }
        const factors = await auth.mfa.listFactors();
        if (factors.error || !factors.data) throw new Error("factor lookup failed");
        if (!cancelled) {
          setFactorId(factors.data.totp?.find(f => f.status === "verified")?.id ?? "");
          setReady(true);
        }
      } catch {
        if (!cancelled) setError("Could not verify authenticator status. Check the admin configuration and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function enroll() {
    if (busy || !ready || factorId) return;
    setError(""); setBusy(true);
    try {
      const { data, error } = await adminAuth().mfa.enroll({ factorType: "totp", friendlyName: "YaarLink Admin" });
      if (error || !data) throw new Error("enrollment failed");
      setFactorId(data.id); setSecret(data.totp.secret);
      try { setQr(totpQrImageSource(data.totp.qr_code)); }
      catch { setError("The QR image could not be displayed. Use the manual key below."); }
    } catch { setError("Authenticator enrollment failed. Reload to check your existing factors and try again."); }
    finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); if (busy || !ready) return;
    setError("");
    if (!factorId) { setError("Enroll an authenticator first, or reload to use your existing one."); return; }
    setBusy(true);
    try {
      const auth = adminAuth();
      const { data: ch, error: cErr } = await auth.mfa.challenge({ factorId });
      if (cErr || !ch) { setError("Could not start the MFA challenge."); return; }
      const { error: vErr } = await auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
      setCode("");
      if (vErr) { setError("Invalid code. Check your authenticator app and try again."); return; }
      const { data: aal, error: aalError } = await auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError || aal?.currentLevel !== "aal2") { setError("MFA did not reach AAL2. Try verifying again."); return; }
      setSecret(""); setQr("");
      router.replace(await destinationAfterMfa(async () => await adminSupabase().schema("public").rpc("first_admin_setup_available")));
    } catch { setError("Authenticator verification failed. Check the connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7fb", padding: 20, fontFamily: "system-ui,sans-serif", color: "#111827" }}>
      <div style={card}>
        <h1 style={{ marginTop: 0 }}>Two-factor authentication</h1>
        <p style={{ color: "#6b7280" }}>The Admin Control Center requires AAL2: a live, verified authenticator (TOTP) factor. Frontend state alone is never trusted — the database re-checks AAL2, session and factor on every protected operation.</p>
        {ready && !factorId && <button disabled={busy} style={btn} onClick={enroll}>Enroll authenticator</button>}
        {ready && factorId && !secret && <p>Use the code from your existing authenticator.</p>}
        {qr && <Image unoptimized src={qr} alt="Scan this QR code with your authenticator app" width={200} height={200} style={{ display: "block", margin: "12px auto" }} />}
        {secret && <p>Manual key: <code>{secret}</code></p>}
        <form onSubmit={verify}>
          <label>6-digit code<input style={input} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required /></label>
          {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
          <button disabled={!ready || busy || !factorId} style={{ ...btn, width: "100%" }}>{busy ? "Please wait…" : "Verify & continue"}</button>
        </form>
        <hr style={{ margin: "20px 0" }} />
        <p><a href="/admin/setup">First administrator setup</a> — only for an existing trusted bootstrap invitation.</p>
        <p style={{ fontSize: 12, color: "#6b7280" }}>Lost your authenticator? Contact your trusted operator. Recovery codes are not available; never share an authenticator code or password with support.</p>
      </div>
    </main>
  );
}
