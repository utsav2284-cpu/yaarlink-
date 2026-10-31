import { db } from "@/backend/db";
import { creators } from "@/backend/db/schema";
import { desc, eq, isNull, ne, or } from "drizzle-orm";
import { getSessionUser } from "@/backend/auth";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/backend/social-url";
import { normalizeCategory, normalizeContentTypeList, normalizeLanguageList, normalizePlatform } from "@/shared/constants";

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
    const canonicalRows = rows.map((row) => ({
      ...row,
      platform: normalizePlatform(row.platform) ?? "Instagram",
      category: normalizeCategory(row.category) ?? row.category,
      languages: row.languages ? (normalizeLanguageList(row.languages, true) ?? []).join(", ") : row.languages,
      contentTypes: row.contentTypes ? (normalizeContentTypeList(row.contentTypes, true) ?? []).join(", ") : row.contentTypes,
    }));
    return Response.json({ creators: canonicalRows });
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

    const hasPlatform = !(b.platform == null || (typeof b.platform === "string" && !b.platform.trim()));
    const platform = hasPlatform ? normalizePlatform(b.platform) : "Instagram";
    if (!platform) return Response.json({ error: "Please choose a valid platform." }, { status: 400 });

    const hasCategory = !(b.category == null || (typeof b.category === "string" && !b.category.trim()));
    const category = hasCategory ? normalizeCategory(b.category) : null;
    if (hasCategory && !category) return Response.json({ error: "Please choose a valid category." }, { status: 400 });

    const languages = b.languages == null || b.languages === "" ? ["English"] : normalizeLanguageList(b.languages);
    if (!languages || languages.length === 0) return Response.json({ error: "Please select at least one valid language." }, { status: 400 });

    const contentTypes = b.contentTypes == null || b.contentTypes === "" ? ["Story"] : normalizeContentTypeList(b.contentTypes);
    if (!contentTypes) return Response.json({ error: "Please select valid content types." }, { status: 400 });

    const instagram = b.instagram ? normalizeInstagramUrl(b.instagram) : null;
    if (b.instagram && !instagram) return Response.json({ error: "Please enter a valid Instagram handle or profile URL." }, { status: 400 });
    const youtube = b.youtube ? normalizeYouTubeUrl(b.youtube) : null;
    if (b.youtube && !youtube) return Response.json({ error: "Please enter a valid YouTube channel handle or URL." }, { status: 400 });
    let profileUrl = b.profileUrl ? normalizeProfileUrl(b.profileUrl, platform) : null;
    if (b.profileUrl && !profileUrl) return Response.json({ error: "Please enter a valid profile URL." }, { status: 400 });

    // If the creator gave a social handle but left the profile-link field
    // blank, use the cleaned social URL as the main profile link.
    profileUrl ??= instagram ?? youtube;
    const resolvedInstagram = instagram ?? (profileUrl ? normalizeInstagramUrl(profileUrl) : null);
    const resolvedYouTube = youtube ?? (profileUrl ? normalizeYouTubeUrl(profileUrl) : null);
    const followers = typeof b.followers === "string" ? parseInt(b.followers.replace(/[^0-9]/g, "") || "0", 10) : Number(b.followers || 0);
    if (!Number.isInteger(followers) || followers < 0 || followers > 100_000_000) return Response.json({ error: "Please enter a valid follower count." }, { status: 400 });
    const values = {
      userId: user.id,
      name: String(b.name).slice(0, 100),
      email: email ? email.slice(0, 120) : null,
      phone: b.phone ? String(b.phone).slice(0, 20) : null,
      instagram: resolvedInstagram?.slice(0, 160) ?? null,
      youtube: resolvedYouTube?.slice(0, 160) ?? null,
      profileUrl: profileUrl?.slice(0, 200) ?? null,
      platform,
      followers: isNaN(followers) ? 0 : followers,
      category,
      languages: languages.join(", "),
      location: b.location ? String(b.location).slice(0, 100) : null,
      contentTypes: contentTypes.join(", "),
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
