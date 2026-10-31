import { db } from "@/backend/db";
import { creators, type Creator } from "@/backend/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSessionUser, type SessionUser } from "@/backend/auth";
import { createVerificationCode } from "@/backend/moderation";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/backend/social-url";
import { normalizeCategory, normalizeContentTypeList, normalizeLanguageList, normalizePlatform } from "@/shared/constants";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const CREATOR_FIELDS = [
  "name",
  "email",
  "phone",
  "instagram",
  "youtube",
  "profileUrl",
  "platform",
  "followers",
  "category",
  "languages",
  "location",
  "contentTypes",
  "bio",
] as const;

type CreatorProfileValues = {
  name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  youtube: string | null;
  profileUrl: string | null;
  platform: string;
  followers: number;
  category: string | null;
  languages: string;
  location: string | null;
  contentTypes: string;
  bio: string | null;
};

type ParseResult = { ok: true; values: CreatorProfileValues } | { ok: false; error: string; code: string };

function bodyRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasField(body: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function parseCreatorProfile(body: Record<string, unknown>, user: SessionUser, current?: Creator): ParseResult {
  const rawName = hasField(body, "name") ? body.name : current?.name;
  const name = optionalText(rawName, 100);
  if (!name) return { ok: false, error: "Name is required", code: "name_required" };

  const rawEmail = hasField(body, "email") ? body.email : current?.email;
  const emailInput = rawEmail == null ? "" : String(rawEmail).toLowerCase().trim();
  const email = emailInput || (current && hasField(body, "email") ? null : user.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email.", code: "invalid_email" };

  const rawPlatform = hasField(body, "platform") ? body.platform : current?.platform;
  const hasPlatform = !(rawPlatform == null || (typeof rawPlatform === "string" && !rawPlatform.trim()));
  const platform = hasPlatform ? normalizePlatform(rawPlatform) : "Instagram";
  if (!platform) return { ok: false, error: "Please choose a valid platform.", code: "invalid_platform" };

  const rawCategory = hasField(body, "category") ? body.category : current?.category;
  const hasCategory = !(rawCategory == null || (typeof rawCategory === "string" && !rawCategory.trim()));
  const category = hasCategory ? normalizeCategory(rawCategory) : null;
  if (hasCategory && !category) return { ok: false, error: "Please choose a valid category.", code: "invalid_category" };

  const rawLanguages = hasField(body, "languages") ? body.languages : current?.languages;
  const languages = rawLanguages == null || rawLanguages === "" ? ["English"] : normalizeLanguageList(rawLanguages);
  if (!languages || languages.length === 0) return { ok: false, error: "Please select at least one valid language.", code: "invalid_languages" };

  const rawContentTypes = hasField(body, "contentTypes") ? body.contentTypes : current?.contentTypes;
  const contentTypes = rawContentTypes == null || rawContentTypes === "" ? ["Story"] : normalizeContentTypeList(rawContentTypes);
  if (!contentTypes || contentTypes.length === 0) return { ok: false, error: "Please select valid content types.", code: "invalid_content_types" };

  const rawInstagram = hasField(body, "instagram") ? body.instagram : current?.instagram;
  const instagram = rawInstagram ? normalizeInstagramUrl(rawInstagram) : null;
  if (rawInstagram && !instagram) return { ok: false, error: "Please enter a valid Instagram handle or profile URL.", code: "invalid_instagram" };

  const rawYoutube = hasField(body, "youtube") ? body.youtube : current?.youtube;
  const youtube = rawYoutube ? normalizeYouTubeUrl(rawYoutube) : null;
  if (rawYoutube && !youtube) return { ok: false, error: "Please enter a valid YouTube channel handle or URL.", code: "invalid_youtube" };

  const rawProfileUrl = hasField(body, "profileUrl") ? body.profileUrl : current?.profileUrl;
  let profileUrl = rawProfileUrl ? normalizeProfileUrl(rawProfileUrl, platform) : null;
  if (rawProfileUrl && !profileUrl) return { ok: false, error: "Please enter a valid profile URL.", code: "invalid_profile_url" };

  // If the creator gave a social handle but left the profile-link field
  // blank, use the cleaned social URL as the main profile link.
  profileUrl ??= instagram ?? youtube;
  if (!profileUrl) {
    return { ok: false, error: "Please add your Instagram, YouTube, or other profile link so account ownership can be verified.", code: "profile_link_required" };
  }
  const resolvedInstagram = instagram ?? normalizeInstagramUrl(profileUrl);
  const resolvedYouTube = youtube ?? normalizeYouTubeUrl(profileUrl);

  const rawFollowers = hasField(body, "followers") ? body.followers : current?.followers;
  const followers =
    typeof rawFollowers === "string" ? parseInt(rawFollowers.replace(/[^0-9]/g, "") || "0", 10) : Number(rawFollowers || 0);
  if (!Number.isInteger(followers) || followers < 0 || followers > 100_000_000) {
    return { ok: false, error: "Please enter a valid follower count.", code: "invalid_followers" };
  }

  return {
    ok: true,
    values: {
      name,
      email: email ? email.slice(0, 120) : null,
      phone: optionalText(hasField(body, "phone") ? body.phone : current?.phone, 20),
      instagram: resolvedInstagram?.slice(0, 160) ?? null,
      youtube: resolvedYouTube?.slice(0, 160) ?? null,
      profileUrl: profileUrl.slice(0, 200),
      platform,
      followers,
      category,
      languages: languages.join(", "),
      location: optionalText(hasField(body, "location") ? body.location : current?.location, 100),
      contentTypes: contentTypes.join(", "),
      bio: optionalText(hasField(body, "bio") ? body.bio : current?.bio, 500),
    },
  };
}

const returningProfile = {
  id: creators.id,
  name: creators.name,
  status: creators.status,
  verificationCode: creators.verificationCode,
  verificationStatus: creators.verificationStatus,
  updatedAt: creators.updatedAt,
};

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
        verifiedFollowers: creators.verifiedFollowers,
        category: creators.category,
        languages: creators.languages,
        location: creators.location,
        contentTypes: creators.contentTypes,
        bio: creators.bio,
        status: creators.status,
        verificationStatus: creators.verificationStatus,
        createdAt: creators.createdAt,
      })
      .from(creators)
      // Fail closed: a profile is public only after an admin has approved it
      // and verified ownership of the linked social account.
      .where(and(eq(creators.status, "approved"), eq(creators.verificationStatus, "verified")))
      .orderBy(desc(creators.createdAt))
      .limit(50);
    const canonicalRows = rows.map((row) => ({
      ...row,
      // Public cards show the count checked during review, not the raw claim.
      followers: row.verifiedFollowers ?? row.followers,
      platform: normalizePlatform(row.platform) ?? "Instagram",
      category: normalizeCategory(row.category) ?? row.category,
      languages: row.languages ? (normalizeLanguageList(row.languages, true) ?? []).join(", ") : row.languages,
      contentTypes: row.contentTypes ? (normalizeContentTypeList(row.contentTypes, true) ?? []).join(", ") : row.contentTypes,
    }));
    return Response.json({ creators: canonicalRows }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Could not load creators", code: "load_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: Request) {
  const rl = await rateLimit(getClientKey(req, "creator-create"), 5, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const body = bodyRecord(await req.json().catch(() => null));
    if (!body) return Response.json({ error: "Invalid creator profile", code: "invalid_request" }, { status: 400, headers: NO_STORE });
    const user = await getSessionUser().catch(() => null);
    if (!user) return Response.json({ error: "Please log in as a creator before creating your profile.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    if (user.role !== "creator") return Response.json({ error: "Only creator accounts can create creator profiles.", code: "forbidden" }, { status: 403, headers: NO_STORE });

    const parsed = parseCreatorProfile(body, user);
    if (!parsed.ok) return Response.json({ error: parsed.error, code: parsed.code }, { status: 400, headers: NO_STORE });

    const now = new Date();
    const values = {
      userId: user.id,
      ...parsed.values,
      status: "pending",
      verificationCode: createVerificationCode(),
      verificationStatus: "pending",
      verifiedFollowers: null,
      moderationNote: null,
      reviewedAt: null,
      updatedAt: now,
    };

    const [existing] = await db.select({ id: creators.id, status: creators.status }).from(creators).where(eq(creators.userId, user.id)).limit(1);
    if (existing) {
      // Signup creates a starter `incomplete` row; completing the profile
      // updates that same row instead of creating a second profile.
      if (existing.status !== "incomplete") {
        return Response.json({ error: "You already have a creator profile. You can manage it from your dashboard.", code: "creator_profile_exists" }, { status: 409, headers: NO_STORE });
      }
      const [row] = await db.update(creators).set(values).where(eq(creators.id, existing.id)).returning(returningProfile);
      return Response.json({ creator: row }, { headers: NO_STORE });
    }

    const [row] = await db.insert(creators).values(values).returning(returningProfile);
    return Response.json({ creator: row }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not save creator", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

/**
 * Owner profile edit. Contact-only changes stay live; a material public
 * profile change returns the listing to the same verification queue used for
 * a new creator, so an approved profile cannot silently become another page.
 */
export async function PATCH(req: Request) {
  const rl = await rateLimit(getClientKey(req, "creator-manage"), 30, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const body = bodyRecord(await req.json().catch(() => null));
    if (!body || !CREATOR_FIELDS.some((field) => hasField(body, field))) {
      return Response.json({ error: "No creator profile changes were provided.", code: "no_changes" }, { status: 400, headers: NO_STORE });
    }

    const user = await getSessionUser().catch(() => null);
    if (!user) return Response.json({ error: "Please log in as a creator to edit your profile.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    if (user.role !== "creator") return Response.json({ error: "Only creator accounts can edit creator profiles.", code: "forbidden" }, { status: 403, headers: NO_STORE });

    const [existing] = await db.select().from(creators).where(eq(creators.userId, user.id)).limit(1);
    if (!existing) return Response.json({ error: "Creator profile not found.", code: "creator_profile_not_found" }, { status: 404, headers: NO_STORE });

    const parsed = parseCreatorProfile(body, user, existing);
    if (!parsed.ok) return Response.json({ error: parsed.error, code: parsed.code }, { status: 400, headers: NO_STORE });

    const materialFields: Array<keyof CreatorProfileValues> = [
      "name",
      "instagram",
      "youtube",
      "profileUrl",
      "platform",
      "followers",
      "category",
      "languages",
      "location",
      "contentTypes",
      "bio",
    ];
    // Only fields the owner actually submitted can force a new review. This
    // prevents a contact-only PATCH from treating harmless canonicalization
    // of an untouched legacy profile URL as a material public change.
    const materialChanged = materialFields.some((field) => hasField(body, field) && parsed.values[field] !== existing[field]);
    const contactChanged = parsed.values.email !== existing.email || parsed.values.phone !== existing.phone;

    if (!materialChanged && !contactChanged) {
      return Response.json(
        {
          creator: {
            id: existing.id,
            name: existing.name,
            status: existing.status,
            verificationCode: existing.verificationCode,
            verificationStatus: existing.verificationStatus,
            updatedAt: existing.updatedAt,
          },
          unchanged: true,
        },
        { headers: NO_STORE },
      );
    }

    const [row] = await db
      .update(creators)
      .set(
        materialChanged
          ? {
              ...parsed.values,
              updatedAt: new Date(),
              status: "pending",
              verificationCode: createVerificationCode(),
              verificationStatus: "pending",
              verifiedFollowers: null,
              moderationNote: null,
              reviewedAt: null,
            }
          : {
              // Contact-only edits must not rewrite the already verified
              // public profile representation.
              email: parsed.values.email,
              phone: parsed.values.phone,
              updatedAt: new Date(),
            },
      )
      .where(and(eq(creators.id, existing.id), eq(creators.userId, user.id)))
      .returning(returningProfile);
    if (!row) return Response.json({ error: "Creator profile not found.", code: "creator_profile_not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ creator: row, reviewRequired: materialChanged }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not update creator profile", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  const rl = await rateLimit(getClientKey(req, "creator-manage"), 30, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const user = await getSessionUser().catch(() => null);
    if (!user) return Response.json({ error: "Please log in as a creator to delete your profile.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    if (user.role !== "creator") return Response.json({ error: "Only creator accounts can delete creator profiles.", code: "forbidden" }, { status: 403, headers: NO_STORE });

    const [row] = await db.delete(creators).where(eq(creators.userId, user.id)).returning({ id: creators.id });
    if (!row) return Response.json({ error: "Creator profile not found.", code: "creator_profile_not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Could not delete creator profile", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
