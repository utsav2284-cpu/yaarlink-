import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPasswordRequirements,
  generateSuggestedPassword,
  isPasswordCompliant,
} from "../shared/password-policy.ts";

test("a valid 6-character password is accepted", () => {
  assert.equal(isPasswordCompliant("Aa1!bc"), true);
  assert.deepEqual(checkPasswordRequirements("Aa1!bc"), {
    minLength: true,
    letterCases: true,
    number: true,
    symbol: true,
  });
});

test("passwords shorter than 6 characters are rejected", () => {
  assert.equal(isPasswordCompliant("Aa1!b"), false);
  assert.equal(checkPasswordRequirements("Aa1!b").minLength, false);
  assert.equal(isPasswordCompliant(""), false);
});

test("each of the four requirements is checked independently", () => {
  assert.deepEqual(checkPasswordRequirements("aa1!bc"), {
    minLength: true,
    letterCases: false, // no uppercase
    number: true,
    symbol: true,
  });
  assert.equal(checkPasswordRequirements("AA1!BC").letterCases, false); // no lowercase
  assert.equal(checkPasswordRequirements("Aa!bcd").number, false);
  assert.equal(checkPasswordRequirements("Aa1bcd").symbol, false);
  assert.equal(isPasswordCompliant("aa1!bc"), false);
  assert.equal(isPasswordCompliant("Aa!bcd"), false);
  assert.equal(isPasswordCompliant("Aa1bcd"), false);
});

test("unicode letters, digits, and symbols count", () => {
  assert.equal(isPasswordCompliant("Ää1!bc"), true);
  assert.equal(isPasswordCompliant("Aa१!bc"), true); // Devanagari digit
  assert.equal(checkPasswordRequirements("Aa1 bc").symbol, false); // space is not a symbol
});

test("suggested passwords always satisfy every requirement", () => {
  for (let i = 0; i < 50; i += 1) {
    const suggested = generateSuggestedPassword();
    assert.equal(isPasswordCompliant(suggested), true, suggested);
    assert.ok(suggested.length >= 8);
  }
});
