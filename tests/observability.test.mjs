import assert from "node:assert/strict";
import test from "node:test";
import {
  createLogRecord,
  isValidRequestId,
  normalizeRequestId,
  normalizeRoutePath,
  redactString,
  requestIdFromHeaders,
  routeFromRequest,
  sanitizeLogValue,
  serializeLogError,
} from "../shared/observability.ts";
import {
  normalizeSqlForFingerprint,
  shouldLogSlowQuery,
  slowQueryThresholdMs,
  sqlFingerprint,
  sqlOperation,
} from "../backend/db/slow-query.ts";

test("request IDs accept only bounded correlation-safe values", () => {
  assert.equal(isValidRequestId("req_12345678"), true);
  assert.equal(isValidRequestId("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isValidRequestId("short"), false);
  assert.equal(isValidRequestId("bad request id with spaces"), false);
  assert.equal(isValidRequestId("x".repeat(129)), false);
  assert.equal(normalizeRequestId("  req_12345678, another-value"), "req_12345678");
  assert.equal(normalizeRequestId("not valid"), undefined);

  const headers = new Headers({ "x-vercel-id": "iad1::iad1::abc12345-1234567890" });
  assert.equal(requestIdFromHeaders(headers), "iad1::iad1::abc12345-1234567890");
  assert.match(requestIdFromHeaders(new Headers()), /^[0-9a-f-]{36}$/);
  assert.equal(requestIdFromHeaders(new Headers(), false), undefined);
});

test("route logging removes queries and normalizes ID-like path segments", () => {
  assert.equal(
    normalizeRoutePath("/campaigns/123e4567-e89b-12d3-a456-426614174000?token=secret"),
    "/campaigns/[id]",
  );
  assert.equal(normalizeRoutePath("/admin/items/42#details"), "/admin/items/[id]");
  assert.equal(
    routeFromRequest(
      new Request("https://example.test/api/campaigns/42?email=person@example.com", {
        method: "POST",
      }),
    ),
    "POST /api/campaigns/[id]",
  );
});

test("string redaction removes credentials and direct contact identifiers", () => {
  const redacted = redactString(
    [
      "database postgresql://app:do-not-log@db.example.test/app",
      "url https://example.test/reset?token=do-not-log",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      "jwt abcdefghijklmnop.qrstuvwxyzabcdef.ghijklmnopqrstuvwxyz",
      "email person@example.com",
      "phone +91 98765 43210",
      "password=do-not-log",
      "hash $2b$12$12345678901234567890123456789012345678901234567890123",
    ].join(" "),
  );

  assert.doesNotMatch(redacted, /do-not-log|person@example\.com|98765|abcdefghijklmnopqrstuvwxyz/);
  assert.match(redacted, /\[REDACTED_URL\]/);
  assert.match(redacted, /\[REDACTED_EMAIL\]/);
  assert.match(redacted, /\[REDACTED_PHONE\]/);
  assert.match(redacted, /\[REDACTED_PASSWORD_HASH\]/);
});

test("log sanitization is key-aware and bounds nested values", () => {
  const circular = { label: "loop" };
  circular.self = circular;

  const sanitized = sanitizeLogValue({
    operation: "send_email",
    passwordHash: "do-not-log",
    query: "SELECT * FROM users",
    details: { email: "person@example.com" },
    nested: { recipientEmail: "person@example.com", status: "failed" },
    circular,
  });

  assert.equal(sanitized.operation, "send_email");
  assert.equal(sanitized.passwordHash, "[REDACTED]");
  assert.equal(sanitized.query, "[REDACTED]");
  assert.equal(sanitized.details, "[REDACTED]");
  assert.equal(sanitized.nested.recipientEmail, "[REDACTED]");
  assert.equal(sanitized.nested.status, "failed");
  assert.equal(sanitized.circular.self, "[Circular]");
});

test("query-bearing database errors never expose SQL, parameters, details, or hints", () => {
  const root = new Error("duplicate key value violates unique constraint");
  Object.assign(root, {
    code: "23505",
    constraint: "users_email_key",
    table: "users",
    column: "email",
    schema: "public",
    routine: "_bt_doinsert",
    severity: "ERROR",
    detail: "Key (email)=(person@example.com) already exists.",
    hint: "do-not-log-hint",
  });

  const wrapper = new Error(
    "Failed query: INSERT INTO users(email) VALUES($1) params: person@example.com",
    { cause: root },
  );
  Object.assign(wrapper, {
    query: "INSERT INTO users(email) VALUES($1)",
    params: ["person@example.com"],
  });
  wrapper.stack = "Error: Failed query: INSERT INTO users(email) VALUES($1) params: person@example.com";

  const serialized = serializeLogError(wrapper);
  const encoded = JSON.stringify(serialized);

  assert.equal(serialized.message, "Database query failed");
  assert.equal(serialized.code, "23505");
  assert.equal(serialized.constraint, "users_email_key");
  assert.equal(serialized.table, "users");
  assert.equal(serialized.column, "email");
  assert.equal(serialized.schema, "public");
  assert.equal(serialized.routine, "_bt_doinsert");
  assert.equal(serialized.severity, "ERROR");
  assert.equal(serialized.stack, undefined);
  assert.equal(serialized.cause?.stack, undefined);
  assert.doesNotMatch(
    encoded,
    /person@example\.com|INSERT INTO|do-not-log-hint|Key \(email\)|"params"|"query"/i,
  );
});

test("structured log records have the stable operational shape", () => {
  const record = createLogRecord(
    "warn",
    "database.slow_query",
    {
      route: "GET /api/campaigns",
      requestId: "req_12345678",
      component: "database",
      operation: "select",
      durationMs: 1500,
      authorization: "Bearer do-not-log",
    },
    new Error("provider unavailable for person@example.com"),
  );

  assert.equal(record.service, "yaarlink");
  assert.equal(record.level, "warn");
  assert.equal(record.event, "database.slow_query");
  assert.equal(record.route, "GET /api/campaigns");
  assert.equal(record.requestId, "req_12345678");
  assert.equal(record.component, "database");
  assert.equal(record.operation, "select");
  assert.equal(record.durationMs, 1500);
  assert.equal(record.authorization, "[REDACTED]");
  assert.doesNotMatch(JSON.stringify(record), /do-not-log|person@example\.com/);
  assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("slow-query thresholds are defaulted and clamped", () => {
  assert.equal(slowQueryThresholdMs({}), 1000);
  assert.equal(slowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: "not-a-number" }), 1000);
  assert.equal(slowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: "1" }), 50);
  assert.equal(slowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: "2500.4" }), 2500);
  assert.equal(slowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: "999999" }), 60000);

  assert.equal(shouldLogSlowQuery(999, 1000), false);
  assert.equal(shouldLogSlowQuery(1000, 1000), true);
  assert.equal(shouldLogSlowQuery(Number.NaN, 1000), false);
});

test("slow-query fingerprints hash normalized SQL without literals or parameters", () => {
  const first = "SELECT * FROM users WHERE email = 'person@example.com' AND id = $1 -- lookup";
  const second = "select * from users where email = 'other@example.com' and id = $9";
  const normalized = normalizeSqlForFingerprint(first);

  assert.doesNotMatch(normalized, /person@example\.com|\$1|lookup/);
  assert.equal(sqlFingerprint(first), sqlFingerprint(second));
  assert.match(sqlFingerprint(first), /^[0-9a-f]{16}$/);
  assert.notEqual(sqlFingerprint(first), sqlFingerprint("SELECT * FROM campaigns"));

  assert.equal(sqlOperation(first), "select");
  assert.equal(sqlOperation("/* job */ INSERT INTO settings(key, value) VALUES($1, $2)"), "insert");
  assert.equal(sqlOperation("WITH changed AS (UPDATE users SET name=$1 RETURNING id) SELECT * FROM changed"), "select");
  assert.equal(sqlOperation("WITH picked AS (SELECT id FROM users) INSERT INTO settings(key, value) SELECT 'k', id::text FROM picked"), "insert");
  assert.equal(sqlOperation({ text: "DELETE FROM notifications WHERE id=$1" }), "delete");
  assert.equal(sqlOperation(""), "unknown");
});
