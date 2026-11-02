import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedMutationOrigin } from "../shared/csrf.ts";

function check(overrides = {}) {
  return isAllowedMutationOrigin({
    method: "POST",
    origin: "https://www.theyaar.com",
    referer: null,
    secFetchSite: "same-origin",
    requestHost: "www.theyaar.com",
    allowedHosts: ["www.theyaar.com", "theyaar.com"],
    ...overrides,
  });
}

test("safe methods are never blocked by the mutation guard", () => {
  assert.equal(check({ method: "GET", origin: "https://evil.example", secFetchSite: "cross-site" }), true);
  assert.equal(check({ method: "HEAD", origin: "https://evil.example" }), true);
});

test("first-party mutations pass, cross-origin and subdomain mutations are blocked", () => {
  assert.equal(check(), true);
  assert.equal(check({ method: "patch" }), true);
  assert.equal(check({ origin: "https://evil.example" }), false);
  assert.equal(check({ origin: "https://sub.theyaar.com" }), false);
  assert.equal(check({ origin: "https://theyaar.com.evil.example" }), false);
  assert.equal(check({ origin: "https://theyaar.com@evil.example" }), false);
});

test("canonical hosts may originate mutations on preview/alias hosts", () => {
  assert.equal(check({ requestHost: "yaarlink-preview.vercel.app" }), true);
  assert.equal(check({ requestHost: "yaarlink-preview.vercel.app", origin: "https://theyaar.com" }), true);
  assert.equal(
    check({ requestHost: "yaarlink-preview.vercel.app", origin: "https://yaarlink-preview.vercel.app" }),
    true,
  );
});

test("browser-labelled cross-site requests are blocked regardless of Origin", () => {
  assert.equal(check({ secFetchSite: "cross-site" }), false);
  assert.equal(check({ secFetchSite: "same-site", origin: "https://sub.theyaar.com" }), false);
  assert.equal(check({ secFetchSite: "same-origin" }), true);
});

test("non-browser requests without Origin/Referer are left to route auth", () => {
  assert.equal(check({ origin: null, referer: null, secFetchSite: null }), true);
  assert.equal(check({ origin: null, referer: "https://www.theyaar.com/dashboard", secFetchSite: null }), true);
  assert.equal(check({ origin: null, referer: "https://evil.example/form", secFetchSite: null }), false);
});

test("opaque, malformed, and non-http origins are blocked", () => {
  assert.equal(check({ origin: "null" }), false);
  assert.equal(check({ origin: "not a url" }), false);
  assert.equal(check({ origin: "javascript:alert(1)" }), false);
  assert.equal(check({ origin: "file:///etc/passwd" }), false);
});

test("ports must match the addressed host", () => {
  assert.equal(check({ requestHost: "localhost:3000", origin: "http://localhost:3000" }), true);
  assert.equal(check({ requestHost: "localhost:3000", origin: "http://localhost:4000" }), false);
});
