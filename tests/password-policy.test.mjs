import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPasswordRequirements,
  generateSuggestedPassword,
  isPasswordCompliant,
} from "../shared/password-policy.ts";

test("the minimum length is long enough to resist offline cracking", () => {
  // Six characters is a few seconds of GPU work regardless of character
  // classes, so the floor must stay well above it.
  assert.ok(PASSWORD_MIN_LENGTH >= 10, `expected a minimum of at least 10, got ${PASSWORD_MIN_LENGTH}`);
});

test("a valid password at exactly the minimum length is accepted", () => {
  const shortest = "Aa1!bcdefg"; // 10 characters
  assert.equal(shortest.length, PASSWORD_MIN_LENGTH);
  assert.equal(isPasswordCompliant(shortest), true);
  assert.deepEqual(checkPasswordRequirements(shortest), {
    minLength: true,
    letterCases: true,
    number: true,
    symbol: true,
  });
});

test("passwords shorter than the minimum are rejected", () => {
  const tooShort = "Aa1!bcdef"; // 9 characters
  assert.equal(tooShort.length, PASSWORD_MIN_LENGTH - 1);
  assert.equal(isPasswordCompliant(tooShort), false);
  assert.equal(checkPasswordRequirements(tooShort).minLength, false);
  assert.equal(isPasswordCompliant("Aa1!b"), false);
  assert.equal(checkPasswordRequirements("Aa1!b").minLength, false);
  assert.equal(isPasswordCompliant(""), false);
});

test("the previously accepted short passwords are now rejected", () => {
  // Regression guard: a six-character password used to pass this policy.
  assert.equal(isPasswordCompliant("Aa1!bc"), false);
});

test("each of the four requirements is checked independently", () => {
  assert.deepEqual(checkPasswordRequirements("aa1!bcdefg"), {
    minLength: true,
    letterCases: false, // no uppercase
    number: true,
    symbol: true,
  });
  assert.equal(checkPasswordRequirements("AA1!BCDEFG").letterCases, false); // no lowercase
  assert.equal(checkPasswordRequirements("Aa!bcdefgh").number, false);
  assert.equal(checkPasswordRequirements("Aa1bcdefgh").symbol, false);
  assert.equal(isPasswordCompliant("aa1!bcdefg"), false);
  assert.equal(isPasswordCompliant("Aa!bcdefgh"), false);
  assert.equal(isPasswordCompliant("Aa1bcdefgh"), false);
});

test("unicode letters, digits, and symbols count", () => {
  assert.equal(isPasswordCompliant("Ää1!bcdefg"), true); // accented letter cases
  assert.equal(isPasswordCompliant("Aa१!bcdefg"), true); // Devanagari digit as the number
  assert.equal(checkPasswordRequirements("Aa1 bcdefg").symbol, false); // space is not a symbol
});

test("the maximum length is enforced in code points, not UTF-16 units", () => {
  const long = "Aa1!" + "b".repeat(PASSWORD_MAX_LENGTH - 4);
  assert.equal(isPasswordCompliant(long), true);
  assert.equal(isPasswordCompliant(`${long}b`), false);
});

test("suggested passwords satisfy the policy", () => {
  for (let i = 0; i < 200; i++) {
    const suggestion = generateSuggestedPassword();
    assert.equal(isPasswordCompliant(suggestion), true, `suggestion failed policy: ${suggestion}`);
    assert.ok(suggestion.length >= PASSWORD_MIN_LENGTH);
    assert.ok(suggestion.length <= PASSWORD_MAX_LENGTH);
  }
});
