import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const EXPECTED_TABLES = [
  "account_tokens",
  "admin_audit_logs",
  "applications",
  "audit_events",
  "auth_failure_lockouts",
  "brands",
  "campaigns",
  "contacts",
  "creators",
  "notifications",
  "pending_signups",
  "rate_limit_buckets",
  "reports",
  "settings",
  "user_sessions",
  "users",
];

const FULL_ACCESS_TABLES = EXPECTED_TABLES.filter(
  (table) => table !== "admin_audit_logs" && table !== "audit_events",
);

const verifyWrite = process.argv.includes("--verify-write");
const connectionString =
  process.env.BOOTSTRAP_DATABASE_URL || process.env.PROVISIONING_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Set BOOTSTRAP_DATABASE_URL or PROVISIONING_DATABASE_URL to an administrator connection for the target database. DATABASE_URL is intentionally not accepted for bootstrapping.",
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function one(client, query, params = []) {
  const result = await client.query(query, params);
  return result.rows[0] ?? null;
}

async function assertMigrationTargetIsSafe(client) {
  const version = await one(client, "SHOW server_version_num");
  assert(
    Number(version?.server_version_num ?? 0) >= 130000,
    "PostgreSQL 13 or newer is required so gen_random_uuid() is available without an extension.",
  );

  const tables = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [EXPECTED_TABLES],
  );

  const journal = await one(
    client,
    "SELECT to_regclass('drizzle.__drizzle_migrations') AS relation",
  );
  let appliedMigrations = 0;
  if (journal?.relation) {
    const count = await one(
      client,
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
    );
    appliedMigrations = count?.count ?? 0;
  }

  // Existing production predates the Drizzle journal. Refusing here prevents
  // the empty-database baseline from being mistaken for an upgrade migration.
  assert(
    tables.rowCount === 0 || appliedMigrations > 0,
    "Application tables already exist without a Drizzle migration journal. Refusing to apply the empty-database baseline; reconcile migration history with a reviewed upgrade plan instead.",
  );

  return { existingTables: tables.rowCount, appliedMigrations };
}

async function assertRoleAndGrants(client) {
  const role = await one(
    client,
    `SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls, rolconnlimit
       FROM pg_roles
      WHERE rolname = 'yaarlink_app'`,
  );
  assert(role, "yaarlink_app role was not created");
  assert(role.rolinherit === true, "yaarlink_app must have INHERIT");
  assert(role.rolsuper === false, "yaarlink_app must not be a superuser");
  assert(role.rolcreatedb === false, "yaarlink_app must not create databases");
  assert(role.rolcreaterole === false, "yaarlink_app must not create roles");
  assert(role.rolreplication === false, "yaarlink_app must not replicate");
  assert(role.rolbypassrls === false, "yaarlink_app must not bypass RLS");
  assert(Number(role.rolconnlimit) === -1, "yaarlink_app connection limit must be unrestricted");

  const schemaPrivileges = await one(
    client,
    `SELECT has_schema_privilege('yaarlink_app', 'public', 'USAGE') AS usage,
            has_schema_privilege('yaarlink_app', 'public', 'CREATE') AS create_table`,
  );
  assert(schemaPrivileges?.usage === true, "yaarlink_app needs USAGE on public");
  assert(schemaPrivileges?.create_table === false, "yaarlink_app must not create tables in public");

  for (const table of FULL_ACCESS_TABLES) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const row = await one(
        client,
        "SELECT has_table_privilege('yaarlink_app', $1::regclass, $2) AS allowed",
        [`public.${table}`, privilege],
      );
      assert(row?.allowed === true, `yaarlink_app is missing ${privilege} on ${table}`);
    }
  }

  const expectedRestrictedPrivileges = new Map([
    ["admin_audit_logs", new Set(["SELECT", "INSERT"])],
    ["audit_events", new Set(["SELECT", "INSERT", "UPDATE"])],
  ]);
  for (const [table, allowedPrivileges] of expectedRestrictedPrivileges) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const row = await one(
        client,
        "SELECT has_table_privilege('yaarlink_app', $1::regclass, $2) AS allowed",
        [`public.${table}`, privilege],
      );
      assert(
        row?.allowed === allowedPrivileges.has(privilege),
        `Unexpected ${privilege} privilege for yaarlink_app on ${table}`,
      );
    }
  }

  const publicGrants = await one(
    client,
    `SELECT count(*)::int AS count
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS acl
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND acl.grantee = 0`,
    [EXPECTED_TABLES],
  );
  assert(publicGrants?.count === 0, "Application tables must not grant access to PUBLIC");

  for (const dataApiRole of ["anon", "authenticated"]) {
    const grants = await one(
      client,
      `SELECT count(*)::int AS count
         FROM pg_class AS relation
         JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS acl
         JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY($1::text[])
          AND grantee.rolname = $2`,
      [EXPECTED_TABLES, dataApiRole],
    );
    assert(grants?.count === 0, `Application tables must not grant access to ${dataApiRole}`);
  }
}

async function assertTablesRlsAndPolicies(client) {
  const tables = await client.query(
    `SELECT relation.relname AS table_name, relation.relrowsecurity AS rls_enabled
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
        AND relation.relname = ANY($1::text[])
      ORDER BY relation.relname`,
    [EXPECTED_TABLES],
  );
  assert(tables.rowCount === EXPECTED_TABLES.length, "One or more application tables are missing");
  for (const table of tables.rows) {
    assert(table.rls_enabled === true, `RLS is not enabled on ${table.table_name}`);
  }

  const policies = await client.query(
    `SELECT relation.relname AS table_name, policy.polname AS policy_name,
            policy.polcmd AS command, policy.polpermissive AS permissive,
            EXISTS (
              SELECT 1
                FROM unnest(policy.polroles) AS role_oid
                JOIN pg_roles AS role ON role.oid = role_oid
               WHERE role.rolname = 'yaarlink_app'
            ) AS applies_to_app
       FROM pg_policy AS policy
       JOIN pg_class AS relation ON relation.oid = policy.polrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
      ORDER BY relation.relname, policy.polname`,
    [EXPECTED_TABLES],
  );

  const commandsByTable = new Map(EXPECTED_TABLES.map((table) => [table, new Set()]));
  for (const policy of policies.rows) {
    assert(policy.permissive === true, `Policy ${policy.policy_name} on ${policy.table_name} must be permissive`);
    assert(policy.applies_to_app === true, `Policy ${policy.policy_name} on ${policy.table_name} does not apply to yaarlink_app`);
    commandsByTable.get(policy.table_name)?.add(policy.command);
  }

  for (const table of FULL_ACCESS_TABLES) {
    assert(commandsByTable.get(table)?.has("*"), `Missing FOR ALL policy for yaarlink_app on ${table}`);
  }
  assert(
    commandsByTable.get("admin_audit_logs")?.size === 2 &&
      commandsByTable.get("admin_audit_logs")?.has("r") &&
      commandsByTable.get("admin_audit_logs")?.has("a"),
    "legacy audit table must have only SELECT and INSERT policies for yaarlink_app",
  );
  assert(
    commandsByTable.get("audit_events")?.size === 3 &&
      commandsByTable.get("audit_events")?.has("r") &&
      commandsByTable.get("audit_events")?.has("a") &&
      commandsByTable.get("audit_events")?.has("w"),
    "audit_events must have only SELECT, INSERT, and UPDATE policies for yaarlink_app",
  );
}

async function expectPermissionDenied(client, label, operation) {
  await client.query("SAVEPOINT expected_denial");
  try {
    await operation();
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT expected_denial");
    await client.query("RELEASE SAVEPOINT expected_denial");
    assert(error?.code === "42501", `${label} failed with ${error?.code ?? "an unknown error"}, not permission denied`);
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

    await client.query(
      "INSERT INTO public.settings (key, value) VALUES ('bootstrap_probe', 'one')",
    );
    const setting = await one(
      client,
      "SELECT value FROM public.settings WHERE key = 'bootstrap_probe'",
    );
    assert(setting?.value === "one", "yaarlink_app could not read its settings probe");
    await client.query(
      "UPDATE public.settings SET value = 'two' WHERE key = 'bootstrap_probe'",
    );
    await client.query("DELETE FROM public.settings WHERE key = 'bootstrap_probe'");

    const adminAudit = await one(
      client,
      "INSERT INTO public.admin_audit_logs (action) VALUES ('bootstrap.probe') RETURNING id",
    );
    assert(adminAudit?.id, "yaarlink_app could not insert an admin audit probe");
    await expectPermissionDenied(client, "UPDATE admin_audit_logs", () =>
      client.query("UPDATE public.admin_audit_logs SET outcome = 'failure' WHERE id = $1", [adminAudit.id]),
    );
    await expectPermissionDenied(client, "DELETE admin_audit_logs", () =>
      client.query("DELETE FROM public.admin_audit_logs WHERE id = $1", [adminAudit.id]),
    );


    const auditEvent = await one(
      client,
      `INSERT INTO public.audit_events (actor_type, entity_type, entity_id, action)
       VALUES ('system', 'setting', gen_random_uuid(), 'bootstrap.probe')
       RETURNING id`,
    );
    assert(auditEvent?.id, "yaarlink_app could not insert a domain audit probe");
    await client.query(
      "UPDATE public.audit_events SET to_status = 'checked' WHERE id = $1",
      [auditEvent.id],
    );
    await expectPermissionDenied(client, "DELETE audit_events", () =>
      client.query("DELETE FROM public.audit_events WHERE id = $1", [auditEvent.id]),
    );

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const pool = new Pool({ connectionString, max: 1 });

try {
  const client = await pool.connect();
  try {
    const before = await assertMigrationTargetIsSafe(client);
    console.info(
      `Database bootstrap preflight passed (${before.existingTables} existing application tables, ${before.appliedMigrations} journalled migrations).`,
    );
  } finally {
    client.release();
  }

  const db = drizzle(pool);
  const migrationsFolder = fileURLToPath(new URL("../backend/db/drizzle", import.meta.url));
  await migrate(db, { migrationsFolder });
  if (verifyWrite) {
    // A second invocation proves the journal, rather than one-off SQL replay,
    // is the repeatable path used by CI and operators.
    await migrate(db, { migrationsFolder });
  }

  const verifyClient = await pool.connect();
  try {
    await assertRoleAndGrants(verifyClient);
    await assertTablesRlsAndPolicies(verifyClient);
  } finally {
    verifyClient.release();
  }

  if (verifyWrite) await assertAppRoleWrites(pool);

  console.info(
    `Database bootstrap verified: ${EXPECTED_TABLES.length} tables, RLS enabled, app-role grants checked${verifyWrite ? ", transactional app-role writes checked" : ""}.`,
  );
  console.info(
    "If yaarlink_app was newly created, set its password and LOGIN attribute outside source control before using it as DATABASE_URL.",
  );
} finally {
  await pool.end();
}
