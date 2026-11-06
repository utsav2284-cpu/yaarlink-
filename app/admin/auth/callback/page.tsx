"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth } from "@/lib/admin-supabase";
import { verifyAdminCallback } from "@/lib/admin-auth-callback";

export default function AdminAuthCallback() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    // Remove credentials from browser history before any asynchronous work.
    window.history.replaceState(null, "", url.pathname);
    void Promise.resolve().then(() => verifyAdminCallback(url, adminAuth())).then(destination => router.replace(destination)).catch(() => {
      setError("This link is invalid, expired, or could not be verified. Request a new link and try again.");
    });
  }, [router]);
  return <main style={{ padding: 40, fontFamily: "system-ui,sans-serif" }}>
    <h1>Admin authentication</h1>
    {error ? <><p role="alert">{error}</p><a href="/admin/login">Return to sign in</a></> : <p>Verifying your link…</p>}
  </main>;
}
