import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Reviewed public-env change (see backend/public-env.ts): these canonical names point ONLY at the
// dedicated Preview project yaarlink-admin-preview-v2 (qwngmsedyepghskoagaj), never Production.
// The publishable key is public-safe by design; every data operation is enforced server-side by
// RLS policies and SECURITY DEFINER RPCs (AAL2 + live TOTP + RBAC) in the Preview database.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://qwngmsedyepghskoagaj.supabase.co";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let client: SupabaseClient<any, any, any> | null = null;
export function adminSupabase(): SupabaseClient<any, any, any> {
  if (!publishableKey) throw new Error("Admin Preview is not configured (missing publishable key).");
  client ??= createClient(url, publishableKey, { db: { schema: "preview" } });
  return client;
}
export function adminAuth() {
  return adminSupabase().auth;
}
