import { db } from "@/backend/db";
import { creators } from "@/backend/db/schema";
import { desc, eq, isNull, ne, or } from "drizzle-orm";
import { getSessionUser } from "@/backend/auth";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Public listing: phone and email stay private (owner sees them in /admin).
    const rows = await db
      .select({
        id: creators.id,
        name: creators.name,
        instagram: creators.instagram,
        youtube: creators.youtube,
        profileUrl: creators.profileUrl,
        platform: creators.platform,
        followers: creators.followers,
        category: creators.category,
        languages: creators.languages,
        location: creators.location,
        contentTypes: creators.contentTypes,
        bio: creators.bio,
        status: creators.status,
        createdAt: creators.createdAt,
      })
      .from(creators)
      // Signup creates a starter row; only completed profiles are public.
      .where(or(isNull(creators.status), ne(creators.status, "incomplete")))
      .orderBy(desc(creators.createdAt))
      .limit(50);
    return Response.json({ creators: rows });
  } catch (e) {
    console.error(e);
    return Response.json({ creators: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(getClientKey(req, "creator-create"), 5, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const b = await req.json();
    const user = await getSessionUser().catch(() => null);
    if (!user) return Response.json({ error: "Please log in as a creator before creating your profile." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (user.role !== "creator") return Response.json({ error: "Only creator accounts can create creator profiles." }, { status: 403 });
    if (!b.email) b.email = user.email;
    if (!b.name) return Response.json({ error: "Name is required" }, { status: 400 });
    const email = b.email ? String(b.email).toLowerCase().trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Please enter a valid email." }, { status: 400 });
    const urlFields = ["instagram", "youtube", "profileUrl"] as const;
    for (const field of urlFields) { if (b[field]) { try { const u = new URL(String(b[field])); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); } catch { return Response.json({ error: `Please enter a valid ${field} URL.` }, { status: 400 }); } } }
    const followers = typeof b.followers === "string" ? parseInt(b.followers.replace(/[^0-9]/g, "") || "0", 10) : Number(b.followers || 0);
    if (!Number.isInteger(followers) || followers < 0 || followers > 100_000_000) return Response.json({ error: "Please enter a valid follower count." }, { status: 400 });
    const values = {
      userId: user.id,
      name: String(b.name).slice(0, 100),
      email: email ? email.slice(0, 120) : null,
      phone: b.phone ? String(b.phone).slice(0, 20) : null,
      instagram: b.instagram ? String(b.instagram).slice(0, 160) : null,
      youtube: b.youtube ? String(b.youtube).slice(0, 160) : null,
      profileUrl: b.profileUrl ? String(b.profileUrl).slice(0, 200) : null,
      platform: b.platform ? String(b.platform).slice(0, 40) : "Instagram",
      followers: isNaN(followers) ? 0 : followers,
      category: b.category ? String(b.category).slice(0, 60) : null,
      languages: Array.isArray(b.languages) ? b.languages.join(", ") : String(b.languages || "English").slice(0, 120),
      location: b.location ? String(b.location).slice(0, 100) : null,
      contentTypes: Array.isArray(b.contentTypes) ? b.contentTypes.join(", ") : String(b.contentTypes || "Story").slice(0, 160),
      bio: b.bio ? String(b.bio).slice(0, 500) : null,
      status: "pending",
    };

    const existing = await db.select({ id: creators.id, status: creators.status }).from(creators).where(eq(creators.userId, user.id)).limit(1);
    if (existing.length) {
      // Signup creates a starter `incomplete` row; completing the profile
      // updates that same row instead of creating a second profile.
      if (existing[0].status !== "incomplete") return Response.json({ error: "You already have a creator profile. You can manage it from your dashboard." }, { status: 409 });
      const [row] = await db
        .update(creators)
        .set(values)
        .where(eq(creators.id, existing[0].id))
        .returning({ id: creators.id, name: creators.name });
      return Response.json({ creator: row });
    }

    const [row] = await db
      .insert(creators)
      .values(values)
      .returning({ id: creators.id, name: creators.name });
    return Response.json({ creator: row });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not save creator" }, { status: 500 });
  }
}
