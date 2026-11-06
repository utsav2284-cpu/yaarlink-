"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { adminAuth, adminSupabase } from "@/lib/admin-supabase";

type Result = { name: string; detail: string };
const url = "https://qwngmsedyepghskoagaj.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Diagnostics intentionally avoid retrieving records or changing any row.
// Permission errors are reported, not interpreted as proof of end-to-end security.
export default function AdminDiagnostics() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setResults([]);
    const rows: Result[] = [];
    const add = (name: string, detail: string) => rows.push({ name, detail });
    try {
      if (!key) throw new Error("Preview publishable key is not configured.");
      const auth = adminAuth();
      const { data: user, error: userError } = await auth.getUser();
      if (userError || !user.user) throw new Error("Sign in with a synthetic Preview test account first.");
      const assurance = await auth.mfa.getAuthenticatorAssuranceLevel();
      add("Session assurance", assurance.error ? "Unable to verify" : assurance.data.currentLevel ?? "Unavailable");
      const anon = createClient(url, key, { db: { schema: "preview" }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const anonymousRead = await anon.from("preview_creators").select("id", { count: "exact", head: true });
      add("Anonymous queue read", anonymousRead.error ? `Denied or unavailable (${anonymousRead.error.code || 'unknown'})` : "Unexpected access — investigate");
      const db = adminSupabase();
      const queue = await db.from("preview_creators").select("id", { count: "exact", head: true });
      add("Current-session creator queue", queue.error ? `Denied or unavailable (${queue.error.code || 'unknown'})` : `HTTP request succeeded; visible rows: ${queue.count ?? 'unknown'} (zero rows alone is not proof of denial)`);
      const campaign = await db.from("preview_campaigns").select("id", { count: "exact", head: true });
      add("Current-session campaign queue", campaign.error ? `Denied or unavailable (${campaign.error.code || 'unknown'})` : `HTTP request succeeded; visible rows: ${campaign.count ?? 'unknown'}`);
      // Contradictory ID filters mean this PATCH cannot modify any actual row.
      const patch = await db.from("preview_creators").update({ status: "pending_review" }).eq("id", "00000000-0000-0000-0000-000000000000").eq("id", "00000000-0000-0000-0000-000000000001");
      add("Direct queue write", patch.error ? `Denied or unavailable (${patch.error.code || 'unknown'})` : "Unexpected write permission — investigate");
      // This is a read-only helper, not the owner-claim RPC.
      const privateRpc = await db.schema("admin").rpc("session_is_current");
      add("Restricted admin helper", privateRpc.error ? `Denied or unavailable (${privateRpc.error.code || 'unknown'})` : "Unexpected execution — investigate");
      for (const schema of ["audit", "security", "ops"]) {
        const resource = schema === "audit" ? "audit_log" : schema === "security" ? "security_events" : "ops_site_config";
        const result = await db.schema(schema).from(resource).select("*", { count: "exact", head: true });
        add(`${schema} schema`, result.error ? `Denied or unavailable (${result.error.code || 'unknown'})` : "Unexpected schema access — investigate");
      }
    } catch { add("Diagnostic stopped", "Unable to run. Sign in with a synthetic Preview account and check its configuration and network connection."); }
    setResults(rows); setBusy(false);
  }
  return <main style={{ padding: 24, fontFamily: "system-ui,sans-serif", maxWidth: 720 }}>
    <h1>Preview security diagnostics</h1>
    <p>Use only a synthetic Preview account. This checks API responses without exposing tokens or reading record contents. A denial may also mean configuration or network failure; inspect the browser network panel. It does not revoke sessions or exercise review actions.</p>
    <button disabled={busy} onClick={run}>{busy ? "Checking…" : "Run non-mutating checks"}</button>
    <ul>{results.map(r => <li key={r.name}><strong>{r.name}:</strong> {r.detail}</li>)}</ul>
    <p>Separately test approved review actions and revocation on disposable synthetic records. Never share credentials or tokens in chat.</p>
    <a href="/admin">Back to Control Center</a>
  </main>;
}
