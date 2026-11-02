import assert from "node:assert/strict";
import test from "node:test";
import {
  SITE,
  callLink,
  gmailComposeLink,
  instagramDmLink,
  instagramLink,
  mailtoLink,
  normalizeInstagramHandle,
  normalizedPhoneDigits,
  splitSiteDomain,
  validateSiteConfig,
  whatsappLink,
  whatsappWithText,
} from "../config/site.ts";

test("SITE host and apex domain are derived from the canonical origin", () => {
  const origin = new URL(SITE.url);
  assert.equal(SITE.url, origin.origin);
  assert.equal(SITE.host, origin.hostname);
  assert.equal(SITE.domain, origin.hostname.replace(/^www\./, ""));
  assert.deepEqual(validateSiteConfig(SITE), []);
});

test("link builders produce well-formed links for the shipped config", () => {
  assert.match(whatsappLink, /^https:\/\/wa\.me\/[1-9][0-9]{7,14}$/);
  assert.equal(callLink, `tel:+${whatsappLink.split("/").pop()}`);
  assert.equal(new URL(instagramLink).hostname, "instagram.com");
  assert.equal(new URL(instagramDmLink).hostname, "ig.me");
  assert.ok(whatsappWithText("hello world").endsWith("?text=hello%20world"));
  assert.ok(mailtoLink("Quote please").startsWith("mailto:"));
  assert.equal(new URL(gmailComposeLink()).hostname, "mail.google.com");
});

test("phone and Instagram normalization rejects malformed values", () => {
  assert.equal(normalizedPhoneDigits("+91 98765 43210"), "919876543210");
  assert.equal(normalizedPhoneDigits("12345"), "");
  assert.equal(normalizedPhoneDigits("call-me"), "");
  assert.equal(normalizedPhoneDigits("0".repeat(20)), "");

  assert.equal(normalizeInstagramHandle("yaarlink"), "yaarlink");
  assert.equal(normalizeInstagramHandle("@yaarlink"), "yaarlink");
  assert.equal(normalizeInstagramHandle("https://instagram.com/yaarlink"), "");
  assert.equal(normalizeInstagramHandle("bad handle"), "");
  assert.equal(normalizeInstagramHandle(".leading.dot"), "");
});

test("domain splitting follows the configured host, including long values", () => {
  assert.deepEqual(splitSiteDomain("theyaar.com"), { prefix: "the", highlight: "yaar", suffix: ".com" });
  assert.deepEqual(splitSiteDomain("www.theyaar.com"), { prefix: "the", highlight: "yaar", suffix: ".com" });
  assert.deepEqual(splitSiteDomain("https://www.example.co.in/path"), {
    prefix: "",
    highlight: "example.co",
    suffix: ".in",
  });
  assert.deepEqual(splitSiteDomain("a-very-long-marketplace-domain.example"), {
    prefix: "",
    highlight: "a-very-long-marketplace-domain",
    suffix: ".example",
  });
  assert.deepEqual(splitSiteDomain(""), { prefix: "", highlight: "", suffix: "" });
});

test("malformed site config reports field/code pairs without echoing values", () => {
  const broken = {
    ...SITE,
    url: "http://www.theyaar.com/landing?x=1",
    host: "wrong.example.com",
    domain: "not a domain",
    whatsappNumber: "123",
    phoneDisplay: "+91 00000 00000",
    email: "not-an-email",
    instagram: "@bad handle!",
  };
  const issues = validateSiteConfig(broken);
  const byField = new Map();
  for (const issue of issues) {
    assert.deepEqual(Object.keys(issue).sort(), ["code", "field"]);
    if (!byField.has(issue.field)) byField.set(issue.field, []);
    byField.get(issue.field).push(issue.code);
  }
  assert.deepEqual(byField.get("url"), ["insecure_url", "url_not_origin"]);
  assert.ok(byField.get("host").includes("url_host_mismatch"));
  assert.ok(byField.get("domain").includes("url_domain_mismatch"));
  assert.ok(byField.get("domain").includes("invalid_domain"));
  assert.deepEqual(byField.get("whatsappNumber"), ["invalid_whatsapp_number"]);
  assert.deepEqual(byField.get("phoneDisplay"), ["phone_display_mismatch"]);
  assert.deepEqual(byField.get("email"), ["invalid_email"]);
  assert.deepEqual(byField.get("instagram"), ["instagram_leading_at", "invalid_instagram"]);

  const serialized = JSON.stringify(issues);
  assert.doesNotMatch(serialized, /not-an-email|bad handle|wrong\.example|00000/);
});
