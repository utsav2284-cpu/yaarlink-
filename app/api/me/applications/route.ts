import { getSessionUser, sessionSecretProblem } from "@/backend/auth";
import { applicationContactOptions, isCompletedCreatorProfile } from "@/backend/application-contact";
import { db } from "@/backend/db";
import { applications, campaigns, creators } from "@/backend/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  allConditions,
  cursorCondition,
  decodeCursor,
  isListingQueryError,
  paginateRows,
  parseEnumParam,
  parseListingParams,
  parseUuidListParam,
  parseUuidParam,
  scopeFrom,
  searchCondition,
  sortOrder,
  textExpression,
  type SortKey,
} from "@/backend/pagination";
import { APPLICATION_STATUSES, normalizeContentType } from "@/shared/constants";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
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

/**
 * Private, reload-safe application state for the signed-in creator. The
 * public campaigns page uses this to keep showing an existing application
 * instead of presenting every campaign as unapplied after a refresh.
 */
export async function GET(req: Request) {
  if (sessionSecretProblem()) {
    return Response.json(
      { error: "Session service is temporarily unavailable", code: "service_unavailable" },
      { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
    );
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return Response.json(
        { error: "Please log in to view your applications", code: "login_required" },
        { status: 401, headers: NO_STORE },
      );
    }

    const params = new URL(req.url).searchParams;
    const listing = parseListingParams(params, {
      defaultLimit: 50,
      defaultSort: "updated",
      allowedSorts: OWN_APPLICATION_SORTS,
    });

    if (user.role !== "creator") {
      return Response.json(
        {
          applications: [],
          creatorProfile: null,
          contactOptions: [],
          pagination: { limit: listing.limit, total: 0, returned: 0, hasMore: false, nextCursor: null },
        },
        { headers: NO_STORE },
      );
    }

    const status = parseEnumParam(params, "status", APPLICATION_STATUSES);
    const campaignId = parseUuidParam(params, "campaignId");
    const campaignIds = parseUuidListParam(params, "campaignIds");
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
          creatorName: applications.creatorName,
          creatorContact: applications.creatorContact,
          message: applications.message,
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

    return Response.json(
      {
        applications: items.map((row) => ({
          ...row,
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
        pagination,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (isListingQueryError(e)) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    }
    console.error(e);
    return Response.json(
      { error: "Could not load your applications", code: "load_failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
