import test from "node:test";
import assert from "node:assert/strict";
import { getDatabasePoolConfig } from "../backend/db/connection-config.ts";

const previewPoolerUrl =
  "postgresql://yaarlink_app.rjxpvkzlwhabuntfvkct:p%40ss%3Aword@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=verify-full";
const pem = "-----BEGIN CERTIFICATE-----\nunit-test-ca\n-----END CERTIFICATE-----";

test("verified Supabase transaction-pooler URI accepts the custom role/ref username", () => {
  const config = getDatabasePoolConfig({ DATABASE_URL: previewPoolerUrl, DATABASE_CA_CERT: pem });
  assert.match(config.connectionString, /^postgresql:\/\/yaarlink_app\.rjxpvkzlwhabuntfvkct:/);
  assert.match(config.connectionString, /@aws-0-ap-southeast-1\.pooler\.supabase\.com:6543\/postgres/);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.ca, pem);
  assert.doesNotMatch(config.connectionString, /sslmode=/i);
});

test("a single matching quote pair around the pooler URI is normalized safely", () => {
  for (const quote of ["'", '"']) {
    const config = getDatabasePoolConfig({
      DATABASE_URL: `${quote}${previewPoolerUrl}${quote}`,
      DATABASE_CA_CERT: pem,
    });
    assert.match(config.connectionString, /^postgresql:\/\/yaarlink_app\.rjxpvkzlwhabuntfvkct:/);
  }
});

test("a command-line psql wrapper is rejected as invalid", () => {
  assert.throws(
    () => getDatabasePoolConfig({ DATABASE_URL: `psql '${previewPoolerUrl}'`, DATABASE_CA_CERT: pem }),
    /valid PostgreSQL connection URL/,
  );
});

test("remote Supabase connections cannot disable certificate verification", () => {
  assert.throws(
    () => getDatabasePoolConfig({ DATABASE_URL: previewPoolerUrl.replace("sslmode=verify-full", "sslmode=disable") }),
    /verified TLS/,
  );
});
