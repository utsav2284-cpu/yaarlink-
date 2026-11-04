import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SITE_AVAILABILITY,
  effectiveSiteAvailability,
  isSiteAvailabilityExemptPath,
  parseSiteAvailabilitySettings,
  siteAvailabilitySettingsFromValue,
} from "../shared/site-availability.ts";

test("site availability defaults online when no setting exists", () => {
  assert.deepEqual(siteAvailabilitySettingsFromValue(null), DEFAULT_SITE_AVAILABILITY);
  assert.equal(effectiveSiteAvailability(DEFAULT_SITE_AVAILABILITY).isUnavailable, false);
});

test("site availability parses a bounded scheduled maintenance window", () => {
  const settings = parseSiteAvailabilitySettings(JSON.stringify({
    mode: "maintenance",
    message: "  Back soon.  ",
    startsAt: "2026-11-03T10:00:00.000Z",
    endsAt: "2026-11-03T11:00:00.000Z",
    updatedAt: "2026-11-03T09:00:00.000Z",
    unexpected: "ignored",
  }));
  assert.deepEqual(settings, {
    mode: "maintenance",
    message: "Back soon.",
    startsAt: "2026-11-03T10:00:00.000Z",
    endsAt: "2026-11-03T11:00:00.000Z",
    updatedAt: "2026-11-03T09:00:00.000Z",
  });

  assert.equal(effectiveSiteAvailability(settings, new Date("2026-11-03T09:59:00.000Z")).isScheduled, true);
  const active = effectiveSiteAvailability(settings, new Date("2026-11-03T10:15:00.000Z"));
  assert.equal(active.isUnavailable, true);
  assert.equal(active.effectiveMode, "maintenance");
  assert.equal(active.retryAfterSeconds, 2700);
  assert.equal(effectiveSiteAvailability(settings, new Date("2026-11-03T11:00:00.000Z")).isUnavailable, false);
});

test("malformed site availability settings are rejected", () => {
  assert.equal(parseSiteAvailabilitySettings({ mode: "paused" }), null);
  assert.equal(parseSiteAvailabilitySettings({ mode: "maintenance", message: "x".repeat(501) }), null);
  assert.equal(parseSiteAvailabilitySettings({ mode: "emergency", startsAt: "not-a-date" }), null);
  assert.equal(parseSiteAvailabilitySettings({
    mode: "maintenance",
    startsAt: "2026-11-03T11:00:00.000Z",
    endsAt: "2026-11-03T10:00:00.000Z",
  }), null);
});

test("admin, health, logout and static paths remain available during maintenance", () => {
  for (const path of ["/admin", "/api/admin/data", "/api/health", "/api/security/csp-report", "/api/auth/logout", "/_next/static/app.js", "/icon.svg"]) {
    assert.equal(isSiteAvailabilityExemptPath(path), true, path);
  }
  for (const path of ["/", "/campaigns", "/creators", "/api/campaigns", "/api/auth/login"]) {
    assert.equal(isSiteAvailabilityExemptPath(path), false, path);
  }
});
