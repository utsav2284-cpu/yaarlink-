import { cache } from "react";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/backend/db";
import { campaigns, creators } from "@/backend/db/schema";
import { parseUuid } from "@/backend/validation";
import { normalizeInstagramUrl, normalizeProfileUrl, normalizeYouTubeUrl } from "@/backend/social-url";
import {
  normalizeCategory,
  normalizeContentType,
  normalizeContentTypeList,
  normalizeLanguage,
  normalizeLanguageList,
  normalizePlatform,
  normalizePromotionType,
} from "@/shared/constants";

export type PublicCampaignDetail = {
  id: string;
  businessName: string;
  title: string;
  promotionType: string;
  category: string | null;
  description: string | null;
  location: string | null;
  language: string;
  targetAudience: string | null;
  format: string;
  website: string | null;
  status: string;
  verificationStatus: string;
  createdAt: string;
};

export type PublicCreatorDetail = {
  id: string;
  name: string;
  instagram: string | null;
  youtube: string | null;
  profileUrl: string | null;
  platform: string;
  followers: number;
  category: string;
  languages: string;
  location: string | null;
  contentTypes: string;
  bio: string | null;
  status: string;
  verificationStatus: string;
  createdAt: string;
};

function serializeDate(value: Date | string): string {
  return new Date(value).toISOString();
}

/**
 * Load one campaign for its public detail page. The query deliberately
 * selects only public fields and fails closed unless the campaign is both
 * open and verified. Budget and brand contact details are never selected.
 */
export const getPublicCampaignDetail = cache(async (rawId: string): Promise<PublicCampaignDetail | null> => {
  const id = parseUuid(rawId);
  if (!id) return null;

  const [row] = await db
    .select({
      id: campaigns.id,
      businessName: campaigns.businessName,
      title: campaigns.title,
      promotionType: campaigns.promotionType,
      category: campaigns.category,
      description: campaigns.description,
      location: campaigns.location,
      language: campaigns.language,
      targetAudience: campaigns.targetAudience,
      format: campaigns.format,
      website: campaigns.website,
      status: campaigns.status,
      verificationStatus: campaigns.verificationStatus,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, id),
        eq(campaigns.status, "open"),
        eq(campaigns.verificationStatus, "verified"),
      ),
    )
    .limit(1);
  if (!row) return null;

  return {
    ...row,
    website: normalizeProfileUrl(row.website, "Instagram"),
    promotionType: normalizePromotionType(row.promotionType) ?? row.promotionType,
    category: normalizeCategory(row.category) ?? row.category,
    language: normalizeLanguage(row.language) ?? row.language,
    format: normalizeContentType(row.format) ?? row.format,
    createdAt: serializeDate(row.createdAt),
  };
});

/**
 * Load one creator for its public detail page. As with the list endpoint,
 * only an approved, verified and complete profile is public, and private
 * email/phone fields are never selected.
 */
export const getPublicCreatorDetail = cache(async (rawId: string): Promise<PublicCreatorDetail | null> => {
  const id = parseUuid(rawId);
  if (!id) return null;

  const [row] = await db
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
    .where(
      and(
        eq(creators.id, id),
        eq(creators.status, "approved"),
        eq(creators.verificationStatus, "verified"),
        isNotNull(creators.category),
      ),
    )
    .limit(1);
  if (!row) return null;

  const category = normalizeCategory(row.category);
  const languages = normalizeLanguageList(row.languages) ?? [];
  const contentTypes = normalizeContentTypeList(row.contentTypes) ?? [];
  const platform = normalizePlatform(row.platform);
  const followers = row.verifiedFollowers ?? row.followers;
  if (
    !category ||
    !platform ||
    languages.length === 0 ||
    contentTypes.length === 0 ||
    !Number.isSafeInteger(followers) ||
    followers < 0 ||
    followers > 100_000_000
  ) {
    return null;
  }
  const instagram = normalizeInstagramUrl(row.instagram);
  const youtube = normalizeYouTubeUrl(row.youtube);
  const profileUrl = normalizeProfileUrl(row.profileUrl, platform);
  if (!(profileUrl ?? instagram ?? youtube)) return null;

  return {
    id: row.id,
    name: row.name,
    instagram,
    youtube,
    profileUrl,
    platform,
    followers,
    category,
    languages: languages.join(", "),
    location: row.location,
    contentTypes: contentTypes.join(", "),
    bio: row.bio,
    status: row.status,
    verificationStatus: row.verificationStatus,
    createdAt: serializeDate(row.createdAt),
  };
});
