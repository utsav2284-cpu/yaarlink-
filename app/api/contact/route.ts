import { db } from "@/backend/db";
import { contacts } from "@/backend/db/schema";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
export const dynamic = "force-dynamic";

// Messages are owner-only — read them via /api/admin/data.

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "contact"), 5, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const b = await req.json();
    if (String(b.website_url || "").trim()) return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    const name = String(b.name || "").trim();
    const message = String(b.message || "").trim();
    if (!name || !message) return Response.json({ error: "Name and message required" }, { status: 400 });
    if (name.length > 100 || message.length > 2000) return Response.json({ error: "Please keep the form within the allowed length." }, { status: 400 });
    const email = b.email ? String(b.email).toLowerCase().trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Please enter a valid email." }, { status: 400 });
    const requestedKind = typeof b.kind === "string" ? b.kind.trim().toLowerCase() : "";
    const kind = requestedKind === "creator" || requestedKind === "other" ? requestedKind : "brand";
    const [row] = await db
      .insert(contacts)
      .values({
        name: name.slice(0, 100),
        email: email ? email.slice(0, 120) : null,
        phone: b.phone ? String(b.phone).slice(0, 20) : null,
        kind,
        message: message.slice(0, 2000),
      })
      .returning();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not send" }, { status: 500 });
  }
}
