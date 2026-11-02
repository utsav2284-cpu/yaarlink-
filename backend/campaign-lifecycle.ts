import { and, eq, inArray, lte } from "drizzle-orm";
import { recordAuditEvent } from "@/backend/audit-events";
import { db } from "@/backend/db";
import { campaigns } from "@/backend/db/schema";
import { allConditions } from "@/backend/pagination";

type CampaignExpiryExecutor = Pick<typeof db, "insert" | "update">;

export const EXPIRABLE_CAMPAIGN_STATUSES = ["pending", "open", "paused"] as const;

export function isCampaignPastExpiry(
  campaign: { status: string; expiresAt: Date | string },
  now = new Date(),
): boolean {
  const expiresAt = campaign.expiresAt instanceof Date ? campaign.expiresAt : new Date(campaign.expiresAt);
  return EXPIRABLE_CAMPAIGN_STATUSES.includes(campaign.status as (typeof EXPIRABLE_CAMPAIGN_STATUSES)[number]) &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt.getTime() <= now.getTime();
}

/** Transition one already-locked/loaded campaign in the caller's transaction. */
export async function markCampaignExpired(
  executor: CampaignExpiryExecutor,
  campaign: { id: string; ownerId: string; status: string; expiresAt: Date | string },
  now = new Date(),
): Promise<boolean> {
  if (!isCampaignPastExpiry(campaign, now)) return false;
  const [updated] = await executor
    .update(campaigns)
    .set({ status: "expired", expiredAt: now, updatedAt: now })
    .where(
      and(
        eq(campaigns.id, campaign.id),
        inArray(campaigns.status, [...EXPIRABLE_CAMPAIGN_STATUSES]),
        lte(campaigns.expiresAt, now),
      ),
    )
    .returning({ id: campaigns.id });
  if (!updated) return false;

  await recordAuditEvent(executor, {
    actorType: "system",
    ownerUserId: campaign.ownerId,
    entityType: "campaign",
    entityId: campaign.id,
    action: "campaign.expired",
    fromStatus: campaign.status,
    toStatus: "expired",
    changedFields: ["expiredAt", "status"],
    createdAt: now,
  });
  return true;
}

/**
 * Lazily materialize the expired state when owner/admin surfaces are read.
 * Public queries also filter on `expiresAt`, so a campaign is hidden at the
 * deadline even before this best-effort status transition has run.
 */
export async function expireOverdueCampaigns({
  ownerId,
  campaignId,
  limit = 250,
  now = new Date(),
}: {
  ownerId?: string;
  campaignId?: string;
  limit?: number;
  now?: Date;
} = {}): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(1_000, Math.floor(limit)));
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: campaigns.id, ownerId: campaigns.ownerId, status: campaigns.status, expiresAt: campaigns.expiresAt })
      .from(campaigns)
      .where(
        allConditions([
          inArray(campaigns.status, [...EXPIRABLE_CAMPAIGN_STATUSES]),
          lte(campaigns.expiresAt, now),
          ownerId ? eq(campaigns.ownerId, ownerId) : undefined,
          campaignId ? eq(campaigns.id, campaignId) : undefined,
        ]),
      )
      .orderBy(campaigns.expiresAt)
      .limit(boundedLimit)
      .for("update", { skipLocked: true });

    let expired = 0;
    for (const row of rows) {
      if (await markCampaignExpired(tx, row, now)) expired += 1;
    }
    return expired;
  });
}
