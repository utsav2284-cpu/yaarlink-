import { inArray, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { settings } from "@/backend/db/schema";
import { CAMPAIGN_DEFAULT_EXPIRY_DAYS, CAMPAIGN_MAX_EXPIRY_DAYS } from "@/shared/constants";

export const CAMPAIGN_DEFAULT_EXPIRY_SETTING = "campaign_default_expiry_days";
export const CAMPAIGN_MAX_EXPIRY_SETTING = "campaign_max_expiry_days";
/** Stable singleton ID used only to key platform-settings audit events. */
export const PLATFORM_SETTINGS_ENTITY_ID = "00000000-0000-4000-8000-000000000001";

export type CampaignExpiryPolicy = {
  defaultExpiryDays: number;
  maxExpiryDays: number;
};

type SettingsReader = Pick<typeof db, "select">;
type SettingsWriter = Pick<typeof db, "insert">;

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value || !/^-?\d+$/.test(value.trim())) return fallback;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function campaignExpiryPolicyFromSettings(rows: Iterable<{ key: string; value: string }>): CampaignExpiryPolicy {
  const values = new Map([...rows].map((row) => [row.key, row.value]));
  const defaultExpiryDays = boundedInteger(values.get(CAMPAIGN_DEFAULT_EXPIRY_SETTING), CAMPAIGN_DEFAULT_EXPIRY_DAYS, 7, 90);
  const configuredMax = boundedInteger(values.get(CAMPAIGN_MAX_EXPIRY_SETTING), CAMPAIGN_MAX_EXPIRY_DAYS, 7, 365);
  return {
    defaultExpiryDays,
    maxExpiryDays: Math.max(defaultExpiryDays, configuredMax),
  };
}

/**
 * The settings table is the owner-editable source for these two platform
 * values. Missing/malformed rows fall back to the compiled defaults so a
 * campaign submission never fails merely because the optional rows have not
 * been seeded yet; the admin settings endpoint validates writes strictly.
 */
export async function getCampaignExpiryPolicy(executor: SettingsReader = db): Promise<CampaignExpiryPolicy> {
  const rows = await executor
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [CAMPAIGN_DEFAULT_EXPIRY_SETTING, CAMPAIGN_MAX_EXPIRY_SETTING]));
  return campaignExpiryPolicyFromSettings(rows);
}

export function validCampaignExpiryPolicy(value: CampaignExpiryPolicy): boolean {
  return (
    Number.isSafeInteger(value.defaultExpiryDays) &&
    Number.isSafeInteger(value.maxExpiryDays) &&
    value.defaultExpiryDays >= 7 &&
    value.defaultExpiryDays <= 90 &&
    value.maxExpiryDays >= value.defaultExpiryDays &&
    value.maxExpiryDays <= 365
  );
}

export async function upsertCampaignExpiryPolicy(
  executor: SettingsWriter,
  policy: CampaignExpiryPolicy,
  now = new Date(),
): Promise<void> {
  await executor
    .insert(settings)
    .values([
      { key: CAMPAIGN_DEFAULT_EXPIRY_SETTING, value: String(policy.defaultExpiryDays), updatedAt: now },
      { key: CAMPAIGN_MAX_EXPIRY_SETTING, value: String(policy.maxExpiryDays), updatedAt: now },
    ])
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        // The multi-row upsert's proposed value is available through the
        // special excluded row in PostgreSQL; Drizzle emits this SQL form.
        value: sql`excluded.value`,
        updatedAt: now,
      },
    });
}

export function defaultCampaignExpiry(now: Date, policy: CampaignExpiryPolicy): Date {
  return new Date(now.getTime() + policy.defaultExpiryDays * 86_400_000);
}

export type ParsedCampaignDeadline =
  | { ok: true; present: boolean; deadlineAt: Date | null; expiresAt: Date }
  | { ok: false };

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Parse the optional campaign closing field. A date-only value means the end
 * of that day in India (the product's operating timezone), not midnight UTC.
 * Blank means "use the platform default" and still produces a concrete
 * expiry; an absent field is distinguishable for partial lifecycle calls.
 */
export function parseCampaignDeadline(
  value: unknown,
  { now, policy, present }: { now: Date; policy: CampaignExpiryPolicy; present: boolean },
): ParsedCampaignDeadline {
  const fallback = defaultCampaignExpiry(now, policy);
  if (!present || value === undefined) return { ok: true, present: false, deadlineAt: null, expiresAt: fallback };
  if (value === null || (typeof value === "string" && !value.trim())) {
    return { ok: true, present: true, deadlineAt: null, expiresAt: fallback };
  }
  if (typeof value !== "string") return { ok: false };

  const input = value.trim();
  let deadline: Date | null = null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!validCalendarDate(year, month, day)) return { ok: false };
    deadline = new Date(`${input}T23:59:59.999+05:30`);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(input)) {
    deadline = new Date(input);
  }

  if (!deadline || Number.isNaN(deadline.getTime())) return { ok: false };
  const max = now.getTime() + (policy.maxExpiryDays + 1) * 86_400_000;
  if (deadline.getTime() <= now.getTime() || deadline.getTime() > max) return { ok: false };
  return { ok: true, present: true, deadlineAt: deadline, expiresAt: deadline };
}
