"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth } from "@/lib/admin-supabase";

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, maxWidth: 480, margin: "6vh auto" };
const input: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #d1d5db", borderRadius: 10, margin: "6px 0 14px", boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "11px 16px", borderRadius: 10, border: 0, background: "#1d4ed8", color: "#fff", fontWeight: 700, cursor: "pointer" };

export default function AdminMfa() {
  const router = useRouter();
  const [qr, setQr] = useState(""); const [secret, setSecret] = useState(""); const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState(""); const [error, setError] = useState("");

  useEffect(() => { (async () => {
    const { data: { session } } = await adminAuth().getSession();
    if (!session) { router.replace("/admin/login"); return; }
    const { data: aal } = await adminAuth().mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") { router.replace("/admin"); return; }
    const { data: factors } = await adminAuth().mfa.listFactors();
    const verified = factors?.totp?.find(f => f.status === "verified");
    if (verified) setFactorId(verified.id);
  })(); }, [router]);

  async function enroll() {
    setError("");
    const { data, error } = await adminAuth().mfa.enroll({ factorType: "totp", friendlyName: "YaarLink Admin" });
    if (error || !data) { setError("Enrollment failed. You may already have an authenticator — enter its code below."); return; }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!factorId) { setError("Enroll an authenticator first, or reload to use your existing one."); return; }
    const { data: ch, error: cErr } = await adminAuth().mfa.challenge({ factorId });
    if (cErr || !ch) { setError("Could not start the MFA challenge."); return; }
    const { error: vErr } = await adminAuth().mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    if (vErr) { setError("Invalid code. Check your authenticator app and try again."); return; }
    const { data: aal } = await adminAuth().mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") { setError("MFA did not reach AAL2. Try verifying again."); return; }
    router.replace("/admin");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7fb", padding: 20, fontFamily: "system-ui,sans-serif", color: "#111827" }}>
      <div style={card}>
        <h1 style={{ marginTop: 0 }}>Two-factor authentication</h1>
        <p style={{ color: "#6b7280" }}>The Admin Control Center requires AAL2: a live, verified authenticator (TOTP) factor. Frontend state alone is never trusted — the database re-checks AAL2, session and factor on every protected operation.</p>
        {!qr && <button style={btn} onClick={enroll}>Enroll authenticator</button>}
        {qr && <><div dangerouslySetInnerHTML={{ __html: qr }} style={{ width: 200, margin: "12px auto" }} /><p>Manual key: <code>{secret}</code></p></>}
        <form onSubmit={verify}>
          <label>6-digit code<input style={input} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required /></label>
          {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
          <button style={{ ...btn, width: "100%" }}>Verify &amp; continue</button>
        </form>
        <hr style={{ margin: "20px 0" }} />
        <p><a href="/admin/setup">First administrator setup</a> — only for an existing trusted bootstrap invitation.</p>
        <p style={{ fontSize: 12, color: "#6b7280" }}>Lost your authenticator? Contact your trusted operator. Recovery codes are not available; never share an authenticator code or password with support.</p>
      </div>
    </main>
  );
}
