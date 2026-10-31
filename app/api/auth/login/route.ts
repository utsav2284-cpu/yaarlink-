import { db } from "@/backend/db";
import { users } from "@/backend/db/schema";
import { hashPassword, setSessionCookie, verifyPassword } from "@/backend/auth";
import { eq } from "drizzle-orm";
import { getClientKey, hashKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "login"), 10, 5 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const b = await req.json();
    const email = String(b.email || "").toLowerCase().trim();
    const password = String(b.password || "");
    const accountRl = rateLimit(`login-account:${hashKey(email)}`, 12, 15 * 60_000);
    if (!accountRl.ok) return limitedResponse(accountRl.retryAfter);
    if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Same message for unknown email and wrong password, so emails can't be probed.
    const fail = () => Response.json({ error: "Wrong email or password." }, { status: 400 });
    if (!rows.length) return fail();

    const u = rows[0];
    const { ok, needsRehash } = await verifyPassword(password, u.passwordHash);
    if (!ok) return fail();
    if (needsRehash) {
      await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, u.id));
    }

    await setSessionCookie(u.id, u.tokenVersion, req);
    return Response.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not log in" }, { status: 500 });
  }
}
