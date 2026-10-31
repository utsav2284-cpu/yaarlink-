import { db } from "@/backend/db";
import { brands, creators, users } from "@/backend/db/schema";
import { hashPassword, setSessionCookie } from "@/backend/auth";
import { eq } from "drizzle-orm";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

function isEmailUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; constraint?: unknown; detail?: unknown; cause?: unknown };
    if (record.code === "23505") {
      const constraint = typeof record.constraint === "string" ? record.constraint : "";
      const detail = typeof record.detail === "string" ? record.detail : "";
      if (constraint === "users_email_key" || constraint === "users_email_lower_key" || detail.includes("(email)=")) return true;
    }
    current = record.cause;
  }
  return false;
}

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

    const cleanName = name.slice(0, 100);
    const cleanEmail = email.slice(0, 160);
    const cleanPhone = b.phone ? String(b.phone).slice(0, 20) : null;
    const role = b.role === "creator" ? "creator" : "brand";
    const passwordHash = await hashPassword(password);

    // Keep the auth account and its role-specific record in sync: brand
    // signups also land in `brands`, creator signups in `creators`.
    const row = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role,
          passwordHash,
        })
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

      if (role === "brand") {
        await tx.insert(brands).values({
          userId: user.id,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          status: "active",
        });
      } else {
        await tx.insert(creators).values({
          userId: user.id,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          status: "incomplete",
        });
      }

      return user;
    });

    await setSessionCookie(row.id, 0);
    return Response.json({ user: row }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // A parallel signup can pass the existence read and lose at the DB unique
    // index. Preserve the anti-enumeration response for that case.
    if (isEmailUniqueViolation(e)) return Response.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    console.error(e);
    return Response.json({ error: "Could not sign up" }, { status: 500 });
  }
}
