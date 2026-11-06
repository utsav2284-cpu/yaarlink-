"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminAuth, adminSupabase } from "@/lib/admin-supabase";

const box: React.CSSProperties = { background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, maxWidth: 500, margin: "6vh auto" };
const field: React.CSSProperties = { width: "100%", padding: 11, margin: "6px 0 14px", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 10 };
const invalid = "The invitation is invalid, expired, already used, or does not match your confirmed account. Contact your trusted operator to request a new invitation.";

export default function BootstrapSetup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [factor, setFactor] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invitation, setInvitation] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [validated, setValidated] = useState(false);
  useEffect(() => { let cancelled = false; void (async () => {
    try {
      const { data, error } = await adminAuth().getUser();
      if (error || !data.user || !data.user.email_confirmed_at || !data.user.email) return;
      const result = await adminAuth().mfa.listFactors();
      if (cancelled) return;
      setEmail(data.user.email);
      if (result.error) { setError("Could not verify authenticator status. Try again later."); return; }
      setFactor(result.data?.totp?.find(f => f.status === "verified")?.id ?? "");
    } catch { if (!cancelled) setError("Unable to contact Preview authentication. Try again later."); }
  })(); return () => { cancelled = true; }; }, []);

  async function validate(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    setError(""); setValidated(false);
    const token = invitation.trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) { setError(invalid); return; }
    setBusy(true);
    try {
      const { data, error } = await adminSupabase().schema("admin").rpc("validate_first_owner_invitation", { p_invitation_token: token });
      if (error) { setError("Invitation verification is unavailable. Please try again later or contact your trusted operator."); return; }
      if (data !== true) { setError(invalid); return; }
      setValidated(true);
    } catch { setError("Invitation verification is unavailable. Please try again later or contact your trusted operator."); }
    finally { setBusy(false); }
  }
  async function claim(e: FormEvent) {
    e.preventDefault(); if (busy || !validated) return;
    setError("");
    const token = invitation.trim();
    if (!email || !factor) { setError("A confirmed email and verified authenticator are required."); return; }
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
      setInvitation(""); setValidated(false);
      if (error || !data) {
        if (error?.message?.includes("invalid_invitation") || error?.message?.includes("bootstrap_invitation_not_found")) setError(invalid);
        else setError("The claim could not be completed. Contact your trusted operator before retrying.");
        return;
      }
      router.replace("/admin");
    } catch { setError("Authenticator verification or the claim request failed. Check your code and connection, then retry."); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", background: "#f6f7fb", padding: 20, fontFamily: "system-ui,sans-serif" }}><div style={box}>
    <h1>First administrator setup</h1>
    <p>First Administrator Setup requires a trusted invitation. Please open the secure setup link sent to your registered email address.</p>
    <p>To get started: (1) accept your invitation and choose your own password, (2) set up your authenticator, and (3) enter the separate setup token to finish.</p>
    <p>Your trusted operator delivers the protected setup token separately. This page does not create an account or invitation.</p>
    {!email ? <p>Accept your Auth invitation, set your own password and confirm your email, then <Link href="/admin/login">sign in</Link> before entering the token. Never share your password or authenticator code.</p> : <>
      {!showToken && <button type="button" onClick={() => setShowToken(true)}>I have a trusted setup token</button>}
      {showToken && !validated && <form onSubmit={validate}>
        <label>Setup token<input style={field} type="password" autoComplete="off" value={invitation} onChange={e => setInvitation(e.target.value)} required /></label>
        <button disabled={busy} type="submit">{busy ? "Checking…" : "Verify invitation"}</button>
      </form>}
      {validated && <>
        <p role="status">Invitation verified for your confirmed account. The final claim will check it again.</p>
        {!factor ? <p><Link href="/admin/mfa">Enroll and verify an authenticator</Link>, then return here and re-enter your setup token. The token is not saved in your browser.</p> : <form onSubmit={claim}>
          <label>Display name<input style={field} value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={100} required /></label>
          <label>Fresh authenticator code<input style={field} value={totp} onChange={e => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></label>
          <button disabled={busy} type="submit">{busy ? "Verifying…" : "Verify and claim"}</button>
        </form>}
      </>}
    </>}
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    <p><Link href="/admin/login">Return to sign in</Link></p>
  </div></main>;
}
