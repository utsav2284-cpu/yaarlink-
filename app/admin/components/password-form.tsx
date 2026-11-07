"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth } from "@/lib/admin-supabase";
import { isLocalAdminTarget } from "@/lib/admin-local-config";

export default function AdminPasswordForm({ invitation = false, directLocal = false }: { invitation?: boolean; directLocal?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 12) { setError("Use at least 12 characters."); return; }
    setError("");
    try {
      if (directLocal && !isLocalAdminTarget(process.env.NEXT_PUBLIC_YAARLINK_LOCAL_ADMIN, process.env.NODE_ENV, process.env.NEXT_PUBLIC_VERCEL_ENV, window.location.origin)) throw new Error("local only");
      const { error } = await adminAuth().updateUser({ password });
      if (error) setError(directLocal ? "The local Google session is invalid or expired. Start again." : invitation ? "Your invitation session is invalid or expired. Contact your trusted operator." : "This reset link is invalid or expired. Request a new one from the sign-in page.");
      else router.replace("/admin/mfa");
    } catch { setError("The password could not be updated. Check the authentication configuration and try again."); }
  }
  return (
    <main style={{ minHeight: "100vh", background: "#f6f7fb", padding: 20, fontFamily: "system-ui,sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24, maxWidth: 420, margin: "8vh auto" }}>
        <h1>{invitation || directLocal ? "First administrator setup" : "Set a new password"}</h1>
        {(invitation || directLocal) && <p>Choose your own password, then enroll and verify an authenticator before completing setup with your separate trusted token.</p>}
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="New password (12+ characters)" style={{ width: "100%", padding: 11, border: "1px solid #d1d5db", borderRadius: 10, boxSizing: "border-box" }} />
        {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
        <button style={{ width: "100%", padding: 12, marginTop: 14, borderRadius: 10, border: 0, background: "#1d4ed8", color: "#fff", fontWeight: 700 }}>Update password</button>
      </form>
    </main>
  );
}
