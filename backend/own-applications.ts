import { applicationContactOptions, isCompletedCreatorProfile } from "@/backend/application-contact";
import type { SessionUser } from "@/backend/auth";
import { db } from "@/backend/db";
import { applications, campaigns, creators } from "@/backend/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  allConditions,
  cursorCondition,
  decodeCursor,
  paginateRows,
  parseEnumParam,
  parseListingParams,
  parseUuidListParam,
  parseUuidParam,
  scopeFrom,
  searchCondition,
  sortOrder,
  textExpression,
  type PaginationMeta,
  type SortKey,
} from "@/backend/pagination";
import { APPLICATION_STATUSES, normalizeContentType } from "@/shared/constants";
import { parseCreatorProfileSnapshot, type CreatorProfileSnapshot } from "@/backend/application-snapshot";

const OWN_APPLICATION_SORTS = ["updated", "newest", "oldest", "status"] as const;

type OwnApplicationSortRow = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function ownApplicationSortKeys(sort: string): Array<SortKey<OwnApplicationSortRow>> {
  switch (sort) {
    case "newest":
      return [
        { expression: sql`${applications.createdAt}`, direction: "desc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    case "oldest":
      return [
        { expression: sql`${applications.createdAt}`, direction: "asc", kind: "date", value: (row) => row.createdAt },
        { expression: sql`${applications.id}`, direction: "asc", kind: "uuid", value: (row) => row.id },
      ];
    case "status":
      return [
        { expression: sql`${applications.status}`, direction: "asc", kind: "string", value: (row) => row.status },
        { expression: sql`${applications.updatedAt}`, direction: "desc", kind: "date", value: (row) => row.updatedAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
    default:
      return [
        { expression: sql`${applications.updatedAt}`, direction: "desc", kind: "date", value: (row) => row.updatedAt },
        { expression: sql`${applications.id}`, direction: "desc", kind: "uuid", value: (row) => row.id },
      ];
  }
}

export interface OwnApplicationListItem {
  id: string;
  campaignId: string;
  creatorId: string;
  creatorName: string;
  creatorContact: string | null;
  message: string | null;
  quoteAmount: number | null;
  proposedTimelineDays: number | null;
  proposedTimeline: string | null;
  creatorProfileSnapshot: CreatorProfileSnapshot | null;
  snapshotCapturedAt: string | null;
  status: string;
  decisionNote: string | null;
  decisionAt: string | null;
  createdAt: string;
  updatedAt: string;
  campaignTitle: string | null;
  businessName: string | null;
  format: string | null;
  location: string | null;
}

export interface OwnApplicationsResult {
  applications: OwnApplicationListItem[];
  creatorProfile: {
    id: string;
    name: string;
    status: string;
    completed: boolean;
  } | null;
  contactOptions: string[];
  ownCampaignIds: string[];
  pagination: PaginationMeta;
}

/**
 * Private, reload-safe application state for one signed-in user. It backs
 * both /api/me/applications and the server-rendered campaigns page, so the
 * page does not need a second client request merely to show whether the
 * visitor already applied to or owns one of the first campaigns.
 */
export async function listOwnApplications(
  user: SessionUser,
  params: URLSearchParams,
): Promise<OwnApplicationsResult> {
    const listing = parseListingParams(params, {
      defaultLimit: 50,
      defaultSort: "updated",
      allowedSorts: OWN_APPLICATION_SORTS,
    });

    const status = parseEnumParam(params, "status", APPLICATION_STATUSES);
    const campaignId = parseUuidParam(params, "campaignId");
    const campaignIds = parseUuidListParam(params, "campaignIds");
    const requestedCampaignIds = campaignIds ?? (campaignId ? [campaignId] : []);
    const scope = scopeFrom({
      listing: "own-applications",
      userId: user.id,
      q: listing.q,
      status,
      campaignId,
      campaignIds: campaignIds ? [...campaignIds].sort() : null,
    });
    const keys = ownApplicationSortKeys(listing.sort);
    const cursorValues = decodeCursor(listing.cursor, { sort: listing.sort, scope, keys });
    const search = searchCondition(
      [
        textExpression(sql`${applications.creatorName}`),
        textExpression(sql`${applications.creatorContact}`),
        textExpression(sql`${applications.message}`),
        textExpression(sql`${applications.proposedTimeline}`),
        textExpression(sql`${applications.quoteAmount}`),
        textExpression(sql`${applications.decisionNote}`),
        textExpression(sql`${applications.status}`),
        textExpression(sql`${campaigns.title}`),
        textExpression(sql`${campaigns.businessName}`),
        textExpression(sql`${campaigns.location}`),
        textExpression(sql`${campaigns.format}`),
      ],
      listing.q,
    );
    const baseWhere = allConditions([
      eq(applications.userId, user.id),
      status ? eq(applications.status, status) : undefined,
      campaignId ? eq(applications.campaignId, campaignId) : undefined,
      campaignIds ? inArray(applications.campaignId, campaignIds) : undefined,
      search,
    ]);
    const pageWhere = allConditions([baseWhere, cursorCondition(keys, cursorValues)]);

    const [[creatorProfile], [totalRow], rowsWithExtra] = await Promise.all([
      db.select().from(creators).where(eq(creators.userId, user.id)).limit(1),
      db
        .select({ count: sql<number>`count(distinct ${applications.id})::int` })
        .from(applications)
        .leftJoin(campaigns, eq(applications.campaignId, campaigns.id))
        .where(baseWhere),
      db
        .select({
          id: applications.id,
          campaignId: applications.campaignId,
          creatorId: applications.creatorId,
          creatorName: applications.creatorName,
          creatorContact: applications.creatorContact,
          message: applications.message,
          quoteAmount: applications.quoteAmount,
          proposedTimelineDays: applications.proposedTimelineDays,
          proposedTimeline: applications.proposedTimeline,
          creatorProfileSnapshot: applications.creatorProfileSnapshot,
          snapshotCapturedAt: applications.snapshotCapturedAt,
          status: applications.status,
          decisionNote: applications.decisionNote,
          decisionAt: applications.decisionAt,
          createdAt: applications.createdAt,
          updatedAt: applications.updatedAt,
          campaignTitle: campaigns.title,
          businessName: campaigns.businessName,
          format: campaigns.format,
          location: campaigns.location,
        })
        .from(applications)
        .leftJoin(campaigns, eq(applications.campaignId, campaigns.id))
        .where(pageWhere)
        .orderBy(...sortOrder(keys))
        .limit(listing.limit + 1),
    ]);
    const { items, pagination } = paginateRows(rowsWithExtra, {
      limit: listing.limit,
      total: Number(totalRow?.count ?? 0),
      sort: listing.sort,
      scope,
      keys,
    });

    const ownCampaignRows = requestedCampaignIds.length
      ? await db
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(and(eq(campaigns.ownerId, user.id), inArray(campaigns.id, requestedCampaignIds)))
      : [];

    return {
        applications: items.map((row) => ({
          ...row,
          creatorProfileSnapshot: parseCreatorProfileSnapshot(row.creatorProfileSnapshot),
          snapshotCapturedAt: row.snapshotCapturedAt ? new Date(row.snapshotCapturedAt).toISOString() : null,
          decisionAt: row.decisionAt ? new Date(row.decisionAt).toISOString() : null,
          createdAt: new Date(row.createdAt).toISOString(),
          updatedAt: new Date(row.updatedAt).toISOString(),
          format: normalizeContentType(row.format) ?? row.format,
        })),
        creatorProfile: creatorProfile
          ? {
              id: creatorProfile.id,
              name: creatorProfile.name,
              status: creatorProfile.status,
              completed: isCompletedCreatorProfile(creatorProfile),
            }
          : null,
        contactOptions: applicationContactOptions(user, creatorProfile).map((option) => option.value),
        ownCampaignIds: ownCampaignRows.map((row) => row.id),
        pagination,
    };
}
