import { isCompletedCreatorProfile } from "@/backend/application-contact";
import type { Creator } from "@/backend/db/schema";
import {
  normalizeCategory,
  normalizeContentTypeList,
  normalizeLanguageList,
  normalizePlatform,
} from "@/shared/constants";

export type CreatorProfileSnapshot = {
  version: 1;
  creatorId: string;
  name: string;
  platform: string;
  category: string | null;
  languages: string;
  location: string | null;
  contentTypes: string;
  bio: string | null;
  followers: number;
  verifiedFollowers: number | null;
  effectiveFollowers: number;
  status: string;
  verificationStatus: string;
  profileUrl: string | null;
  instagram: string | null;
  youtube: string | null;
  listedAt: string | null;
  capturedAt: string;
};

type SnapshotCreator = Pick<
  Creator,
  | "id"
  | "name"
  | "platform"
  | "category"
  | "languages"
  | "location"
  | "contentTypes"
  | "bio"
  | "followers"
  | "verifiedFollowers"
  | "status"
  | "verificationStatus"
  | "profileUrl"
  | "instagram"
  | "youtube"
  | "listedAt"
>;

function canonicalSnapshotPlatform(value: string): string {
  return normalizePlatform(value) ?? value;
}

function canonicalSnapshotCategory(value: string | null): string | null {
  return value ? normalizeCategory(value) ?? value : null;
}

function canonicalSnapshotList(
  value: string,
  normalizeList: (input: unknown, keepUnknown?: boolean) => string[] | null,
): string {
  const normalized = normalizeList(value, true);
  return normalized?.length ? normalized.join(", ") : value;
}

/**
 * Capture only the profile facts a brand/admin needs to understand the
 * application as submitted. The live profile remains available through the
 * application's creatorId; private profile contacts and moderation fields
 * are intentionally absent.
 */
export function buildCreatorProfileSnapshot(profile: SnapshotCreator, capturedAt = new Date()): CreatorProfileSnapshot {
  return {
    version: 1,
    creatorId: profile.id,
    name: profile.name,
    // Snapshots are stored data too: repair known legacy display values
    // (for example `cr.both`) instead of copying them into a new application.
    platform: canonicalSnapshotPlatform(profile.platform),
    category: canonicalSnapshotCategory(profile.category),
    languages: canonicalSnapshotList(profile.languages, normalizeLanguageList),
    location: profile.location,
    contentTypes: canonicalSnapshotList(profile.contentTypes, normalizeContentTypeList),
    bio: profile.bio,
    followers: profile.followers,
    verifiedFollowers: profile.verifiedFollowers,
    effectiveFollowers: profile.verifiedFollowers ?? profile.followers,
    status: profile.status,
    verificationStatus: profile.verificationStatus,
    profileUrl: profile.profileUrl,
    instagram: profile.instagram,
    youtube: profile.youtube,
    listedAt: profile.listedAt?.toISOString() ?? null,
    capturedAt: capturedAt.toISOString(),
  };
}

function optionalString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

function boundedFollowers(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
}

/** Validate a JSONB snapshot before exposing it through an API. */
export function parseCreatorProfileSnapshot(value: unknown): CreatorProfileSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = optionalString(row.name, 160);
  const platform = optionalString(row.platform, 40);
  const languages = optionalString(row.languages, 200);
  const contentTypes = optionalString(row.contentTypes, 200);
  const status = optionalString(row.status, 40);
  const verificationStatus = optionalString(row.verificationStatus, 40);
  const capturedAt = optionalString(row.capturedAt, 80);
  const followers = boundedFollowers(row.followers);
  if (
    row.version !== 1 ||
    typeof row.creatorId !== "string" ||
    !name ||
    !platform ||
    !languages ||
    !contentTypes ||
    followers === null ||
    !status ||
    !verificationStatus ||
    !capturedAt ||
    Number.isNaN(Date.parse(capturedAt))
  ) {
    return null;
  }
  const verifiedFollowers = row.verifiedFollowers === null ? null : boundedFollowers(row.verifiedFollowers);
  if (row.verifiedFollowers !== null && verifiedFollowers === null) return null;

  return {
    version: 1,
    creatorId: row.creatorId.slice(0, 80),
    name,
    platform: canonicalSnapshotPlatform(platform),
    category: canonicalSnapshotCategory(optionalString(row.category, 80)),
    languages: canonicalSnapshotList(languages, normalizeLanguageList),
    location: optionalString(row.location, 160),
    contentTypes: canonicalSnapshotList(contentTypes, normalizeContentTypeList),
    bio: optionalString(row.bio, 5_000),
    followers,
    verifiedFollowers,
    effectiveFollowers: boundedFollowers(row.effectiveFollowers) ?? verifiedFollowers ?? followers,
    status,
    verificationStatus,
    profileUrl: optionalString(row.profileUrl, 1_000),
    instagram: optionalString(row.instagram, 1_000),
    youtube: optionalString(row.youtube, 1_000),
    listedAt: optionalString(row.listedAt, 80),
    capturedAt,
  };
}

export function snapshotWasPublic(snapshot: CreatorProfileSnapshot | null): boolean {
  return Boolean(
    snapshot &&
      snapshot.status === "approved" &&
      snapshot.verificationStatus === "verified" &&
      isCompletedCreatorProfile({
        name: snapshot.name,
        status: snapshot.status,
        platform: snapshot.platform,
        category: snapshot.category,
        languages: snapshot.languages,
        contentTypes: snapshot.contentTypes,
        followers: snapshot.followers,
        verifiedFollowers: snapshot.verifiedFollowers,
        instagram: snapshot.instagram,
        youtube: snapshot.youtube,
        profileUrl: snapshot.profileUrl,
      }),
  );
}
