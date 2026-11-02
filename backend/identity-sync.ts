import { and, eq, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/backend/audit-events";
import { db } from "@/backend/db";
import { brands, campaigns, creators } from "@/backend/db/schema";

type IdentityExecutor = Pick<typeof db, "insert" | "update">;

export type ContactSource = "account" | "profile" | "campaign";

/**
 * A profile/campaign field is account-sourced only while it intentionally
 * carries the account's current canonical value. A different submitted
 * contact is an explicit profile/campaign contact and remains independent.
 */
export function contactSourceFor(
  value: string | null | undefined,
  accountValue: string | null | undefined,
  customSource: Exclude<ContactSource, "account">,
): ContactSource {
  return value && accountValue && value === accountValue ? "account" : customSource;
}

export async function syncAccountEmailContacts(
  executor: IdentityExecutor,
  { userId, newEmail, now }: { userId: string; newEmail: string; now: Date },
) {
  const brandRows = await executor
    .update(brands)
    .set({ email: newEmail, updatedAt: now })
    .where(and(eq(brands.userId, userId), sql`${brands.email} is distinct from ${newEmail}`))
    .returning({ id: brands.id });
  const creatorRows = await executor
    .update(creators)
    .set({ email: newEmail, updatedAt: now })
    .where(
      and(
        eq(creators.userId, userId),
        eq(creators.emailSource, "account"),
        sql`${creators.email} is distinct from ${newEmail}`,
      ),
    )
    .returning({ id: creators.id });
  const campaignRows = await executor
    .update(campaigns)
    .set({ email: newEmail, updatedAt: now })
    .where(
      and(
        eq(campaigns.ownerId, userId),
        eq(campaigns.emailSource, "account"),
        sql`${campaigns.email} is distinct from ${newEmail}`,
      ),
    )
    .returning({ id: campaigns.id });

  for (const row of brandRows) {
    await recordAuditEvent(executor, {
      actorType: "user",
      actorUserId: userId,
      ownerUserId: userId,
      entityType: "brand",
      entityId: row.id,
      action: "brand.contact_synced",
      changedFields: ["email"],
      createdAt: now,
    });
  }
  for (const row of creatorRows) {
    await recordAuditEvent(executor, {
      actorType: "user",
      actorUserId: userId,
      ownerUserId: userId,
      entityType: "creator_profile",
      entityId: row.id,
      action: "creator_profile.contact_synced",
      changedFields: ["email"],
      createdAt: now,
    });
  }
  for (const row of campaignRows) {
    await recordAuditEvent(executor, {
      actorType: "user",
      actorUserId: userId,
      ownerUserId: userId,
      entityType: "campaign",
      entityId: row.id,
      action: "campaign.contact_synced",
      changedFields: ["email"],
      createdAt: now,
    });
  }

  return { brands: brandRows.length, creators: creatorRows.length, campaigns: campaignRows.length };
}

export async function syncAccountPhoneContacts(
  executor: IdentityExecutor,
  { userId, newPhone, now }: { userId: string; newPhone: string | null; now: Date },
) {
  const brandRows = await executor
    .update(brands)
    .set({ phone: newPhone, updatedAt: now })
    .where(and(eq(brands.userId, userId), sql`${brands.phone} is distinct from ${newPhone}`))
    .returning({ id: brands.id });

  // Creator profiles require a usable phone once completed. Removing the
  // optional account phone therefore detaches that profile contact instead
  // of erasing the separately saved creator phone.
  const creatorRows = newPhone
    ? await executor
        .update(creators)
        .set({ phone: newPhone, updatedAt: now })
        .where(
          and(
            eq(creators.userId, userId),
            eq(creators.phoneSource, "account"),
            sql`${creators.phone} is distinct from ${newPhone}`,
          ),
        )
        .returning({ id: creators.id })
    : await executor
        .update(creators)
        .set({ phoneSource: "profile", updatedAt: now })
        .where(and(eq(creators.userId, userId), eq(creators.phoneSource, "account")))
        .returning({ id: creators.id });

  const campaignRows = await executor
    .update(campaigns)
    .set({ phone: newPhone, phoneSource: "account", updatedAt: now })
    .where(
      and(
        eq(campaigns.ownerId, userId),
        eq(campaigns.phoneSource, "account"),
        sql`${campaigns.phone} is distinct from ${newPhone}`,
      ),
    )
    .returning({ id: campaigns.id });

  for (const row of brandRows) {
    await recordAuditEvent(executor, {
      actorType: "user",
      actorUserId: userId,
      ownerUserId: userId,
      entityType: "brand",
      entityId: row.id,
      action: "brand.contact_synced",
      changedFields: ["phone"],
      createdAt: now,
    });
  }
  for (const row of creatorRows) {
    await recordAuditEvent(executor, {
      actorType: "user",
      actorUserId: userId,
      ownerUserId: userId,
      entityType: "creator_profile",
      entityId: row.id,
      action: "creator_profile.contact_synced",
      changedFields: newPhone ? ["phone"] : ["phoneSource"],
      createdAt: now,
    });
  }
  for (const row of campaignRows) {
    await recordAuditEvent(executor, {
      actorType: "user",
      actorUserId: userId,
      ownerUserId: userId,
      entityType: "campaign",
      entityId: row.id,
      action: "campaign.contact_synced",
      changedFields: ["phone"],
      createdAt: now,
    });
  }

  return { brands: brandRows.length, creators: creatorRows.length, campaigns: campaignRows.length };
}
