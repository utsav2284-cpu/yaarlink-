import fs from "node:fs";
import path from "node:path";

/**
 * Preview-schema migration set.
 *
 * The shared, production-baseline migrations in backend/db/drizzle describe an
 * application whose tables live in `public`. The hosted Admin Preview project
 * already owns `public`, `admin`, `preview`, `audit`, `ops` and `security`, so
 * the application is given its own `app_preview` schema instead.
 *
 * This module is the single source of truth for that separate baseline. The
 * originals are never modified and never executed against app_preview.
 */

export const PREVIEW_SCHEMA = "app_preview";
export const PREVIEW_MIGRATIONS_DIR = "backend/db/drizzle-preview";

/** Schemas that exist in the hosted Preview project and must stay untouched. */
export const FOREIGN_SCHEMAS = [
  "admin",
  "preview",
  "audit",
  "ops",
  "security",
  "auth",
  "storage",
  "realtime",
  "vault",
  "extensions",
];

export const EXPECTED_TABLES = [
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

export const FULL_ACCESS_TABLES = EXPECTED_TABLES.filter(
  (t) => t !== "admin_audit_logs" && t !== "audit_events",
);

export const RESTRICTED_PRIVILEGES = new Map([
  ["admin_audit_logs", new Set(["SELECT", "INSERT"])],
  ["audit_events", new Set(["SELECT", "INSERT", "UPDATE"])],
]);

/** Ordered migration files for the Preview baseline. */
export function previewMigrationFiles(repoRoot = process.cwd()) {
  const dir = path.join(repoRoot, PREVIEW_MIGRATIONS_DIR);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), "utf8") }));
}

/** Split a Drizzle migration into executable statements. */
export function splitStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Static guard: the Preview baseline must never write to, grant on, or create
 * inside a foreign schema (public or any console schema). `"public".` is the
 * failure mode this whole design exists to prevent, so it is a hard error.
 *
 * The single permitted exception is a statement whose ONLY effect on a foreign
 * schema is to revoke from yaarlink_app itself - that reduces reach for our own
 * new role and cannot change any existing role's access.
 */
export function assertNoForeignSchemaTargets(sql, fileName) {
  const offenders = [];

  for (const rawLine of sql.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("--")) continue;

    const appOnlyRevoke =
      /^EXECUTE\s+'REVOKE\s+ALL\s+ON\s+SCHEMA\s+(public|[a-z_]+)\s+FROM\s+yaarlink_app';$/i.test(line) ||
      /^REVOKE\s+ALL\s+ON\s+SCHEMA\s+(public|[a-z_]+)\s+FROM\s+yaarlink_app\s*;?$/i.test(line);
    if (appOnlyRevoke) continue;

    for (const schema of ["public", ...FOREIGN_SCHEMAS]) {
      const patterns = [
        new RegExp(`"${schema}"\\s*\\.`, "g"),
        new RegExp(
          `(?:ON\\s+TABLE|ON\\s+SCHEMA|ALTER\\s+TABLE|CREATE\\s+TABLE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+${schema}(?![\\w])`,
          "gi",
        ),
      ];
      for (const re of patterns) {
        for (const m of line.matchAll(re)) offenders.push(`${fileName}: ${line.slice(0, 90)}`);
      }
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `Preview migration touches a foreign schema:\n${offenders.slice(0, 10).join("\n")}`,
    );
  }
}
