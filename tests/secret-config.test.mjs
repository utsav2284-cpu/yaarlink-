import assert from "node:assert/strict";
import test from "node:test";
import { collectServerSecretProblems } from "../backend/secret-config.ts";

const sessionSecret = "a91c4e7b2d605f83c6a0e9b4d7285f13a6c9e2b705d48f31a9c6e4b7082d5f1936";

test("a strong user-session signing secret is sufficient", () => {
  assert.deepEqual(collectServerSecretProblems({ SESSION_SECRET: sessionSecret }), []);
});

test("retired admin environment values are ignored", () => {
  assert.deepEqual(collectServerSecretProblems({ SESSION_SECRET: sessionSecret, ADMIN_SESSION_SECRET: "retired" }), []);
});
