import { eq } from "drizzle-orm";
import { db } from "@/backend/db";
import { settings } from "@/backend/db/schema";
import {
  DEFAULT_SITE_AVAILABILITY,
  effectiveSiteAvailability,
  serializeSiteAvailabilitySettings,
  siteAvailabilitySettingsFromValue,
  type EffectiveSiteAvailability,
  type SiteAvailabilitySettings,
} from "@/shared/site-availability";

export const SITE_AVAILABILITY_SETTING = "site_availability";

type SettingsReader = Pick<typeof db, "select">;
type SettingsWriter = Pick<typeof db, "insert">;

const CACHE_TTL_MS = 5_000;

type SiteAvailabilityCache = {
  settings: SiteAvailabilitySettings;
  expiresAt: number;
};

const globalForSiteAvailability = globalThis as typeof globalThis & {
  __yaarlinkSiteAvailabilityCache?: SiteAvailabilityCache;
};

export async function getSiteAvailabilitySettings(
  executor: SettingsReader = db,
): Promise<SiteAvailabilitySettings> {
  const [row] = await executor
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SITE_AVAILABILITY_SETTING))
    .limit(1);
  return siteAvailabilitySettingsFromValue(row?.value);
}

export async function upsertSiteAvailabilitySettings(
  executor: SettingsWriter,
  next: SiteAvailabilitySettings,
  now = new Date(),
): Promise<SiteAvailabilitySettings> {
  const stored: SiteAvailabilitySettings = { ...next, updatedAt: now.toISOString() };
  await executor
    .insert(settings)
    .values({ key: SITE_AVAILABILITY_SETTING, value: serializeSiteAvailabilitySettings(stored), updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: serializeSiteAvailabilitySettings(stored), updatedAt: now },
    });
  return stored;
}

export function primeSiteAvailabilityCache(settingsValue: SiteAvailabilitySettings): void {
  globalForSiteAvailability.__yaarlinkSiteAvailabilityCache = {
    settings: settingsValue,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

/**
 * Request-path read with a five-second per-instance cache. PostgreSQL remains
 * the source of truth; the cache only bounds the maintenance check to one
 * small settings query per warm instance per window. If the database cannot
 * be reached, the last known setting is retained briefly. With no last known
 * value the normal application error handling remains in charge rather than
 * the proxy inventing an availability state it could not verify.
 */
export async function getEffectiveSiteAvailabilityCached(now: Date = new Date()): Promise<EffectiveSiteAvailability> {
  const nowMs = now.getTime();
  const cached = globalForSiteAvailability.__yaarlinkSiteAvailabilityCache;
  if (cached && cached.expiresAt > nowMs) return effectiveSiteAvailability(cached.settings, now);

  try {
    const settingsValue = await getSiteAvailabilitySettings();
    globalForSiteAvailability.__yaarlinkSiteAvailabilityCache = {
      settings: settingsValue,
      expiresAt: nowMs + CACHE_TTL_MS,
    };
    return effectiveSiteAvailability(settingsValue, now);
  } catch {
    const fallback = cached?.settings ?? DEFAULT_SITE_AVAILABILITY;
    globalForSiteAvailability.__yaarlinkSiteAvailabilityCache = {
      settings: fallback,
      expiresAt: nowMs + CACHE_TTL_MS,
    };
    return effectiveSiteAvailability(fallback, now);
  }
}
