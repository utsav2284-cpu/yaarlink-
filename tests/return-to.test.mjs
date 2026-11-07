import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RETURN_TO, buildAuthPath, safeReturnTo } from "../shared/return-to.ts";

test("ordinary same-site page paths are preserved", () => {
  assert.equal(safeReturnTo("/creators"), "/creators");
  assert.equal(safeReturnTo("/campaigns/abc?ref=home#apply"), "/campaigns/abc?ref=home#apply");
  assert.equal(safeReturnTo("/dashboard"), "/dashboard");
});

test("absolute, protocol-relative, and scheme destinations fall back", () => {
  for (const value of [
    "https://evil.example/phish",
    "http://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.example/path",
  ]) {
    assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO, value);
  }
});

test("encoded protocol-relative and backslash tricks fall back", () => {
  for (const value of [
    "/%2f%2fevil.example",
    "/%252f%252fevil.example",
    "/%25252f%25252fevil.example",
    "/\\evil.example",
    "/%5cevil.example",
    "/%255cevil.example",
    "/crea tors",
    "/creators%0a.evil.example",
    "/%00/evil.example",
  ]) {
    assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO, value);
  }
});

test("API, admin, internal, and auth-loop destinations fall back (incl. encoded)", () => {
  for (const value of [
    "/api/me/account",
    "/admin",
    "/admin/users",
    "/%61dmin",
    "/admin%2fusers",
    "/%2e%2e/admin",
    "/_next/data",
    "/login",
    "/login?returnTo=/creators",
    "/signup",
    "/reset-password?token=x",
  ]) {
    assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO, value);
  }
});

test("non-string, empty, and over-long values fall back", () => {
  assert.equal(safeReturnTo(""), DEFAULT_RETURN_TO);
  assert.equal(safeReturnTo("   "), DEFAULT_RETURN_TO);
  assert.equal(safeReturnTo(null), DEFAULT_RETURN_TO);
  assert.equal(safeReturnTo(undefined), DEFAULT_RETURN_TO);
  assert.equal(safeReturnTo(42), DEFAULT_RETURN_TO);
  assert.equal(safeReturnTo({ toString: () => "/creators" }), DEFAULT_RETURN_TO);
  assert.equal(safeReturnTo(`/${"a".repeat(2048)}`), DEFAULT_RETURN_TO);
  assert.equal(safeReturnTo("/creators", ""), "/creators");
  assert.equal(safeReturnTo("//evil.example", ""), "");
});

test("buildAuthPath keeps only safe returnTo and known roles", () => {
  assert.equal(buildAuthPath("/login", { returnTo: "/creators", role: "creator" }), "/login?returnTo=%2Fcreators&role=creator");
  assert.equal(buildAuthPath("/login", { returnTo: "//evil.example", role: "admin" }), "/login");
  assert.equal(buildAuthPath("/signup", { returnTo: "/dashboard" }), "/signup");
});

/* ---------------------------------------------------------------------------
 * Additional coverage added during the security audit: the classic
 * post-login redirect-takeover shapes, plus the fallback and length edges.
 * The original assertions above are kept unchanged.
 * ------------------------------------------------------------------------- */

const AUDIT_BYPASSES = [
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

test("audit: post-login redirects can never leave the site", () => {
  for (const value of AUDIT_BYPASSES) {
    assert.equal(safeReturnTo(value), DEFAULT_RETURN_TO, `unsafe redirect accepted: ${JSON.stringify(value)}`);
  }
});

test("audit: an explicit fallback is honoured for email links", () => {
  assert.equal(safeReturnTo("//evil.com", ""), "");
  assert.equal(safeReturnTo("/dashboard", ""), "/dashboard");
});

test("audit: over-long values fall back instead of being truncated", () => {
  assert.equal(safeReturnTo(`/${"a".repeat(2000)}`), DEFAULT_RETURN_TO);
});
