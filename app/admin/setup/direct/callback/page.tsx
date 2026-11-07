"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth } from "@/lib/admin-supabase";
import { isLocalAdminTarget } from "@/lib/admin-local-config";
import { DIRECT_GOOGLE_FLOW_MARKER, finishDirectGoogleCallback } from "@/lib/admin-direct-google";

export default function LocalGoogleCallback() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", url.pathname);
    const marker = sessionStorage.getItem(DIRECT_GOOGLE_FLOW_MARKER);
    sessionStorage.removeItem(DIRECT_GOOGLE_FLOW_MARKER);
    void (async () => {
      if (!isLocalAdminTarget(process.env.NEXT_PUBLIC_YAARLINK_LOCAL_ADMIN, process.env.NODE_ENV, process.env.NEXT_PUBLIC_VERCEL_ENV, window.location.origin) || marker !== "started") throw new Error("invalid flow");
      await finishDirectGoogleCallback(url, adminAuth());
      router.replace("/admin/setup/direct/password");
    })().catch(() => setError("The local test Google login could not be verified. Start again from the local setup page."));
  }, [router]);
  return <main style={{ padding: 40, fontFamily: "system-ui,sans-serif" }}><h1>Local Google verification</h1>{error ? <p role="alert">{error}</p> : <p>Verifying…</p>}</main>;
}
