"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth } from "@/lib/admin-supabase";

export default function AdminResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 12) { setError("Use at least 12 characters (the Preview Auth minimum must also be configured server-side)."); return; }
    const { error } = await adminAuth().updateUser({ password });
    if (error) setError("This reset link is invalid or expired. Request a new one from the sign-in page.");
    else router.replace("/admin/mfa");
  }
  return (
    <main style={{ minHeight: "100vh", background: "#f6f7fb", padding: 20, fontFamily: "system-ui,sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, maxWidth: 420, margin: "8vh auto" }}>
        <h1>Set a new password</h1>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="New password (12+ characters)" style={{ width: "100%", padding: 11, border: "1px solid #d1d5db", borderRadius: 10, boxSizing: "border-box" }} />
        {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
        <button style={{ width: "100%", padding: 12, marginTop: 14, borderRadius: 10, border: 0, background: "#1d4ed8", color: "#fff", fontWeight: 700 }}>Update password</button>
      </form>
    </main>
  );
}
