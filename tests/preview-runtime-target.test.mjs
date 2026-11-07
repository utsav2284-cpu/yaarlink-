import test from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  assertPreviewDatabaseTarget,
  isPreviewRuntime,
  previewSearchPathStatement,
  previewTargetForEnvironment,
} from "../backend/db/preview-target.ts";

const PREVIEW_DIRECT = `postgresql://yaarlink_app:pw@db.${PREVIEW_PROJECT_REF}.supabase.co:5432/postgres?options=-c%20search_path%3Dapp_preview&sslmode=verify-full`;
const PREVIEW_SESSION_POOLER = `postgresql://yaarlink_app.${PREVIEW_PROJECT_REF}:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?options=-c%20search_path%3Dapp_preview&sslmode=verify-full`;
const PREVIEW_TX_POOLER = `postgresql://yaarlink_app.${PREVIEW_PROJECT_REF}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?options=-c%20search_path%3Dapp_preview&sslmode=verify-full`;
const PRODUCTION_URL = `postgresql://yaarlink_app:pw@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=verify-full`;

// ---------------------------------------------------------------------------
// Transport matrix
// ---------------------------------------------------------------------------

test("direct endpoint on 5432 is accepted as transport 'direct'", () => {
  const target = assertPreviewDatabaseTarget(PREVIEW_DIRECT);
  assert.equal(target.transport, "direct");
  assert.equal(target.port, "5432");
  assert.equal(target.schema, "app_preview");
});

test("Supavisor session mode on 5432 is accepted as transport 'session-pooler'", () => {
  const target = assertPreviewDatabaseTarget(PREVIEW_SESSION_POOLER);
  assert.equal(target.transport, "session-pooler");
  assert.equal(target.schema, "app_preview");
});

test("transaction mode on 6543 is rejected even with search_path in the URL", () => {
  assert.throws(() => assertPreviewDatabaseTarget(PREVIEW_TX_POOLER), /transaction mode \(port 6543\)/);
});

test("a non-5432, non-6543 port is rejected", () => {
  assert.throws(
    () => assertPreviewDatabaseTarget(PREVIEW_DIRECT.replace(":5432", ":6432")),
    /not an approved database port/,
  );
});

// ---------------------------------------------------------------------------
// Required regressions from the review brief
// ---------------------------------------------------------------------------

test("wrong project ref is rejected", () => {
  assert.throws(
    () => assertPreviewDatabaseTarget(PREVIEW_DIRECT.replaceAll(PREVIEW_PROJECT_REF, "abcdefghijklmnopqrst")),
    /neither the Preview direct endpoint nor a Supavisor endpoint/,
  );
});

test("a pooler URL naming a different project in the username is rejected", () => {
  assert.throws(
    () => assertPreviewDatabaseTarget(PREVIEW_SESSION_POOLER.replace(`.${PREVIEW_PROJECT_REF}`, ".someoneelseproject")),
    /neither the Preview direct endpoint/,
  );
});

test("Production URL supplied to Preview is rejected", () => {
  assert.throws(() => assertPreviewDatabaseTarget(PRODUCTION_URL), /Production project/);
});

test("a Production pooler username is rejected", () => {
  const url = `postgresql://yaarlink_app.${PRODUCTION_PROJECT_REF}:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?options=-c%20search_path%3Dapp_preview`;
  assert.throws(() => assertPreviewDatabaseTarget(url), /Production project/);
});

test("missing search_path option is rejected", () => {
  assert.throws(
    // Built explicitly: a replace() on the encoded form is a silent no-op.
    () => assertPreviewDatabaseTarget(
      `postgresql://yaarlink_app:pw@db.${PREVIEW_PROJECT_REF}.supabase.co:5432/postgres?sslmode=verify-full`,
    ),
    /must set options=-c search_path=app_preview/,
  );
});

test("wrong search_path is rejected", () => {
  assert.throws(
    () => assertPreviewDatabaseTarget(PREVIEW_DIRECT.replace("app_preview", "public")),
    /options must set search_path=app_preview/,
  );
});

test("search_path pointing at a console schema is rejected", () => {
  for (const schema of ["admin", "preview", "audit", "ops", "security"]) {
    assert.throws(
      () => assertPreviewDatabaseTarget(PREVIEW_DIRECT.replace("app_preview", schema)),
      /options must set search_path=app_preview/,
    );
  }
});

test("a malformed URL and a non-postgres protocol are rejected", () => {
  assert.throws(() => assertPreviewDatabaseTarget("not a url"), /not a valid URL/);
  assert.throws(
    () => assertPreviewDatabaseTarget(`mysql://u:p@db.${PREVIEW_PROJECT_REF}.supabase.co:5432/postgres`),
    /must be a postgresql:\/\//,
  );
});

// ---------------------------------------------------------------------------
// Environment scoping: Production must never be affected
// ---------------------------------------------------------------------------

test("enforcement activates only for VERCEL_ENV=preview", () => {
  assert.equal(isPreviewRuntime({ VERCEL_ENV: "preview" }), true);
  assert.equal(isPreviewRuntime({ VERCEL_ENV: "production" }), false);
  assert.equal(isPreviewRuntime({ VERCEL_ENV: "development" }), false);
  assert.equal(isPreviewRuntime({}), false);
});

test("Production runtime returns null and is never forced to require app_preview", () => {
  // A bare production URL with no options at all must be accepted silently.
  assert.equal(
    previewTargetForEnvironment({ VERCEL_ENV: "production", DATABASE_URL: PRODUCTION_URL }),
    null,
  );
  // Even a malformed production URL must not be validated by this module.
  assert.equal(
    previewTargetForEnvironment({ VERCEL_ENV: "production", DATABASE_URL: "garbage" }),
    null,
  );
  // Development behaves the same way.
  assert.equal(previewTargetForEnvironment({ NODE_ENV: "test" }), null);
});

test("Preview with a missing DATABASE_URL fails closed", () => {
  assert.throws(() => previewTargetForEnvironment({ VERCEL_ENV: "preview" }), /not configured/);
});

test("Preview with a Production DATABASE_URL fails closed", () => {
  assert.throws(
    () => previewTargetForEnvironment({ VERCEL_ENV: "preview", DATABASE_URL: PRODUCTION_URL }),
    /Production project/,
  );
});

test("Preview with a valid URL returns the enforced target", () => {
  assert.equal(
    previewTargetForEnvironment({ VERCEL_ENV: "preview", DATABASE_URL: PREVIEW_SESSION_POOLER }).schema,
    "app_preview",
  );
});

// ---------------------------------------------------------------------------
// Session-level search_path statement
// ---------------------------------------------------------------------------

test("the search_path statement pins the schema and keeps pg_catalog", () => {
  assert.equal(previewSearchPathStatement("app_preview"), "SET search_path = app_preview, pg_catalog");
});

test("the search_path statement refuses an unsafe identifier", () => {
  for (const bad of ["app_preview; DROP SCHEMA public", "Public", "app-preview", "", "app_preview,public"]) {
    assert.throws(() => previewSearchPathStatement(bad), /unsafe schema identifier/);
  }
});
