import { db } from "@/backend/db";
import { users } from "@/backend/db/schema";
import { hashPassword, setSessionCookie } from "@/backend/auth";
import { eq } from "drizzle-orm";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "signup"), 5, 15 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const b = await req.json();
    const name = String(b.name || "").trim();
    const email = String(b.email || "").toLowerCase().trim();
    const password = String(b.password || "");
    if (!name || !email || !password) return Response.json({ error: "Name, email and password required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Please enter a valid email." }, { status: 400 });
    if (password.length < 10) return Response.json({ error: "Password must be at least 10 characters." }, { status: 400 });

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    // M4: don't disclose whether the email is already registered — respond exactly like a fresh signup.
    if (existing.length) return Response.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });

    const [row] = await db
      .insert(users)
      .values({
        name: name.slice(0, 100),
        email: email.slice(0, 160),
        phone: b.phone ? String(b.phone).slice(0, 20) : null,
        role: b.role === "creator" ? "creator" : "brand",
        passwordHash: await hashPassword(password),
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    await setSessionCookie(row.id, 0);
    return Response.json({ user: row }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not sign up" }, { status: 500 });
  }
}
