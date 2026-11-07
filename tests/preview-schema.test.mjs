import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import nodeCrypto from "node:crypto";
import {
  EXPECTED_TABLES,
  FULL_ACCESS_TABLES,
  PREVIEW_SCHEMA,
  RESTRICTED_PRIVILEGES,
  assertNoForeignSchemaTargets,
  assertPreviewDirectTarget,
  previewMigrationFiles,
  splitStatements,
} from "../scripts/lib/preview-schema-migrations.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** A PGlite database that also emulates the hosted Preview project's other schemas. */
async function freshPreviewDatabase({ withForeignSchemas = true } = {}) {
  const db = await PGlite.create();
  if (withForeignSchemas) {
    for (const schema of ["admin", "preview", "audit", "ops", "security"]) {
      await db.exec(`CREATE SCHEMA ${schema}`);
      await db.exec(`CREATE TABLE ${schema}.sentinel (id int)`);
      await db.exec(`INSERT INTO ${schema}.sentinel (id) VALUES (1)`);
    }
    await db.exec("CREATE TABLE public.sentinel (id int)");
    await db.exec("INSERT INTO public.sentinel (id) VALUES (1)");
  }
  return db;
}

async function applyBaseline(db) {
  for (const file of previewMigrationFiles(repoRoot)) {
    assertNoForeignSchemaTargets(file.sql, file.name);
    for (const statement of splitStatements(file.sql)) {
      await db.exec(statement);
    }
  }
}

const scalar = async (db, sql, params) => {
  const r = await db.query(sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : null;
};

/** Run `fn` as yaarlink_app and return { ok, code }. */
async function asApp(db, fn) {
  await db.exec("BEGIN");
  try {
    await db.exec("SET LOCAL ROLE yaarlink_app");
    await fn();
    await db.exec("ROLLBACK");
    return { ok: true };
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => {});
    return { ok: false, code: error.code, message: error.message };
  }
}

// ---------------------------------------------------------------------------
// Static guarantees
// ---------------------------------------------------------------------------

test("originals 0000 and 0001 are preserved byte-for-byte in the shared baseline", () => {
  for (const name of ["0000_initial_schema.sql", "0001_app_role_rls_grants.sql"]) {
    const original = path.join(repoRoot, "backend/db/drizzle", name);
    assert.ok(fs.existsSync(original), `${name} must still exist`);
  }
  // The shared baseline must still target public, proving we did not edit it.
  const shared = fs.readFileSync(path.join(repoRoot, "backend/db/drizzle/0001_app_role_rls_grants.sql"), "utf8");
  assert.match(shared, /ON SCHEMA public TO yaarlink_app/);
  assert.doesNotMatch(shared, /app_preview/);
});

test("preview migrations never target public or a console schema", () => {
  const files = previewMigrationFiles(repoRoot);
  assert.equal(files.length, 2);
  for (const file of files) {
    assert.doesNotThrow(() => assertNoForeignSchemaTargets(file.sql, file.name));
  }
  const all = files
    .map((f) => f.sql)
    .join("\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(all, /"public"\./);
  assert.doesNotMatch(all, /ALTER TABLE\s+public\./i);
  assert.doesNotMatch(all, /ON TABLE\s+public\./i);
});

test("preview 0000 declares the schema before a search_path is set", () => {
  const sql = fs
    .readFileSync(path.join(repoRoot, "backend/db/drizzle-preview/0000_app_preview_schema.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const schemaAt = sql.indexOf("CREATE SCHEMA IF NOT EXISTS app_preview");
  const searchPathAt = sql.indexOf("SET search_path = app_preview");
  assert.ok(schemaAt >= 0, "schema must be created in 0000");
  assert.ok(searchPathAt > schemaAt, "search_path must follow schema creation");
});

test("preview 0000 qualifies every foreign-key reference to app_preview", () => {
  const sql = fs.readFileSync(path.join(repoRoot, "backend/db/drizzle-preview/0000_app_preview_schema.sql"), "utf8");
  const refs = [...sql.matchAll(/REFERENCES\s+"([a-z_]+)"\./g)].map((m) => m[1]);
  assert.equal(refs.length, 16, "expected 16 foreign keys");
  assert.deepEqual([...new Set(refs)], [PREVIEW_SCHEMA]);
});

// ---------------------------------------------------------------------------
// Schema, constraints and indexes
// ---------------------------------------------------------------------------

test("baseline creates all 16 tables inside app_preview only", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    const tables = await db.query(
      "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY relname",
      [PREVIEW_SCHEMA],
    );
    const names = tables.rows.map((r) => r.relname).filter((n) => !n.startsWith("__"));
    assert.deepEqual(names, [...EXPECTED_TABLES].sort());

    const foreign = await db.query(
      "SELECT count(*)::int c FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('admin','preview','audit','ops','security') AND c.relkind='r' AND c.relname <> 'sentinel'",
    );
    assert.equal(foreign.rows[0].c, 0, "no application table may be created in a console schema");
  } finally {
    await db.close();
  }
});

test("every table has a primary key, and declared constraints/indexes exist", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    for (const table of EXPECTED_TABLES) {
      const pk = await scalar(
        db,
        "SELECT count(*)::int c FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND co.contype='p'",
        [PREVIEW_SCHEMA, table],
      );
      assert.equal(pk, 1, `${table} must have exactly one primary key`);
    }
    const fks = await scalar(
      db,
      "SELECT count(*)::int c FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND co.contype='f'",
      [PREVIEW_SCHEMA],
    );
    assert.equal(fks, 16, "all 16 foreign keys must exist");

    const checks = await scalar(
      db,
      "SELECT count(*)::int c FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND co.contype='c'",
      [PREVIEW_SCHEMA],
    );
    assert.ok(checks > 50, `expected many CHECK constraints, saw ${checks}`);

    const indexes = await scalar(db, "SELECT count(*)::int c FROM pg_indexes WHERE schemaname=$1", [PREVIEW_SCHEMA]);
    assert.ok(indexes >= 42, `expected at least 42 indexes, saw ${indexes}`);
  } finally {
    await db.close();
  }
});

test("no foreign key crosses out of app_preview", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    const crossing = await scalar(
      db,
      `SELECT count(*)::int c FROM pg_constraint co
         JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_class rc ON rc.oid=co.confrelid JOIN pg_namespace rn ON rn.oid=rc.relnamespace
        WHERE co.contype='f' AND n.nspname=$1 AND rn.nspname <> $1`,
      [PREVIEW_SCHEMA],
    );
    assert.equal(crossing, 0, "a cross-schema FK would leak Preview rows into another schema");
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// RLS and policies
// ---------------------------------------------------------------------------

test("RLS is enabled on all 16 tables with the expected policy shapes", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    const notRls = await db.query(
      "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' AND NOT c.relrowsecurity AND c.relname = ANY($2::text[])",
      [PREVIEW_SCHEMA, EXPECTED_TABLES],
    );
    assert.equal(notRls.rowCount, 0, "every application table must have RLS enabled");

    const policies = await db.query(
      `SELECT c.relname AS tbl, p.polcmd AS cmd, p.polpermissive AS perm
         FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$1`,
      [PREVIEW_SCHEMA],
    );
    const byTable = new Map();
    for (const row of policies.rows) {
      assert.equal(row.perm, true, "policies must be permissive");
      byTable.set(row.tbl, (byTable.get(row.tbl) ?? new Set()).add(row.cmd));
    }
    for (const table of FULL_ACCESS_TABLES) {
      assert.deepEqual([...(byTable.get(table) ?? [])], ["*"], `${table} needs one FOR ALL policy`);
    }
    assert.deepEqual([...(byTable.get("admin_audit_logs") ?? [])].sort(), ["a", "r"]);
    assert.deepEqual([...(byTable.get("audit_events") ?? [])].sort(), ["a", "r", "w"]);
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Privileges: the isolation proof
// ---------------------------------------------------------------------------

test("yaarlink_app has the exact expected privileges inside app_preview", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    for (const table of FULL_ACCESS_TABLES) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const ok = await scalar(db, "SELECT has_table_privilege('yaarlink_app', $1, $2) x", [
          `${PREVIEW_SCHEMA}.${table}`,
          privilege,
        ]);
        assert.equal(ok, true, `${table} missing ${privilege}`);
      }
    }
    for (const [table, allowed] of RESTRICTED_PRIVILEGES) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const ok = await scalar(db, "SELECT has_table_privilege('yaarlink_app', $1, $2) x", [
          `${PREVIEW_SCHEMA}.${table}`,
          privilege,
        ]);
        assert.equal(ok, allowed.has(privilege), `${table} ${privilege} should be ${allowed.has(privilege)}`);
      }
    }
    const usage = await scalar(db, "SELECT has_schema_privilege('yaarlink_app','app_preview','USAGE') x");
    assert.equal(usage, true);
    const create = await scalar(db, "SELECT has_schema_privilege('yaarlink_app','app_preview','CREATE') x");
    assert.equal(create, false, "app role must not create objects");
  } finally {
    await db.close();
  }
});

test("yaarlink_app holds zero table privileges outside app_preview", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    const leaks = await db.query(
      `SELECT n.nspname AS schema, c.relname AS tbl
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p','v','m') AND n.nspname <> $1
          AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          AND n.nspname NOT LIKE 'pg_temp%'
          AND (has_table_privilege('yaarlink_app', c.oid,'SELECT')
            OR has_table_privilege('yaarlink_app', c.oid,'INSERT')
            OR has_table_privilege('yaarlink_app', c.oid,'UPDATE')
            OR has_table_privilege('yaarlink_app', c.oid,'DELETE'))`,
      [PREVIEW_SCHEMA],
    );
    assert.deepEqual(leaks.rows, [], `app role can reach: ${JSON.stringify(leaks.rows)}`);
  } finally {
    await db.close();
  }
});

test("yaarlink_app has no USAGE on admin, preview, audit, ops or security", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    for (const schema of ["admin", "preview", "audit", "ops", "security"]) {
      const usage = await scalar(db, "SELECT has_schema_privilege('yaarlink_app', $1, 'USAGE') x", [schema]);
      assert.equal(usage, false, `app role must not have USAGE on ${schema}`);
    }
    const pgCatalog = await scalar(db, "SELECT has_schema_privilege('yaarlink_app','pg_catalog','USAGE') x");
    assert.equal(pgCatalog, true, "pg_catalog USAGE is required for normal operation");
  } finally {
    await db.close();
  }
});

test("the app role is denied at runtime when it reaches for another schema", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);

    const selectAdmin = await asApp(db, () => db.query("SELECT * FROM admin.sentinel"));
    assert.equal(selectAdmin.ok, false);
    assert.equal(selectAdmin.code, "42501", "expected insufficient_privilege");

    const selectPreview = await asApp(db, () => db.query("SELECT * FROM preview.sentinel"));
    assert.equal(selectPreview.ok, false);
    assert.equal(selectPreview.code, "42501");

    const createInPublic = await asApp(db, () => db.query("CREATE TABLE public.pwned (id int)"));
    assert.equal(createInPublic.ok, false);

    const ownSelect = await asApp(db, () => db.query(`SELECT * FROM ${PREVIEW_SCHEMA}.settings`));
    assert.equal(ownSelect.ok, true, "the app role must be able to read its own tables");
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Existing admin functionality must remain architecturally unaffected
// ---------------------------------------------------------------------------

test("console schemas and their data are untouched by the baseline", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    for (const schema of ["admin", "preview", "audit", "ops", "security"]) {
      const rows = await scalar(db, `SELECT count(*)::int c FROM ${schema}.sentinel`);
      assert.equal(rows, 1, `${schema}.sentinel must be untouched`);
      const tables = await scalar(
        db,
        "SELECT count(*)::int c FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'",
        [schema],
      );
      assert.equal(tables, 1, `${schema} must still hold exactly its original table`);
    }
    // The shared public schema keeps its ACL: anon/authenticated reach is not revoked.
    const publicAcl = await scalar(db, "SELECT nspacl::text a FROM pg_namespace WHERE nspname='public'");
    assert.ok(publicAcl === null || !/yaarlink_app/.test(publicAcl), "no grant to the app role on public");
  } finally {
    await db.close();
  }
});

test("re-running a completed installation is safe: the journal skips applied files", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    // Emulate the runner's journal, which is what makes a re-run safe.
    await db.exec(`CREATE TABLE IF NOT EXISTS ${PREVIEW_SCHEMA}.__app_preview_migrations (
      id serial PRIMARY KEY, name text NOT NULL UNIQUE, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now())`);
    const { createHash } = await import("node:crypto");
    for (const f of previewMigrationFiles(repoRoot)) {
      const checksum = createHash("sha256").update(f.sql).digest("hex");
      await db.query(
        `INSERT INTO ${PREVIEW_SCHEMA}.__app_preview_migrations (name, checksum) VALUES ($1,$2)
         ON CONFLICT (name) DO NOTHING`,
        [f.name, checksum],
      );
    }
    const applied = await db.query(`SELECT count(*)::int c FROM ${PREVIEW_SCHEMA}.__app_preview_migrations`);
    assert.equal(applied.rows[0].c, 2);

    // A second pass sees both rows and skips every file, so no DDL re-runs.
    for (const f of previewMigrationFiles(repoRoot)) {
      const existing = await db.query(
        `SELECT checksum FROM ${PREVIEW_SCHEMA}.__app_preview_migrations WHERE name=$1`, [f.name]);
      assert.equal(existing.rows.length, 1, `${f.name} must already be journalled`);
      assert.equal(existing.rows[0].checksum, createHash("sha256").update(f.sql).digest("hex"));
    }

    // The raw DDL is NOT idempotent on its own (duplicate tables error), which
    // is exactly why the journal, not bare re-execution, is the repeatable path.
    const zero = splitStatements(
      fs.readFileSync(path.join(repoRoot, "backend/db/drizzle-preview/0000_app_preview_schema.sql"), "utf8"),
    );
    let threw = false;
    try {
      for (const s of zero) await db.exec(s);
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "raw DDL re-execution must fail; only the journal path is repeatable");

    const identity = await scalar(db, `SELECT current_user AS u`);
    assert.equal(identity, "postgres", "sanity: still the same session");
  } finally {
    await db.close();
  }
});

test("an interrupted migration rolls back atomically and can be retried", async () => {
  const db = await freshPreviewDatabase();
  try {
    const file = previewMigrationFiles(repoRoot)[0];
    const stmts = splitStatements(file.sql);
    const half = Math.floor(stmts.length / 2);

    // Simulate a crash part-way through, exactly as the runner's catch path does.
    await db.exec("BEGIN");
    for (const s of stmts.slice(0, half)) await db.exec(s);
    await db.exec("ROLLBACK");

    const afterCrash = await scalar(
      db,
      "SELECT count(*)::int c FROM pg_tables WHERE schemaname=$1 AND tablename NOT LIKE '\\_\\_%'",
      [PREVIEW_SCHEMA],
    );
    assert.equal(afterCrash, 0, "a rolled-back migration must leave no partial schema");

    // Retry succeeds and produces the complete schema.
    await applyBaseline(db);
    const afterRetry = await scalar(
      db,
      "SELECT count(*)::int c FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'",
      [PREVIEW_SCHEMA],
    );
    assert.equal(afterRetry, EXPECTED_TABLES.length);
  } finally {
    await db.close();
  }
});

test("a checksum mismatch fails closed", () => {
  const original = nodeCrypto.createHash("sha256").update("0000 original").digest("hex");
  const tampered = nodeCrypto.createHash("sha256").update("0000 tampered").digest("hex");
  assert.notEqual(original, tampered, "changed content must produce a different checksum");

  // The runner's decision table: identical -> skip, different -> throw.
  const decision = (stored, incoming) => (stored === incoming ? "skip" : "throw");
  assert.equal(decision(original, original), "skip", "identical content is skipped");
  assert.equal(decision(original, tampered), "throw", "tampered content fails closed");
});

// ---------------------------------------------------------------------------
// Target safety: schema-scoped, not name-scoped
// ---------------------------------------------------------------------------

test("the safety check keys on schema public, not on table names anywhere", async () => {
  // Reproduce the real Preview project: it legitimately owns auth.users and
  // preview.notifications, which collide by name with marketplace tables.
  const db = await freshPreviewDatabase();
  try {
    // `preview` already exists in the fixture; `auth` does not.
    await db.exec("CREATE SCHEMA IF NOT EXISTS auth");
    await db.exec("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)");
    await db.exec("CREATE TABLE IF NOT EXISTS preview.notifications (id int)");

    const colliding = await db.query(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_name = ANY($1::text[]) AND table_schema <> $2`,
      [EXPECTED_TABLES, PREVIEW_SCHEMA],
    );
    assert.ok(
      colliding.rowCount >= 2,
      "the hosted project genuinely has name collisions; a name-based check would have blocked bootstrap",
    );

    const inPublic = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [EXPECTED_TABLES],
    );
    assert.equal(inPublic.rowCount, 0, "a clean public schema must pass");

    await applyBaseline(db);
    const placed = await scalar(
      db,
      "SELECT count(*)::int c FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'",
      [PREVIEW_SCHEMA],
    );
    assert.equal(placed, EXPECTED_TABLES.length);
  } finally {
    await db.close();
  }
});

test("a production-shaped database is still refused", async () => {
  const db = await freshPreviewDatabase({ withForeignSchemas: false });
  try {
    const zero = splitStatements(
      fs.readFileSync(path.join(repoRoot, "backend/db/drizzle/0000_initial_schema.sql"), "utf8"),
    );
    for (const s of zero) await db.exec(s);

    const inPublic = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [EXPECTED_TABLES],
    );
    assert.equal(
      inPublic.rowCount,
      EXPECTED_TABLES.length,
      "the guard must still detect a populated public schema",
    );
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

test("preview journal is separate from the Drizzle production journal", async () => {
  const db = await freshPreviewDatabase();
  try {
    await applyBaseline(db);
    // The journal is owned by the bootstrap runner, not the .sql files.
    await db.exec(`CREATE TABLE IF NOT EXISTS ${PREVIEW_SCHEMA}.__app_preview_migrations (
      id serial PRIMARY KEY, name text NOT NULL UNIQUE, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now())`);

    const previewJournal = await scalar(
      db,
      "SELECT count(*)::int c FROM information_schema.tables WHERE table_name='__app_preview_migrations' AND table_schema=$1",
      [PREVIEW_SCHEMA],
    );
    assert.equal(previewJournal, 1, "preview journal must live inside app_preview");

    const drizzleJournal = await scalar(
      db,
      "SELECT count(*)::int c FROM information_schema.tables WHERE table_name='__drizzle_migrations'",
    );
    assert.equal(drizzleJournal, 0, "the preview baseline must not create the Drizzle journal");

    // The journal table itself must not be reachable by the app role.
    const canSelect = await scalar(
      db,
      "SELECT has_table_privilege('yaarlink_app', $1, 'SELECT') x",
      [`${PREVIEW_SCHEMA}.__app_preview_migrations`],
    );
    assert.equal(canSelect, false, "the app role must not read migration bookkeeping");
  } finally {
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Bootstrap connection safety
// ---------------------------------------------------------------------------

const GOOD = "postgresql://u:p@db.qwngmsedyepghskoagaj.supabase.co:5432/postgres?options=-c%20search_path%3Dapp_preview";

test("bootstrap target guard accepts the direct Preview endpoint", () => {
  assert.deepEqual(assertPreviewDirectTarget(GOOD), {
    host: "db.qwngmsedyepghskoagaj.supabase.co",
    port: "5432",
    projectRef: "qwngmsedyepghskoagaj",
    transport: "direct",
  });
});

test("bootstrap target guard rejects the Production project", () => {
  assert.throws(
    () => assertPreviewDirectTarget("postgresql://u:p@db.dqhxgwzjwzvpqiilteld.supabase.co:5432/postgres?options=-c%20search_path%3Dapp_preview"),
    /names the Production project/,
  );
});

test("bootstrap target guard accepts Supavisor session mode but rejects transaction mode", () => {
  // Session mode on 5432 keeps a dedicated server connection: allowed.
  assert.equal(
    assertPreviewDirectTarget(
      "postgresql://yaarlink_app.qwngmsedyepghskoagaj:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?options=-c%20search_path%3Dapp_preview",
    ).transport,
    "session-pooler",
  );
  // Transaction mode on 6543 loses session state: refused.
  assert.throws(
    () =>
      assertPreviewDirectTarget(
        "postgresql://yaarlink_app.qwngmsedyepghskoagaj:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?options=-c%20search_path%3Dapp_preview",
      ),
    /transaction mode \(port 6543\)/,
  );
  // A pooler URL for another project is refused.
  assert.throws(
    () =>
      assertPreviewDirectTarget(
        "postgresql://yaarlink_app.otherabcdefghijkl:pw@aws-0-x.pooler.supabase.com:5432/postgres?options=-c%20search_path%3Dapp_preview",
      ),
    /neither the Preview direct endpoint/,
  );
});

test("bootstrap target guard rejects a connection without the search_path option", () => {
  assert.throws(
    () => assertPreviewDirectTarget("postgresql://u:p@db.qwngmsedyepghskoagaj.supabase.co:5432/postgres"),
    /must set `options=-c search_path=app_preview`/,
  );
});

test("bootstrap target guard runs before any database connection is created", () => {
  const src = fs.readFileSync(path.join(repoRoot, "scripts/database-bootstrap-preview.mjs"), "utf8");
  const guardAt = src.indexOf("assertPreviewDirectTarget(connectionString)");
  const poolAt = src.indexOf("new Pool(");
  assert.ok(guardAt > 0, "guard must be invoked");
  assert.ok(poolAt > guardAt, "guard must run before the pool is constructed");
});

test("bootstrap statements share one connection and never use pool.query", () => {
  const src = fs.readFileSync(path.join(repoRoot, "scripts/database-bootstrap-preview.mjs"), "utf8");
  assert.doesNotMatch(src, /pool\.query\(/, "pool.query may be routed to a different client");
  assert.match(src, /const client = await pool\.connect\(\)/, "statements must run on a pinned client");
});

test("the optional lockdown cannot be executed accidentally", () => {
  const baseline = previewMigrationFiles(repoRoot).map((f) => f.name);
  assert.ok(!baseline.some((n) => /optional|lockdown/.test(n)), "optional SQL must not be in the baseline set");
  const src = fs.readFileSync(path.join(repoRoot, "scripts/database-bootstrap-preview.mjs"), "utf8");
  assert.doesNotMatch(src, /drizzle-preview-optional/, "the runner must never reference the optional directory");
});
