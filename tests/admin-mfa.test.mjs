import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTotpUri,
  decodeBase32,
  encodeBase32,
  generateRecoveryCodes,
  generateTotpSecret,
  matchTotpCode,
  normalizeRecoveryCode,
  totpForCounter,
} from "../shared/admin-mfa.ts";

const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("Base32 encoding matches the RFC TOTP test secret", () => {
  const bytes = new TextEncoder().encode(RFC_SECRET_ASCII);
  assert.equal(encodeBase32(bytes).replace(/=+$/, ""), RFC_SECRET_BASE32);
  assert.deepEqual(decodeBase32(RFC_SECRET_BASE32), bytes);
  assert.deepEqual(decodeBase32("gezd gnbv-gy3t qojq"), new TextEncoder().encode("1234567890"));
  assert.equal(decodeBase32("not base32!"), null);
});

test("generated TOTP secrets are 20 random bytes in Base32 form", () => {
  const first = generateTotpSecret();
  const second = generateTotpSecret();
  assert.equal(first.bytes.length, 20);
  assert.equal(decodeBase32(first.base32)?.length, 20);
  assert.notEqual(first.base32, second.base32);
});

test("TOTP matches the RFC 6238 SHA-1 vector truncated to six digits", async () => {
  const secret = decodeBase32(RFC_SECRET_BASE32);
  assert.ok(secret);
  // RFC 6238 at T=59 seconds is 94287082 for eight digits; YaarLink uses six.
  assert.equal(await totpForCounter(secret, 1), "287082");
  assert.equal(await matchTotpCode({ secret, code: "287082", at: 59_000 }), 1);
  assert.equal(await matchTotpCode({ secret, code: "287 082", at: 59_000 }), 1);
  assert.equal(await matchTotpCode({ secret, code: "000000", at: 59_000 }), null);
  assert.equal(await matchTotpCode({ secret, code: "28708", at: 59_000 }), null);
});

test("TOTP URI contains issuer, account and standard parameters", () => {
  const uri = buildTotpUri({ issuer: "YaarLink Admin", account: "owner@example.test", secret: RFC_SECRET_BASE32 });
  assert.match(uri, /^otpauth:\/\/totp\/YaarLink%20Admin:owner%40example\.test\?/);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
});

test("recovery codes are unique, grouped, and normalize for hashing", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(normalizeRecoveryCode(code.toLowerCase()), code.replaceAll("-", ""));
  }
  assert.equal(normalizeRecoveryCode("ABCD-EFGH"), null);
  assert.equal(normalizeRecoveryCode(123), null);
});
