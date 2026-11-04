import assert from "node:assert/strict";
import test from "node:test";
import { collectServerSecretProblems } from "../backend/secret-config.ts";

const sessionSecret = "a91c4e7b2d605f83c6a0e9b4d7285f13a6c9e2b705d48f31a9c6e4b7082d5f1936";
const adminSessionSecret = "7f3a9c1e5b8d2046f1a7c9e3b5d80246a9f1c7e5b3d9082f6a4c1e7b5d9038f2a6";

test("retired shared admin password variables are not startup dependencies", () => {
  const base = {
    SESSION_SECRET: sessionSecret,
    ADMIN_SESSION_SECRET: adminSessionSecret,
  };

  assert.deepEqual(collectServerSecretProblems(base), []);
  assert.deepEqual(
    collectServerSecretProblems({
      ...base,
      ADMIN_PASSWORD: "retired-value-that-must-be-ignored",
      ADMIN_TOTP_SECRET: "not-a-live-config-value",
    }),
    [],
  );
});

test("database administrator session signing secret remains mandatory", () => {
  assert.deepEqual(collectServerSecretProblems({ SESSION_SECRET: sessionSecret }), [
    { name: "ADMIN_SESSION_SECRET", reason: "missing" },
  ]);
});
