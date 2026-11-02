import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAmountInput } from "../shared/numeric-input.ts";

test("letters and symbols can never be typed into an amount field", () => {
  assert.equal(sanitizeAmountInput("vbnm"), "");
  assert.equal(sanitizeAmountInput("8ooo"), "8");
  assert.equal(sanitizeAmountInput("₹8,000 only"), "8,000");
  assert.equal(sanitizeAmountInput("Rs. 5000/-"), "5000");
  assert.equal(sanitizeAmountInput("-500"), "500");
  assert.equal(sanitizeAmountInput("1.5k"), "15");
});

test("plain and grouped amounts survive untouched", () => {
  assert.equal(sanitizeAmountInput("8000"), "8000");
  assert.equal(sanitizeAmountInput("8,000"), "8,000");
  assert.equal(sanitizeAmountInput("1,00,00,000"), "1,00,00,000");
  assert.equal(sanitizeAmountInput("100,000,000"), "100,000,000");
  assert.equal(sanitizeAmountInput(""), "");
});

test("leading commas from a paste are dropped", () => {
  assert.equal(sanitizeAmountInput(",8000"), "8000");
  assert.equal(sanitizeAmountInput(",,8,000"), "8,000");
  assert.equal(sanitizeAmountInput(","), "");
});
