import type { adminAuth } from "./admin-supabase";

export const DIRECT_GOOGLE_FLOW_MARKER = "yaarlink.local.direct-google.started";
// A browser marker only chooses this local flow; it does NOT authorize any
// privilege. Supabase PKCE binds the OAuth exchange, and the DB claim later
// independently checks Google identity, TOTP, authorization and lock state.
export async function finishDirectGoogleCallback(url: URL, auth: ReturnType<typeof adminAuth>): Promise<void> {
  if (url.searchParams.has("error") || url.hash || !url.searchParams.get("code") || url.searchParams.has("token_hash")) throw new Error("invalid callback");
  const { data, error } = await auth.exchangeCodeForSession(url.searchParams.get("code")!);
  if (error || !data.session) throw new Error("invalid callback");
  const user = await auth.getUser();
  const value = user.data.user;
  if (user.error || !value?.email || !value.email_confirmed_at || !value.identities?.some(identity => identity.provider === "google" && identity.identity_data?.email_verified === true && typeof identity.identity_data?.email === "string" && identity.identity_data.email.toLowerCase() === value.email!.toLowerCase())) throw new Error("verified Google account required");
}
