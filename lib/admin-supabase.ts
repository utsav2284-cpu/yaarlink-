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

// Production exposes only narrow public RPC wrappers; Preview uses its existing
// admin schema. The selected project was already pinned by adminSupabase().
const RPCS = {
  register_my_session: "production_admin_register_session",
  validate_first_owner_invitation: "production_admin_validate_invitation",
  claim_invited_first_owner: "production_admin_claim_owner",
  marketplace_review_queue: "production_admin_review_queue",
  marketplace_review_decision: "production_admin_review_decision",
} as const;
export function adminRpc(name: keyof typeof RPCS, args?: Record<string, unknown>) {
  const production = deployment === "production";
  return adminSupabase().schema(production ? "public" : "admin").rpc(production ? RPCS[name] : name, args);
}
