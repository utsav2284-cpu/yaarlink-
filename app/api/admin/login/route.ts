import { adminSecretProblem, createAdminSession, verifyAdminPassword } from "@/backend/admin";
import { authLockoutSeconds, clearAuthFailures, getClientKey, limitedResponse, rateLimit, registerAuthFailure } from "@/backend/rate-limit";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  // C1: refuse to operate unless a distinct admin signing secret is configured.
  if (adminSecretProblem()) {
    return Response.json({ error: "Admin login is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const clientKey = getClientKey(req, "admin-login");
  const rl = rateLimit(clientKey, 5, 5 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  // H1: hard lockout + exponential backoff on repeated failures from this client.
  const locked = authLockoutSeconds(clientKey);
  if (locked > 0) return limitedResponse(locked);
  try {
    const b = await req.json(); const password = String(b.password || "");
    if (!password) return Response.json({ error: "Password required" }, { status: 400 });
    if (!(await verifyAdminPassword(password))) {
      const lockFor = registerAuthFailure(clientKey);
      if (lockFor > 0) return Response.json({ error: "Too many failed attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(lockFor), "Cache-Control": "no-store" } });
      return Response.json({ error: "Wrong password" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const priorFailures = clearAuthFailures(clientKey);
    if (priorFailures > 0) console.warn(`[admin-login] success after ${priorFailures} failed attempt(s) from ${clientKey}`);
    await createAdminSession();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { console.error(e); return Response.json({ error: "Could not log in" }, { status: 500 }); }
}
