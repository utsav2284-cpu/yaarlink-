import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePhoneInput } from "../shared/phone-input.ts";

test("letters and symbols can never be typed into a phone field", () => {
  assert.equal(sanitizePhoneInput("vbnm"), "");
  assert.equal(sanitizePhoneInput("98abc765"), "98765");
  assert.equal(sanitizePhoneInput("call me: 98123 45678!"), "98123 45678");
  assert.equal(sanitizePhoneInput("९८७६५"), "");
  assert.equal(sanitizePhoneInput("📞9812345678"), "9812345678");
});

test("real phone shapes survive untouched", () => {
  assert.equal(sanitizePhoneInput("9812345678"), "9812345678");
  assert.equal(sanitizePhoneInput("+91 98123 45678"), "+91 98123 45678");
  assert.equal(sanitizePhoneInput("098123-45678"), "098123-45678");
  assert.equal(sanitizePhoneInput("+1 (202) 555-0123"), "+1 (202) 555-0123");
  assert.equal(sanitizePhoneInput("0091 9812345678"), "0091 9812345678");
});

test("only one leading plus is kept", () => {
  assert.equal(sanitizePhoneInput("++91 98123"), "+91 98123");
  assert.equal(sanitizePhoneInput("91+98123"), "9198123");
  assert.equal(sanitizePhoneInput("  +91 98123"), "+91 98123");
  assert.equal(sanitizePhoneInput("+"), "+");
  assert.equal(sanitizePhoneInput(""), "");
});
