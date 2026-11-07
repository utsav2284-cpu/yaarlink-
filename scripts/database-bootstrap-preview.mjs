#!/usr/bin/env node
/**
 * Preview-schema bootstrap for the dedicated `app_preview` schema.
 *
 * This is the Preview counterpart to scripts/database-bootstrap.mjs. It does
 * NOT reuse the production baseline: the application tables live in
 * `app_preview`, not `public`, so the shared 0000/0001 pair is never executed.
 *
 * Journal: Drizzle's SQL migrator is deliberately not used, because it journals
 * into `drizzle.__drizzle_migrations` and would then believe the production
 * 0000/0001 pair had been applied. Preview bookkeeping is kept separate, in
 * `app_preview.__app_preview_migrations`, so the two histories can never be
 * confused for one another.
 *
 * Usage:
 *   BOOTSTRAP_DATABASE_URL=... node scripts/database-bootstrap-preview.mjs
 *   BOOTSTRAP_DATABASE_URL=... node scripts/database-bootstrap-preview.mjs --verify
 *   BOOTSTRAP_DATABASE_URL=... node scripts/database-bootstrap-preview.mjs \
 *       --set-password --verify-write
 *
 * --set-password prompts on a TTY and never accepts a password as an argument,
 * in an environment variable, or in a file.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import pg from "pg";
import {
  EXPECTED_TABLES,
  FULL_ACCESS_TABLES,
  PREVIEW_SCHEMA,
  RESTRICTED_PRIVILEGES,
  assertNoForeignSchemaTargets,
  assertPreviewDirectTarget,
  previewMigrationFiles,
  splitStatements,
} from "./lib/preview-schema-migrations.mjs";

const { Pool } = pg;

const JOURNAL_SCHEMA = PREVIEW_SCHEMA;
const JOURNAL_TABLE = "__app_preview_migrations";

const argv = new Set(process.argv.slice(2));
const verifyOnly = argv.has("--verify");
const verifyWrite = argv.has("--verify-write");
const setPassword = argv.has("--set-password");

const connectionString =
  process.env.BOOTSTRAP_DATABASE_URL || process.env.PROVISIONING_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Set BOOTSTRAP_DATABASE_URL or PROVISIONING_DATABASE_URL to an administrator connection. DATABASE_URL is intentionally not accepted for bootstrapping.",
  );
}

assertPreviewDirectTarget(connectionString);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function one(client, text, params = []) {
  return (await client.query(text, params)).rows[0] ?? null;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Refuse to run against a database that already holds production tables. */
async function assertTargetIsSafe(client) {
  const version = await one(client, "SHOW server_version_num");
  assert(
    Number(version?.server_version_num ?? 0) >= 130000,
    "PostgreSQL 13 or newer is required so gen_random_uuid() is available without an extension.",
  );

  const foreign = await client.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_name = ANY($1::text[])
        AND table_schema <> $2
      ORDER BY table_schema, table_name`,
    [EXPECTED_TABLES, JOURNAL_SCHEMA],
  );
  assert(
    foreign.rowCount === 0,
    `Refusing to bootstrap: application tables already exist outside ${JOURNAL_SCHEMA} (${foreign.rows
      .slice(0, 5)
      .map((r) => `${r.table_schema}.${r.table_name}`)
      .join(", ")}). This script only ever manages ${JOURNAL_SCHEMA}.`,
  );

  return { serverVersion: version?.server_version_num };
}

async function ensureJournal(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${JOURNAL_SCHEMA}`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${JOURNAL_SCHEMA}.${JOURNAL_TABLE} (
       id serial PRIMARY KEY,
       name text NOT NULL UNIQUE,
       checksum text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

async function applyMigrations(client) {
  const files = previewMigrationFiles();
  const applied = [];
  for (const file of files) {
    assertNoForeignSchemaTargets(file.sql, file.name);
    const checksum = sha256(file.sql);
    const existing = await one(
      client,
      `SELECT checksum FROM ${JOURNAL_SCHEMA}.${JOURNAL_TABLE} WHERE name = $1`,
      [file.name],
    );
    if (existing) {
      assert(
        existing.checksum === checksum,
        `Migration ${file.name} was already applied with a different checksum. Refusing to continue; investigate before re-running.`,
      );
      console.info(`  = ${file.name} (already applied)`);
      continue;
    }

    await client.query("BEGIN");
    try {
      for (const statement of splitStatements(file.sql)) {
        await client.query(statement);
      }
      await client.query(
        `INSERT INTO ${JOURNAL_SCHEMA}.${JOURNAL_TABLE} (name, checksum) VALUES ($1, $2)`,
        [file.name, checksum],
      );
      await client.query("COMMIT");
      console.info(`  + ${file.name}`);
      applied.push(file.name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file.name} failed: ${error.message}`);
    }
  }
  return applied;
}

async function assertRoleAndGrants(client) {
  const role = await one(
    client,
    `SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls, rolconnlimit
       FROM pg_roles WHERE rolname = 'yaarlink_app'`,
  );
  assert(role, "yaarlink_app role was not created");
  assert(role.rolinherit === true, "yaarlink_app must have INHERIT");
  assert(role.rolsuper === false, "yaarlink_app must not be superuser");
  assert(role.rolcreatedb === false, "yaarlink_app must not create databases");
  assert(role.rolcreaterole === false, "yaarlink_app must not create roles");
  assert(role.rolreplication === false, "yaarlink_app must not replicate");
  assert(role.rolbypassrls === false, "yaarlink_app must not bypass RLS");
  assert(Number(role.rolconnlimit) === -1, "yaarlink_app connection limit must be unrestricted");

  const schemaPriv = await one(
    client,
    `SELECT has_schema_privilege('yaarlink_app', $1, 'USAGE') AS usage,
            has_schema_privilege('yaarlink_app', $1, 'CREATE') AS create_table`,
    [JOURNAL_SCHEMA],
  );
  assert(schemaPriv?.usage === true, `yaarlink_app needs USAGE on ${JOURNAL_SCHEMA}`);
  assert(schemaPriv?.create_table === false, `yaarlink_app must not create in ${JOURNAL_SCHEMA}`);

  for (const table of FULL_ACCESS_TABLES) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const row = await one(
        client,
        "SELECT has_table_privilege('yaarlink_app', $1, $2) AS allowed",
        [`${JOURNAL_SCHEMA}.${table}`, privilege],
      );
      assert(row?.allowed === true, `yaarlink_app is missing ${privilege} on ${table}`);
    }
  }

  for (const [table, allowed] of RESTRICTED_PRIVILEGES) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const row = await one(
        client,
        "SELECT has_table_privilege('yaarlink_app', $1, $2) AS allowed",
        [`${JOURNAL_SCHEMA}.${table}`, privilege],
      );
      assert(
        row?.allowed === allowed.has(privilege),
        `Unexpected ${privilege} for yaarlink_app on ${table}`,
      );
    }
  }
}

async function assertTablesRlsAndPolicies(client) {
  const tables = await client.query(
    `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r','p') AND c.relname = ANY($2::text[])
      ORDER BY c.relname`,
    [JOURNAL_SCHEMA, EXPECTED_TABLES],
  );
  assert(tables.rowCount === EXPECTED_TABLES.length, "One or more application tables are missing");
  for (const table of tables.rows) {
    assert(table.rls_enabled === true, `RLS is not enabled on ${table.table_name}`);
  }

  const policies = await client.query(
    `SELECT c.relname AS table_name, p.polname AS policy_name,
            p.polcmd AS command, p.polpermissive AS permissive,
            EXISTS (
              SELECT 1 FROM unnest(p.polroles) AS role_oid
                JOIN pg_roles r ON r.oid = role_oid
               WHERE r.rolname = 'yaarlink_app'
            ) AS applies_to_app
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`,
    [JOURNAL_SCHEMA, EXPECTED_TABLES],
  );

  const commandsByTable = new Map(EXPECTED_TABLES.map((t) => [t, new Set()]));
  for (const policy of policies.rows) {
    assert(policy.permissive === true, `Policy ${policy.policy_name} must be permissive`);
    assert(policy.applies_to_app === true, `Policy ${policy.policy_name} does not apply to yaarlink_app`);
    commandsByTable.get(policy.table_name)?.add(policy.command);
  }
  for (const table of FULL_ACCESS_TABLES) {
    assert(commandsByTable.get(table)?.has("*"), `Missing FOR ALL policy on ${table}`);
  }
  assert(
    commandsByTable.get("admin_audit_logs")?.size === 2 &&
      commandsByTable.get("admin_audit_logs")?.has("r") &&
      commandsByTable.get("admin_audit_logs")?.has("a"),
    "admin_audit_logs must have only SELECT and INSERT policies",
  );
  assert(
    commandsByTable.get("audit_events")?.size === 3 &&
      commandsByTable.get("audit_events")?.has("r") &&
      commandsByTable.get("audit_events")?.has("a") &&
      commandsByTable.get("audit_events")?.has("w"),
    "audit_events must have only SELECT, INSERT and UPDATE policies",
  );
}

/**
 * The isolation proof. The application role must hold no table privilege in
 * any schema other than app_preview, and must hold no USAGE on the console
 * schemas. `public` is reported separately because PostgreSQL grants it to
 * PUBLIC by default; it is harmless only because it contains no tables.
 */
async function assertCrossSchemaIsolation(client) {
  const foreignTables = await client.query(
    `SELECT n.nspname AS schema, c.relname AS table_name,
            has_table_privilege('yaarlink_app', c.oid, 'SELECT') AS can_select,
            has_table_privilege('yaarlink_app', c.oid, 'INSERT') AS can_insert,
            has_table_privilege('yaarlink_app', c.oid, 'UPDATE') AS can_update,
            has_table_privilege('yaarlink_app', c.oid, 'DELETE') AS can_delete
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p','v','m','f')
        AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        AND n.nspname <> $1
        AND n.nspname NOT LIKE 'pg_temp%'
        AND (has_table_privilege('yaarlink_app', c.oid, 'SELECT')
          OR has_table_privilege('yaarlink_app', c.oid, 'INSERT')
          OR has_table_privilege('yaarlink_app', c.oid, 'UPDATE')
          OR has_table_privilege('yaarlink_app', c.oid, 'DELETE'))`,
    [JOURNAL_SCHEMA],
  );
  assert(
    foreignTables.rowCount === 0,
    `yaarlink_app holds table privileges outside ${JOURNAL_SCHEMA}: ${foreignTables.rows
      .slice(0, 5)
      .map((r) => `${r.schema}.${r.table_name}`)
      .join(", ")}`,
  );

  for (const schema of ["admin", "preview", "audit", "ops", "security"]) {
    const exists = await one(client, "SELECT 1 AS present FROM pg_namespace WHERE nspname = $1", [schema]);
    if (!exists) continue;
    const usage = await one(
      client,
      "SELECT has_schema_privilege('yaarlink_app', $1, 'USAGE') AS allowed",
      [schema],
    );
    assert(usage?.allowed === false, `yaarlink_app must not have USAGE on ${schema}`);
  }

  const publicUsage = await one(
    client,
    "SELECT has_schema_privilege('yaarlink_app','public','USAGE') AS allowed",
  );
  const publicTables = await one(
    client,
    `SELECT count(*)::int AS c FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`,
  );
  return { publicUsage: publicUsage?.allowed === true, publicTableCount: publicTables?.c ?? 0 };
}

async function expectPermissionDenied(client, label, operation) {
  await client.query("SAVEPOINT expected_denial");
  try {
    await operation();
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT expected_denial");
    await client.query("RELEASE SAVEPOINT expected_denial");
    assert(error?.code === "42501", `${label} failed with ${error?.code}, not permission denied`);
    return;
  }
  await client.query("RELEASE SAVEPOINT expected_denial");
  throw new Error(`${label} unexpectedly succeeded`);
}

async function assertAppRoleWrites(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE yaarlink_app");

    await client.query(`INSERT INTO ${JOURNAL_SCHEMA}.settings (key, value) VALUES ('bootstrap_probe','one')`);
    const setting = await one(
      client,
      `SELECT value FROM ${JOURNAL_SCHEMA}.settings WHERE key = 'bootstrap_probe'`,
    );
    assert(setting?.value === "one", "yaarlink_app could not read its settings probe");
    await client.query(`UPDATE ${JOURNAL_SCHEMA}.settings SET value='two' WHERE key='bootstrap_probe'`);
    await client.query(`DELETE FROM ${JOURNAL_SCHEMA}.settings WHERE key='bootstrap_probe'`);

    const audit = await one(
      client,
      `INSERT INTO ${JOURNAL_SCHEMA}.admin_audit_logs (action) VALUES ('bootstrap.probe') RETURNING id`,
    );
    assert(audit?.id, "yaarlink_app could not insert an admin audit probe");
    await expectPermissionDenied(client, "UPDATE admin_audit_logs", () =>
      client.query(`UPDATE ${JOURNAL_SCHEMA}.admin_audit_logs SET outcome='failure' WHERE id=$1`, [audit.id]),
    );
    await expectPermissionDenied(client, "DELETE admin_audit_logs", () =>
      client.query(`DELETE FROM ${JOURNAL_SCHEMA}.admin_audit_logs WHERE id=$1`, [audit.id]),
    );

    const event = await one(
      client,
      `INSERT INTO ${JOURNAL_SCHEMA}.audit_events (actor_type, entity_type, entity_id, action)
       VALUES ('system','setting',gen_random_uuid(),'bootstrap.probe') RETURNING id`,
    );
    assert(event?.id, "yaarlink_app could not insert a domain audit probe");
    await client.query(`UPDATE ${JOURNAL_SCHEMA}.audit_events SET to_status='checked' WHERE id=$1`, [event.id]);
    await expectPermissionDenied(client, "DELETE audit_events", () =>
      client.query(`DELETE FROM ${JOURNAL_SCHEMA}.audit_events WHERE id=$1`, [event.id]),
    );

    await expectPermissionDenied(client, "CREATE in app_preview", () =>
      client.query(`CREATE TABLE ${JOURNAL_SCHEMA}.forbidden_probe (id int)`),
    );

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Build a SCRAM-SHA-256 verifier so the plaintext password is never sent to
 *  the server and never appears in a shell history or process list. */
function hashPassword(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  const b64 = (b) => b.toString("base64");
  return `SCRAM-SHA-256$${iterations}:${b64(salt)}$${b64(storedKey)}:${b64(serverKey)}`;
}

async function promptPassword() {
  assert(process.stdin.isTTY, "--set-password requires an interactive terminal.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ask = (q) =>
    new Promise((resolve) => {
      rl.question(q, (answer) => resolve(answer));
    });
  const first = await ask("New yaarlink_app password (input visible; use a generated value): ");
  const second = await ask("Repeat password: ");
  rl.close();
  assert(first.length >= 24, "Password must be at least 24 characters.");
  assert(first === second, "Passwords did not match.");
  return first;
}

const pool = new Pool({ connectionString, max: 1 });

try {
  const client = await pool.connect();
  let applied = [];
  let isolation;
  try {
    const safe = await assertTargetIsSafe(client);
    await ensureJournal(client);
    if (!verifyOnly) {
      applied = await applyMigrations(client);
    }
    await assertRoleAndGrants(client);
    await assertTablesRlsAndPolicies(client);
    isolation = await assertCrossSchemaIsolation(client);
    console.info(
      `Preview bootstrap verified: ${EXPECTED_TABLES.length} tables in ${JOURNAL_SCHEMA}, RLS enabled, policies checked, cross-schema isolation proven (server ${safe.serverVersion}).`,
    );
    console.info(
      `  migrations applied this run: ${applied.length === 0 ? "none" : applied.join(", ")}`,
    );
    if (isolation.publicUsage) {
      console.info(
        "  NOTE: yaarlink_app still resolves USAGE on public via the PUBLIC pseudo-role.",
      );
      console.info(
        `        That is PostgreSQL's default schema ACL and is NOT removed by revoking from the role. It is harmless here because public holds ${isolation.publicTableCount} table(s); the audit above proves no table privilege outside app_preview.`,
      );
      if (isolation.publicTableCount > 0) {
        console.info(
          "        WARNING: public is not empty. Review before authorizing this bootstrap.",
        );
      }
    } else {
      console.info("  yaarlink_app USAGE on public: false (PUBLIC grant already revoked).");
    }
  } finally {
    client.release();
  }

  if (setPassword) {
    const password = await promptPassword();
    const verifier = hashPassword(password);
    const admin = await pool.connect();
    try {
      await admin.query(`ALTER ROLE yaarlink_app LOGIN PASSWORD '${verifier.replace(/'/g, "''")}'`);
      console.info("  yaarlink_app LOGIN enabled with a SCRAM-SHA-256 verifier (never logged).");
    } finally {
      admin.release();
    }
  }

  if (verifyWrite) await assertAppRoleWrites(pool);
  if (verifyWrite) console.info("  transactional app-role write probes checked (writes rolled back)");
} finally {
  await pool.end();
}
