import { logRouteError } from "@/backend/observability";
import { db } from "@/backend/db";
import { creators, type Creator } from "@/backend/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getSessionUser, isSessionUnavailableError, logSessionUnavailable, sessionUnavailableResponse, type SessionUser } from "@/backend/auth";
import { createVerificationCode } from "@/backend/moderation";
import { listPublicCreators } from "@/backend/public-listings";
import { getClientKey, limitedResponse, rateLimit } from "@/backend/rate-limit";
import {
  MAX_INSTAGRAM_URL_LENGTH,
  MAX_PROFILE_URL_LENGTH,
  MAX_YOUTUBE_URL_LENGTH,
  normalizeInstagramUrl,
  normalizeProfileUrl,
  normalizeYouTubeUrl,
} from "@/backend/social-url";
import { findDisallowedContent, hasSuspiciousUrl } from "@/backend/content-moderation";
import {
  hasField,
  parseCanonicalList,
  parseEmailField,
  parseExpectedUpdatedAt,
  parseFollowersField,
  parseOptionalText,
  parsePhoneField,
  parseRequiredText,
  readJsonObject,
  type ValidationResult,
} from "@/backend/validation";
import {
  MAX_CREATOR_CONTENT_TYPES,
  MAX_CREATOR_CONTENT_TYPES_JOINED_LENGTH,
  MAX_CREATOR_LANGUAGES,
  MAX_CREATOR_LANGUAGES_JOINED_LENGTH,
  normalizeCategory,
  normalizeContentType,
  normalizeContentTypeList,
  normalizeLanguage,
  normalizeLanguageList,
  normalizePlatform,
} from "@/shared/constants";
import { isListingQueryError } from "@/backend/pagination";
import { changedFieldNames, recordAuditEvent } from "@/backend/audit-events";
import { contactSourceFor } from "@/backend/identity-sync";

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
  emailSource: string;
  phone: string | null;
  phoneSource: string;
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

type ParseResult =
  | { ok: true; values: CreatorProfileValues }
  | { ok: false; error: string; code: string; field?: string };

function validationErrorResponse(result: { error: string; code: string; field?: string }, status = 400) {
  return Response.json(
    { error: result.error, code: result.code, ...(result.field ? { field: result.field } : {}) },
    { status, headers: NO_STORE },
  );
}

function parseCreatorProfile(body: Record<string, unknown>, user: SessionUser, current?: Creator): ParseResult {
  const supplied = (field: string) => hasField(body, field);
  // Placeholder rows created during signup carry database placeholder values
  // for platform/languages/content types/followers. Completing one must use
  // values the creator actually supplies, never those placeholders.
  const completedCurrent = current && current.status !== "incomplete" ? current : undefined;

  const name = current && !supplied("name")
    ? { ok: true, value: current.name } as ValidationResult<string>
    : parseRequiredText(body.name, {
        field: "name",
        maxLength: 100,
        requiredCode: "name_required",
        requiredMessage: "Name is required",
      });
  if (!name.ok) return name;
  if (supplied("name") || !current) {
    if (!/[\p{L}\p{N}]/u.test(name.value) || findDisallowedContent(name.value)) {
      return { ok: false, error: "Please enter a name without links, contact details, or prohibited content.", code: "content_not_allowed", field: "name" };
    }
  }

  let email: string | null;
  if (supplied("email")) {
    const parsedEmail = parseEmailField(body.email, { field: "email" });
    if (!parsedEmail.ok) return parsedEmail;
    email = parsedEmail.value ?? (current ? null : user.email);
  } else {
    email = current?.email ?? user.email;
  }

  let phone: string | null;
  if (supplied("phone")) {
    const parsedPhone = parsePhoneField(body.phone, { field: "phone" });
    if (!parsedPhone.ok) return parsedPhone;
    phone = parsedPhone.value;
  } else {
    phone = current?.phone ?? null;
  }

  let platform: string;
  if (completedCurrent && !supplied("platform")) {
    // A completed legacy row can still carry a display label/key such as
    // `cr.both`. Heal known aliases on the next write instead of copying the
    // raw stored value forward again.
    platform = normalizePlatform(completedCurrent.platform) ?? completedCurrent.platform;
  } else {
    const normalized = normalizePlatform(body.platform);
    if (!normalized) return { ok: false, error: "Please choose a valid platform.", code: "invalid_platform", field: "platform" };
    platform = normalized;
  }

  let category: string | null;
  if (completedCurrent && !supplied("category")) {
    category = completedCurrent.category
      ? normalizeCategory(completedCurrent.category) ?? completedCurrent.category
      : null;
  } else {
    const normalized = normalizeCategory(body.category);
    if (!normalized) return { ok: false, error: "Please choose a valid category.", code: "invalid_category", field: "category" };
    category = normalized;
  }

  let languages: string;
  if (completedCurrent && !supplied("languages")) {
    const normalizedLanguages = normalizeLanguageList(completedCurrent.languages, true);
    languages = normalizedLanguages?.length ? normalizedLanguages.join(", ") : completedCurrent.languages;
  } else {
    const parsedLanguages = parseCanonicalList(body.languages, normalizeLanguage, {
      field: "languages",
      code: "invalid_languages",
      error: "Please select at least one valid language.",
      maxItems: MAX_CREATOR_LANGUAGES,
      maxJoinedLength: MAX_CREATOR_LANGUAGES_JOINED_LENGTH,
    });
    if (!parsedLanguages.ok) return parsedLanguages;
    languages = parsedLanguages.value.join(", ");
  }

  let contentTypes: string;
  if (completedCurrent && !supplied("contentTypes")) {
    const normalizedContentTypes = normalizeContentTypeList(completedCurrent.contentTypes, true);
    contentTypes = normalizedContentTypes?.length ? normalizedContentTypes.join(", ") : completedCurrent.contentTypes;
  } else {
    const parsedContentTypes = parseCanonicalList(body.contentTypes, normalizeContentType, {
      field: "contentTypes",
      code: "invalid_content_types",
      error: "Please select at least one valid content type.",
      maxItems: MAX_CREATOR_CONTENT_TYPES,
      maxJoinedLength: MAX_CREATOR_CONTENT_TYPES_JOINED_LENGTH,
    });
    if (!parsedContentTypes.ok) return parsedContentTypes;
    contentTypes = parsedContentTypes.value.join(", ");
  }

  const parseSocial = (
    field: "instagram" | "youtube" | "profileUrl",
    normalize: (value: string) => string | null,
    maxLength: number,
    code: string,
    error: string,
  ): ValidationResult<string | null> => {
    const raw = supplied(field) ? body[field] : current?.[field];
    if (raw == null || (typeof raw === "string" && !raw.trim())) return { ok: true, value: null };
    if (typeof raw !== "string") {
      return supplied(field) ? { ok: false, error, code, field } : { ok: true, value: null };
    }
    const normalized = normalize(raw);
    if (!normalized) {
      return supplied(field) || !current ? { ok: false, error, code, field } : { ok: true, value: null };
    }
    if (normalized.length > maxLength) return { ok: false, error, code, field };
    return { ok: true, value: normalized };
  };

  const instagram = parseSocial(
    "instagram",
    (value) => normalizeInstagramUrl(value),
    MAX_INSTAGRAM_URL_LENGTH,
    "invalid_instagram",
    "Please enter a valid Instagram handle or profile URL.",
  );
  if (!instagram.ok) return instagram;
  const youtube = parseSocial(
    "youtube",
    (value) => normalizeYouTubeUrl(value),
    MAX_YOUTUBE_URL_LENGTH,
    "invalid_youtube",
    "Please enter a valid YouTube channel handle or URL.",
  );
  if (!youtube.ok) return youtube;
  const parsedProfileUrl = parseSocial(
    "profileUrl",
    (value) => normalizeProfileUrl(value, platform),
    MAX_PROFILE_URL_LENGTH,
    "invalid_profile_url",
    "Please enter a valid profile URL.",
  );
  if (!parsedProfileUrl.ok) return parsedProfileUrl;

  // If the creator gave a social handle but left the profile-link field
  // blank, use the cleaned social URL as the main profile link.
  const profileUrl = parsedProfileUrl.value ?? instagram.value ?? youtube.value;
  if (!profileUrl) {
    return {
      ok: false,
      error: "Please add your Instagram, YouTube, or other profile link so account ownership can be verified.",
      code: "profile_link_required",
      field: "profileUrl",
    };
  }
  const resolvedInstagram = instagram.value ?? normalizeInstagramUrl(profileUrl);
  const resolvedYouTube = youtube.value ?? normalizeYouTubeUrl(profileUrl);
  if (
    (resolvedInstagram && resolvedInstagram.length > MAX_INSTAGRAM_URL_LENGTH) ||
    (resolvedYouTube && resolvedYouTube.length > MAX_YOUTUBE_URL_LENGTH)
  ) {
    return { ok: false, error: "Please enter a valid profile URL.", code: "invalid_profile_url", field: "profileUrl" };
  }
  if (
    (!current || supplied("instagram") || supplied("youtube") || supplied("profileUrl")) &&
    (hasSuspiciousUrl(profileUrl) || hasSuspiciousUrl(resolvedInstagram) || hasSuspiciousUrl(resolvedYouTube))
  ) {
    return { ok: false, error: "Please use a direct profile link without a URL shortener.", code: "content_not_allowed", field: "profileUrl" };
  }

  let followers: number;
  if (completedCurrent && !supplied("followers")) {
    followers = completedCurrent.followers;
  } else {
    const parsedFollowers = parseFollowersField(body.followers);
    if (!parsedFollowers.ok) return parsedFollowers;
    followers = parsedFollowers.value;
  }

  const location = current && !supplied("location")
    ? { ok: true, value: current.location } as ValidationResult<string | null>
    : parseOptionalText(body.location, { field: "location", maxLength: 100 });
  if (!location.ok) return location;
  const bio = current && !supplied("bio")
    ? { ok: true, value: current.bio } as ValidationResult<string | null>
    : parseOptionalText(body.bio, { field: "bio", maxLength: 500, multiline: true });
  if (!bio.ok) return bio;

  return {
    ok: true,
    values: {
      name: name.value,
      email,
      emailSource: contactSourceFor(email, user.email, "profile"),
      phone,
      phoneSource: contactSourceFor(phone, user.phone, "profile"),
      instagram: resolvedInstagram,
      youtube: resolvedYouTube,
      profileUrl,
      platform,
      followers,
      category,
      languages,
      location: location.value,
      contentTypes,
      bio: bio.value,
    },
  };
}

function sameCreatorProfile(values: CreatorProfileValues, existing: Creator): boolean {
  return (Object.keys(values) as Array<keyof CreatorProfileValues>).every((field) => values[field] === existing[field]);
}

function returningFromCreator(creator: Creator) {
  return {
    id: creator.id,
    name: creator.name,
    status: creator.status,
    verificationCode: creator.verificationCode,
    verificationStatus: creator.verificationStatus,
    updatedAt: creator.updatedAt,
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

export async function GET(req: Request) {
  try {
    const result = await listPublicCreators(new URL(req.url).searchParams);
    return Response.json(result, { headers: NO_STORE });
  } catch (e) {
    if (isListingQueryError(e)) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    }
    logRouteError(req, e);
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
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in before creating your creator profile.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
    // The profile is keyed to this user. Their preferred starting workspace
    // does not restrict whether the same account can also be a creator.

    const parsed = parseCreatorProfile(body, user);
    if (!parsed.ok) return validationErrorResponse(parsed);

    type CreatorPostOutcome =
      | { kind: "created"; creator: ReturnType<typeof returningFromCreator> }
      | { kind: "replay"; creator: ReturnType<typeof returningFromCreator> }
      | { kind: "exists" };

    const outcome: CreatorPostOutcome = await db.transaction(async (tx) => {
      const now = new Date();
      const completedValues = {
        userId: user.id,
        ...parsed.values,
        status: "pending",
        verificationStatus: "pending",
        verifiedFollowers: null,
        moderationNote: null,
        reviewedAt: null,
        // Completing a signup placeholder is the profile's effective
        // listing moment, even though the placeholder row may be much older.
        listedAt: now,
        updatedAt: now,
      };

      const [existing] = await tx.select().from(creators).where(eq(creators.userId, user.id)).limit(1).for("update");
      if (existing) {
        if (existing.status === "incomplete") {
          const [row] = await tx
            .update(creators)
            .set({ ...completedValues, verificationCode: createVerificationCode() })
            .where(eq(creators.id, existing.id))
            .returning(returningProfile);
          if (row) {
            await recordAuditEvent(tx, {
              actorType: "user",
              actorUserId: user.id,
              ownerUserId: user.id,
              entityType: "creator_profile",
              entityId: row.id,
              action: "creator_profile.completed",
              fromStatus: existing.status,
              toStatus: row.status,
              changedFields: changedFieldNames(existing, completedValues),
              createdAt: now,
            });
            return { kind: "created", creator: row } as const;
          }
        }
        return sameCreatorProfile(parsed.values, existing)
          ? { kind: "replay", creator: returningFromCreator(existing) } as const
          : { kind: "exists" } as const;
      }

      const [created] = await tx
        .insert(creators)
        .values({ ...completedValues, verificationCode: createVerificationCode() })
        .onConflictDoNothing({ target: creators.userId })
        .returning(returningProfile);
      if (created) {
        await recordAuditEvent(tx, {
          actorType: "user",
          actorUserId: user.id,
          ownerUserId: user.id,
          entityType: "creator_profile",
          entityId: created.id,
          action: "creator_profile.created",
          toStatus: created.status,
          changedFields: Object.keys(parsed.values),
          createdAt: now,
        });
        return { kind: "created", creator: created } as const;
      }

      // A parallel request won the insert. Its row is now the arbiter: an
      // exact retry replays that profile; only a different profile conflicts.
      const [raced] = await tx.select().from(creators).where(eq(creators.userId, user.id)).limit(1).for("update");
      if (raced?.status === "incomplete") {
        const [row] = await tx
          .update(creators)
          .set({ ...completedValues, verificationCode: createVerificationCode(), updatedAt: new Date() })
          .where(eq(creators.id, raced.id))
          .returning(returningProfile);
        if (row) {
          await recordAuditEvent(tx, {
            actorType: "user",
            actorUserId: user.id,
            ownerUserId: user.id,
            entityType: "creator_profile",
            entityId: row.id,
            action: "creator_profile.completed",
            fromStatus: raced.status,
            toStatus: row.status,
            changedFields: changedFieldNames(raced, completedValues),
            createdAt: now,
          });
          return { kind: "created", creator: row } as const;
        }
      }
      return raced && sameCreatorProfile(parsed.values, raced)
        ? { kind: "replay", creator: returningFromCreator(raced) } as const
        : { kind: "exists" } as const;
    });

    if (outcome.kind === "exists") {
      return Response.json(
        { error: "You already have a creator profile. You can manage it from your dashboard.", code: "creator_profile_exists" },
        { status: 409, headers: NO_STORE },
      );
    }
    return Response.json(
      { creator: outcome.creator, ...(outcome.kind === "replay" ? { idempotentReplay: true } : {}) },
      { status: outcome.kind === "created" ? 201 : 200, headers: NO_STORE },
    );
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e, "lookup", req);
      return sessionUnavailableResponse(NO_STORE);
    }
    logRouteError(req, e);
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
    const parsedBody = await readJsonObject(req, { headers: NO_STORE });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    if (!CREATOR_FIELDS.some((field) => hasField(body, field))) {
      return Response.json({ error: "No creator profile changes were provided.", code: "no_changes" }, { status: 400, headers: NO_STORE });
    }

    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in to edit your creator profile.", code: "unauthorized" }, { status: 401, headers: NO_STORE });

    const expectedUpdatedAt = parseExpectedUpdatedAt(body);
    if (!expectedUpdatedAt.ok) return validationErrorResponse(expectedUpdatedAt);

    type PatchOutcome =
      | { kind: "updated"; creator: ReturnType<typeof returningFromCreator>; reviewRequired: boolean }
      | { kind: "unchanged"; creator: Creator }
      | { kind: "not_found" }
      | { kind: "changed" }
      | { kind: "invalid"; result: Extract<ParseResult, { ok: false }> };

    const outcome: PatchOutcome = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(creators).where(eq(creators.userId, user.id)).limit(1).for("update");
      if (!existing) return { kind: "not_found" } as const;
      if (expectedUpdatedAt.value && existing.updatedAt.getTime() !== expectedUpdatedAt.value.getTime()) {
        return { kind: "changed" } as const;
      }

      const parsed = parseCreatorProfile(body, user, existing);
      if (!parsed.ok) return { kind: "invalid", result: parsed } as const;

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
      const materialChanged = materialFields.some(
        (field) => hasField(body, field) && parsed.values[field] !== existing[field],
      );
      const contactChanged =
        parsed.values.email !== existing.email ||
        parsed.values.emailSource !== existing.emailSource ||
        parsed.values.phone !== existing.phone ||
        parsed.values.phoneSource !== existing.phoneSource;
      if (!materialChanged && !contactChanged) return { kind: "unchanged", creator: existing } as const;

      const now = new Date();
      const listedAt = existing.status === "incomplete" ? now : existing.listedAt ?? (materialChanged ? now : null);
      const updateValues = materialChanged
        ? {
            ...parsed.values,
            updatedAt: now,
            status: "pending",
            verificationCode: createVerificationCode(),
            verificationStatus: "pending",
            verifiedFollowers: null,
            moderationNote: null,
            reviewedAt: null,
            ...(listedAt ? { listedAt } : {}),
          }
        : {
            // Contact-only edits must not rewrite the already verified
            // public profile representation.
            email: parsed.values.email,
            emailSource: parsed.values.emailSource,
            phone: parsed.values.phone,
            phoneSource: parsed.values.phoneSource,
            updatedAt: now,
          };
      const [row] = await tx
        .update(creators)
        .set(updateValues)
        .where(and(eq(creators.id, existing.id), eq(creators.userId, user.id)))
        .returning(returningProfile);
      if (!row) return { kind: "not_found" } as const;
      await recordAuditEvent(tx, {
        actorType: "user",
        actorUserId: user.id,
        ownerUserId: user.id,
        entityType: "creator_profile",
        entityId: row.id,
        action: existing.status === "incomplete" ? "creator_profile.completed" : "creator_profile.updated",
        fromStatus: existing.status,
        toStatus: row.status,
        changedFields: changedFieldNames(existing, updateValues),
        metadata: { reviewRequired: materialChanged },
        createdAt: now,
      });
      return { kind: "updated", creator: row, reviewRequired: materialChanged } as const;
    });

    if (outcome.kind === "invalid") return validationErrorResponse(outcome.result);
    if (outcome.kind === "not_found") {
      return Response.json({ error: "Creator profile not found.", code: "creator_profile_not_found" }, { status: 404, headers: NO_STORE });
    }
    if (outcome.kind === "changed") {
      return Response.json(
        { error: "This creator profile changed while you were editing it. Please refresh and try again.", code: "creator_profile_changed" },
        { status: 409, headers: NO_STORE },
      );
    }
    if (outcome.kind === "unchanged") {
      return Response.json({ creator: returningFromCreator(outcome.creator), unchanged: true }, { headers: NO_STORE });
    }
    return Response.json({ creator: outcome.creator, reviewRequired: outcome.reviewRequired }, { headers: NO_STORE });

  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e, "lookup", req);
      return sessionUnavailableResponse(NO_STORE);
    }
    logRouteError(req, e);
    return Response.json({ error: "Could not update creator profile", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  const rl = await rateLimit(getClientKey(req, "creator-manage"), 30, 60 * 60_000);
  if (!rl.ok) return limitedResponse(rl.retryAfter);
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Please log in to delete your creator profile.", code: "unauthorized" }, { status: 401, headers: NO_STORE });

    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: creators.id, status: creators.status })
        .from(creators)
        .where(eq(creators.userId, user.id))
        .limit(1)
        .for("update");
      if (!existing) return null;
      const [deleted] = await tx.delete(creators).where(eq(creators.id, existing.id)).returning({ id: creators.id });
      if (!deleted) return null;
      await recordAuditEvent(tx, {
        actorType: "user",
        actorUserId: user.id,
        ownerUserId: user.id,
        entityType: "creator_profile",
        entityId: deleted.id,
        action: "creator_profile.deleted",
        fromStatus: existing.status,
        toStatus: "deleted",
      });
      return deleted;
    });
    if (!row) return Response.json({ error: "Creator profile not found.", code: "creator_profile_not_found" }, { status: 404, headers: NO_STORE });
    return Response.json({ ok: true, deleted: true }, { headers: NO_STORE });
  } catch (e) {
    if (isSessionUnavailableError(e)) {
      logSessionUnavailable(e, "lookup", req);
      return sessionUnavailableResponse(NO_STORE);
    }
    logRouteError(req, e);
    return Response.json({ error: "Could not delete creator profile", code: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
