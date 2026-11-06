import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSupabaseTarget } from "./admin-target-config";

// Production and Preview use their own pinned identity projects. The public
// key is not authorization: privileged operations still require database RPC
// checks. Missing Production setup fails closed.
const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const deployment = process.env.NEXT_PUBLIC_VERCEL_ENV;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let client: SupabaseClient<any, any, any> | null = null;
export function adminSupabase(): SupabaseClient<any, any, any> {
  const { url, production } = requireAdminSupabaseTarget(deployment, configuredUrl);
  if (!publishableKey) throw new Error("Admin authentication is not configured (missing publishable key).");
  client ??= createClient(url, publishableKey, { db: { schema: production ? "public" : "preview" }, auth: { detectSessionInUrl: false } });
  return client;
}
export function adminAuth() {
  return adminSupabase().auth;
}
