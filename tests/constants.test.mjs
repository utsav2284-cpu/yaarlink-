import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCategory,
  normalizeContentTypeList,
  normalizeLanguageList,
  normalizePlatform,
} from "../shared/constants.ts";

test("legacy taxonomy aliases canonicalize to stored IDs", () => {
  assert.equal(normalizePlatform("cr.both"), "Both");
  assert.equal(normalizePlatform("cr.otherPlat"), "Other");
  assert.equal(normalizePlatform("Both Instagram & YouTube"), "Both");
  assert.equal(normalizeCategory("मीम और कॉमेडी"), "Memes & Comedy");
  assert.deepEqual(normalizeLanguageList("हिन्दी, Punjabi"), ["Hindi", "Punjabi"]);
  assert.deepEqual(normalizeContentTypeList("स्टोरी, YouTube Shorts"), ["Story", "YouTube Shorts"]);
});

test("unknown taxonomy values are not guessed", () => {
  assert.equal(normalizePlatform("some-new-platform"), null);
  assert.equal(normalizeCategory("some-new-category"), null);
  assert.deepEqual(normalizeLanguageList("Klingon", true), ["Klingon"]);
  assert.equal(normalizeContentTypeList("Hologram"), null);
});
