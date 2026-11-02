import assert from "node:assert/strict";
import test from "node:test";
import {
  getBearerToken,
  hasCookie,
  isDiagnosticTokenValid,
  toPublicDatabaseHealth,
} from "../backend/health-diagnostics.ts";
import {
  getHealthDiagnosticToken,
  healthDiagnosticTokenProblem,
} from "../backend/secret-config.ts";

test("public health output contains only the compatibility status fields", () => {
  const detailed = {
    ok: false,
    status: "degraded",
    checks: { database: "fail", schema: "fail" },
    missingSchemaItems: null,
    checkedAt: "2026-11-02T15:00:00.000Z",
    pool: {
      initialized: true,
      totalCount: 3,
      idleCount: 1,
      waitingCount: 2,
      expiredCount: 0,
      errorCount: 4,
      lastErrorAt: "2026-11-02T14:59:00.000Z",
    },
  };

  assert.deepEqual(toPublicDatabaseHealth(detailed), {
    ok: false,
    status: "degraded",
    checkedAt: "2026-11-02T15:00:00.000Z",
  });
  assert.equal(detailed.pool.totalCount, 3, "projection must not mutate diagnostic data");
});

test("only a single Bearer credential is accepted from the Authorization header", () => {
  assert.equal(getBearerToken("Bearer diagnostic-token"), "diagnostic-token");
  assert.equal(getBearerToken("bearer diagnostic-token"), "diagnostic-token");
  assert.equal(getBearerToken("Basic diagnostic-token"), null);
  assert.equal(getBearerToken("Bearer"), null);
  assert.equal(getBearerToken("Bearer first second"), null);
  assert.equal(getBearerToken("diagnostic-token"), null);
  assert.equal(getBearerToken(null), null);
});

test("diagnostic token comparison requires an exact configured token", () => {
  const expected = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  assert.equal(isDiagnosticTokenValid(expected, expected), true);
  assert.equal(isDiagnosticTokenValid(`${expected}x`, expected), false);
  assert.equal(isDiagnosticTokenValid(expected.slice(1), expected), false);
  assert.equal(isDiagnosticTokenValid(expected, null), false);
  assert.equal(isDiagnosticTokenValid(null, expected), false);
});

test("optional diagnostic token must be strong and distinct when configured", () => {
  const strongToken = "7f3a9c1e5b8d2046f1a7c9e3b5d80246a9f1c7e5b3d9082f6a4c1e7b5d9038f2a6";
  const otherSecret = "a91c4e7b2d605f83c6a0e9b4d7285f13a6c9e2b705d48f31a9c6e4b7082d5f1936";

  assert.equal(healthDiagnosticTokenProblem({}), null);
  assert.equal(getHealthDiagnosticToken({}), null);
  assert.equal(getHealthDiagnosticToken({ HEALTH_DIAGNOSTIC_TOKEN: strongToken, SESSION_SECRET: otherSecret }), strongToken);
  assert.deepEqual(healthDiagnosticTokenProblem({ HEALTH_DIAGNOSTIC_TOKEN: "short" }), {
    name: "HEALTH_DIAGNOSTIC_TOKEN",
    reason: "weak",
  });
  assert.equal(getHealthDiagnosticToken({ HEALTH_DIAGNOSTIC_TOKEN: "short" }), null);
  assert.deepEqual(
    healthDiagnosticTokenProblem({ HEALTH_DIAGNOSTIC_TOKEN: strongToken, SESSION_SECRET: strongToken }),
    { name: "HEALTH_DIAGNOSTIC_TOKEN", reason: "shared" },
  );
  assert.deepEqual(
    healthDiagnosticTokenProblem({ HEALTH_DIAGNOSTIC_TOKEN: strongToken, ADMIN_PASSWORD: strongToken }),
    { name: "HEALTH_DIAGNOSTIC_TOKEN", reason: "shared" },
  );
});

test("admin-cookie presence check matches only the exact non-empty cookie", () => {
  const name = "__Host-yl_admin";
  assert.equal(hasCookie(`theme=light; ${name}=signed-token; other=1`, name), true);
  assert.equal(hasCookie(`${name}=`, name), false);
  assert.equal(hasCookie(`x${name}=signed-token`, name), false);
  assert.equal(hasCookie(`${name}x=signed-token`, name), false);
  assert.equal(hasCookie(null, name), false);
});
