"use client";
import { useState } from "react";
import Link from "next/link";
import { adminAuth } from "@/lib/admin-supabase";
import { isLocalAdminTarget } from "@/lib/admin-local-config";
import { DIRECT_GOOGLE_FLOW_MARKER } from "@/lib/admin-direct-google";

// This experimental route is local-only. It cannot provision or claim an owner
// and is not a hosted Preview setup URL.
export default function DirectSetup() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function begin() {
    if (busy) return;
    setError("");
    try {
      if (!isLocalAdminTarget(process.env.NEXT_PUBLIC_YAARLINK_LOCAL_ADMIN, process.env.NODE_ENV, process.env.NEXT_PUBLIC_VERCEL_ENV, window.location.origin)) throw new Error("local only");
      setBusy(true);
      sessionStorage.setItem(DIRECT_GOOGLE_FLOW_MARKER, "started");
      const { error } = await adminAuth().signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/admin/setup/direct/callback` } });
      if (error) throw error;
    } catch {
      sessionStorage.removeItem(DIRECT_GOOGLE_FLOW_MARKER);
      setBusy(false);
      setError("Local Google authentication could not be started. This experimental setup is not available on hosted Preview.");
    }
  }
  return <main style={{ maxWidth: 520, margin: "8vh auto", padding: 24, fontFamily: "system-ui,sans-serif" }}>
    <h1>Experimental local first-owner setup</h1>
    <p>For isolated synthetic testing only. Setup and recovery are not complete; this page cannot be used to register an owner.</p>
    <button type="button" disabled={busy} onClick={begin}>{busy ? "Redirecting…" : "Continue with test Google account"}</button>
    {error && <p role="alert">{error}</p>}
    <p><Link href="/admin/login">Return to sign in</Link></p>
  </main>;
}
