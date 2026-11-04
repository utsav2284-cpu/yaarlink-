import test from "node:test";
import assert from "node:assert/strict";

import {
  adminAccountCookieAttributes,
  isLoopbackAppUrl,
  resolveAdminAccountCookieMode,
} from "../shared/admin-cookie.ts";

test("default admin cookie mode is strict", () => {
  assert.equal(resolveAdminAccountCookieMode({}), "strict");
  assert.equal(resolveAdminAccountCookieMode({ APP_URL: "https://www.theyaar.com" }), "strict");
  assert.equal(resolveAdminAccountCookieMode({ APP_URL: "http://localhost:4025" }), "strict");
});

test("embedded-preview override is ignored for non-loopback APP_URL", () => {
  assert.equal(
    resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "none", APP_URL: "https://www.theyaar.com" }),
    "strict",
  );
  assert.equal(
    resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "none", APP_URL: "https://4025-preview.e2b.app" }),
    "strict",
  );
  assert.equal(resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "none", APP_URL: "not a url" }), "strict");
  assert.equal(resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "none" }), "strict");
});

test("embedded-preview mode requires explicit none + loopback APP_URL", () => {
  assert.equal(
    resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "none", APP_URL: "http://localhost:4025" }),
    "embedded-preview",
  );
  assert.equal(
    resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "None", APP_URL: "http://127.0.0.1:4025" }),
    "embedded-preview",
  );
  assert.equal(
    resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: " none ", APP_URL: "http://[::1]:4025" }),
    "embedded-preview",
  );
  assert.equal(
    resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "lax", APP_URL: "http://localhost:4025" }),
    "strict",
  );
  assert.equal(
    resolveAdminAccountCookieMode({ ADMIN_COOKIE_SAME_SITE: "", APP_URL: "http://localhost:4025" }),
    "strict",
  );
});

test("loopback detection", () => {
  assert.equal(isLoopbackAppUrl("http://localhost:3000"), true);
  assert.equal(isLoopbackAppUrl("http://dev.localhost:3000"), true);
  assert.equal(isLoopbackAppUrl("http://127.0.0.1:3000/path"), true);
  assert.equal(isLoopbackAppUrl("https://www.theyaar.com"), false);
  assert.equal(isLoopbackAppUrl("http://localhost.evil.example"), false);
  assert.equal(isLoopbackAppUrl(undefined), false);
  assert.equal(isLoopbackAppUrl(""), false);
});

test("strict cookie attributes are unchanged from the established policy", () => {
  assert.deepEqual(adminAccountCookieAttributes("strict", 43200), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 43200,
  });
});

test("embedded-preview cookie attributes use None + Secure + Partitioned", () => {
  assert.deepEqual(adminAccountCookieAttributes("embedded-preview", 43200), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
    path: "/",
    maxAge: 43200,
  });
  // Deletion must mirror the same attributes with maxAge 0.
  assert.equal(adminAccountCookieAttributes("embedded-preview", 0).maxAge, 0);
});
