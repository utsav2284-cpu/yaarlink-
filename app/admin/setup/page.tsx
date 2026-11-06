"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { adminAuth, adminSupabase } from "@/lib/admin-supabase";

const box: React.CSSProperties = { background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, maxWidth: 500, margin: "6vh auto" };
const field: React.CSSProperties = { width: "100%", padding: 11, margin: "6px 0 14px", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 10 };

export default function BootstrapSetup() {
  const [email, setEmail] = useState("");
  const [factor, setFactor] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invitation, setInvitation] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { void (async () => {
    try {
      const { data, error } = await adminAuth().getUser();
      if (error || !data.user) { setError("Sign in with the account invited by your trusted operator before continuing."); return; }
      if (!data.user.email_confirmed_at || !data.user.email) { setError("Confirm your invited email before continuing."); return; }
      setEmail(data.user.email);
      const result = await adminAuth().mfa.listFactors();
      if (result.error) { setError("Could not verify authenticator status. Try again later."); return; }
      setFactor(result.data?.totp?.find(f => f.status === "verified")?.id ?? "");
    } catch { setError("Unable to contact Preview authentication. Try again later."); }
  })(); }, []);

  async function claim(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    setError("");
    const token = invitation.trim();
    if (!email || !factor) { setError("A confirmed email and verified authenticator are required."); return; }
    if (!/^[a-f0-9]{64}$/i.test(token)) { setError("Enter the 64-character bootstrap invitation token supplied by your trusted operator."); return; }
    if (!/^\d{6}$/.test(totp.trim())) { setError("Enter the six-digit authenticator code."); return; }
    setBusy(true);
    try {
      const auth = adminAuth();
      const challenge = await auth.mfa.challenge({ factorId: factor });
      if (challenge.error || !challenge.data) throw new Error("mfa");
      const verified = await auth.mfa.verify({ factorId: factor, challengeId: challenge.data.id, code: totp.trim() });
      setTotp("");
      if (verified.error) throw new Error("mfa");
      const { data, error } = await adminSupabase().schema("admin").rpc("claim_invited_first_owner", { p_display_name: displayName.trim(), p_invitation_token: token });
      setInvitation("");
      if (error || !data) {
        const code = error?.message ?? "";
        if (code.includes("bootstrap_locked")) setError("Bootstrap has already been claimed and is permanently locked. Contact the operator if this is unexpected.");
        else if (code.includes("invalid_invitation") || code.includes("bootstrap_invitation_not_found")) setError("The invitation is invalid, expired, already used, or does not match this account. Contact your trusted operator.");
        else setError("The claim could not be completed. No success has been assumed; contact your trusted operator or retry after verification.");
        return;
      }
      setDone(true);
    } catch { setError("Authenticator verification or the claim request failed. Check your code and connection, then retry."); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", background: "#f6f7fb", padding: 20, fontFamily: "system-ui,sans-serif" }}><div style={box}>
    <h1>First administrator setup</h1>
    <p>This restricted Preview flow is only for an existing operator-authorized bootstrap invitation. It does not create an account or invitation.</p>
    {done ? <><p role="status">The owner claim completed successfully.</p><Link href="/admin">Continue to the Control Center</Link></> : <>
      <ol><li>Accept the trusted operator’s invitation and sign in using its verified email.</li><li><Link href="/admin/mfa">Enroll and verify an authenticator</Link> if needed.</li><li>Enter the separate bootstrap token and a fresh authenticator code below.</li></ol>
      {email && <p>Signed in as: <strong>{email}</strong></p>}
      {email && !factor && <p>No verified TOTP factor found. Complete authenticator enrollment first.</p>}
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      <form onSubmit={claim}>
        <label>Display name<input style={field} value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={100} required /></label>
        <label>Bootstrap invitation token<input style={field} type="password" autoComplete="off" value={invitation} onChange={e => setInvitation(e.target.value)} required /></label>
        <label>Fresh authenticator code<input style={field} value={totp} onChange={e => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></label>
        <button disabled={busy || !email || !factor} type="submit">{busy ? "Verifying…" : "Verify and claim"}</button>
      </form>
      <p><Link href="/admin/login">Return to sign in</Link></p>
    </>}
  </div></main>;
}
