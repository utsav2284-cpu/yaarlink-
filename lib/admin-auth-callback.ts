import type { adminAuth } from "./admin-supabase";

type EmailFlow = "invite" | "recovery" | "signup" | "email";
const emailFlows = new Set<string>(["invite", "recovery", "signup", "email"]);

// Never accepts a caller-supplied destination. A verified link can only lead to
// the local password-setup or MFA page; it never bypasses subsequent authorization.
export async function verifyAdminCallback(url: URL, auth: ReturnType<typeof adminAuth>): Promise<"/admin/reset-password" | "/admin/mfa"> {
  const hash = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has("error") || hash.has("error")) throw new Error("invalid");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  let flow = url.searchParams.get("type") || hash.get("type") || "";
  if (code && !tokenHash && !accessToken && !refreshToken) {
    const flowId = url.searchParams.get("sb_flow_id");
    const result = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (result.error || !result.data.session) throw new Error("invalid");
    const redirectType = (result.data as typeof result.data & { redirectType?: string | null }).redirectType;
    flow = redirectType === "recovery" ? "recovery" : flow || "invite";
  } else if (tokenHash && !code && !accessToken && !refreshToken && emailFlows.has(flow)) {
    const result = await auth.verifyOtp({ token_hash: tokenHash, type: flow as EmailFlow });
    if (result.error || !result.data.session) throw new Error("invalid");
  } else if (accessToken && refreshToken && !code && !tokenHash && emailFlows.has(flow)) {
    const result = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (result.error || !result.data.session) throw new Error("invalid");
  } else throw new Error("invalid");
  const { data, error } = await auth.getUser();
  if (error || !data.user) throw new Error("invalid");
  return flow === "invite" || flow === "recovery" ? "/admin/reset-password" : "/admin/mfa";
}
