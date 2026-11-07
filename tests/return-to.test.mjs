import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RETURN_TO, safeReturnTo } from "../shared/return-to.ts";

// These cover the classic post-login redirect takeover shapes. Any regression
// here would let an attacker bounce a freshly authenticated user to a phishing
// origin, so each bypass class is asserted explicitly.
const BYPASSES = [
  "//evil.com",
  "https://evil.com",
  "http://evil.com",
  "/\\evil.com",
  "\\\\evil.com",
  "/%2f%2fevil.com",
  "%2f%2fevil.com",
  "/%252f%252fevil.com",
  "//\\evil.com",
  "/  java\nscript:1",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "/\t/evil.com",
  "//evil.com/../dashboard",
  "/dashboard\nLocation: https://evil.com",
];

const BLOCKED_SAME_SITE = ["/admin", "/admin/users", "/api/creators", "/_next/static/x", "/login", "/signup", "/reset-password", "/verify-email"];

const ALLOWED = ["/dashboard", "/account", "/campaigns", "/creators/abc", "/dashboard?tab=applications", "/campaigns?status=open"];

test("post-login redirects can never leave the site", () => {
  for (const value of BYPASSES) {
    assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO, `unsafe redirect accepted: ${JSON.stringify(value)}`);
  }
});

test("post-login redirects never land on admin, api, or auth pages", () => {
  for (const value of BLOCKED_SAME_SITE) {
    assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO, `blocked destination accepted: ${value}`);
  }
});

test("ordinary in-app destinations survive unchanged", () => {
  for (const value of ALLOWED) {
    assert.equal(safeReturnTo(value), value);
  }
});

test("non-string and empty input falls back", () => {
  for (const value of [undefined, null, 42, {}, [], "", "   "]) {
    assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO);
  }
});

test("an explicit fallback is honoured for email links", () => {
  assert.equal(safeReturnTo("//evil.com", ""), "");
  assert.equal(safeReturnTo("/dashboard", ""), "/dashboard");
});

test("over-long values fall back instead of being truncated", () => {
  assert.equal(safeReturnTo(`/${"a".repeat(2000)}`), DEFAULT_RETURN_TO);
});
