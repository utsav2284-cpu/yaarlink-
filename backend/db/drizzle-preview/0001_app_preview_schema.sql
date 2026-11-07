-- Preview-only runtime role, row-level security, and least-privilege grants.
--
-- DERIVED FROM: backend/db/drizzle/0001_app_role_rls_grants.sql
-- The original is preserved verbatim and is NEVER executed against app_preview.
-- Every table/schema qualifier below targets app_preview only.
--
-- PREVIEW BASELINE = two files:
--   0000_initial_schema.sql       shared, unqualified, reused verbatim
--   0001_app_preview_schema.sql   this file, app_preview-qualified
--
-- yaarlink_app is created NOLOGIN with no password. LOGIN and a password are
-- assigned out-of-band by scripts/database-bootstrap-preview.mjs --set-password
-- and are never stored in this repository.
--
-- CROSS-SCHEMA ISOLATION (stricter than the public-schema original):
-- The hosted Preview project also owns admin, preview, audit, ops, security
-- and a Supabase-managed auth/storage surface. PostgreSQL grants USAGE on
-- schema public to PUBLIC by default, so the app role is explicitly denied
-- rather than merely left ungranted.
-- ---------------------------------------------------------------------------

-- 1. Target schema.
CREATE SCHEMA IF NOT EXISTS app_preview;
--> statement-breakpoint
-- 2. Runtime role (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    CREATE ROLE yaarlink_app
      NOLOGIN
      INHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      CONNECTION LIMIT -1;
  END IF;
END
$$;
--> statement-breakpoint

-- 3. Cross-schema isolation. Runs after the role exists.
--
-- DELIBERATELY ZERO BLAST RADIUS: nothing below alters another schema's ACL.
-- The hosted Preview project's admin/preview/audit/ops/security schemas are
-- owned by postgres and grant USAGE to `authenticated` / service roles only -
-- none of them grants to PUBLIC. The application role is therefore isolated by
-- simply never being granted anything outside app_preview.
--
-- Residual, documented risk: PostgreSQL grants USAGE on schema public to the
-- PUBLIC pseudo-role by default, so yaarlink_app inherits USAGE on public and
-- a REVOKE aimed at yaarlink_app alone does not remove it. That is harmless
-- here because public holds no tables, and it is verified rather than assumed:
-- the bootstrap audit asserts the app role holds no table privilege anywhere
-- outside app_preview. An optional, separately-reviewed lockdown script
-- (0002_optional_public_lockdown.sql) removes the inherited grant if the owner
-- accepts the (verified-safe) change to the shared public schema.
DO $$
BEGIN
  -- Remove any direct grant (no-op today, idempotent, and keeps the intent
  -- explicit). This cannot affect anon/authenticated/service_role, which hold
  -- their own explicit grants on public independently of this role.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM yaarlink_app';
  END IF;

  -- The runtime role must never create objects in its own schema either.
  EXECUTE 'REVOKE CREATE ON SCHEMA app_preview FROM yaarlink_app';
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA app_preview TO yaarlink_app;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA app_preview FROM yaarlink_app;
--> statement-breakpoint

-- The application connects directly as yaarlink_app. Neither PostgreSQL's
-- PUBLIC pseudo-role nor Supabase Data API roles should inherit table access
-- merely because a new table was created in the public schema.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM yaarlink_app;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM yaarlink_app;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END
$$;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app_preview.account_tokens,
  app_preview.applications,
  app_preview.auth_failure_lockouts,
  app_preview.brands,
  app_preview.campaigns,
  app_preview.contacts,
  app_preview.creators,
  app_preview.notifications,
  app_preview.pending_signups,
  app_preview.rate_limit_buckets,
  app_preview.reports,
  app_preview.settings,
  app_preview.user_sessions,
  app_preview.users
TO yaarlink_app;
--> statement-breakpoint

-- Legacy audit history is append-only for the runtime role.
GRANT SELECT, INSERT ON TABLE app_preview.admin_audit_logs TO yaarlink_app;
--> statement-breakpoint

-- Domain audit history is append/read-only, apart from UPDATE needed by the
-- actor/owner foreign keys' ON DELETE SET NULL behavior. DELETE stays denied.
GRANT SELECT, INSERT, UPDATE ON TABLE app_preview.audit_events TO yaarlink_app;
--> statement-breakpoint

-- The current schema has no sequences. This keeps the baseline correct if the
-- schema snapshot is regenerated with a sequence-backed default.
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO yaarlink_app;
--> statement-breakpoint

ALTER TABLE app_preview.account_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.admin_audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.applications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.auth_failure_lockouts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.brands ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.campaigns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.creators ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.pending_signups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.user_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_preview.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  app_table text;
  audit_command text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'account_tokens',
    'applications',
    'auth_failure_lockouts',
    'brands',
    'campaigns',
    'contacts',
    'creators',
    'notifications',
    'pending_signups',
    'rate_limit_buckets',
    'reports',
    'settings',
    'user_sessions',
    'users'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS yaarlink_app_all ON app_preview.%I', app_table);
    EXECUTE format(
      'CREATE POLICY yaarlink_app_all ON app_preview.%I AS PERMISSIVE FOR ALL TO yaarlink_app USING (true) WITH CHECK (true)',
      app_table
    );
  END LOOP;

  FOREACH audit_command IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON app_preview.admin_audit_logs',
      'yaarlink_app_' || lower(audit_command)
    );
    EXECUTE format(
      'CREATE POLICY %I ON app_preview.admin_audit_logs AS PERMISSIVE FOR %s TO yaarlink_app %s',
      'yaarlink_app_' || lower(audit_command),
      audit_command,
      CASE audit_command
        WHEN 'SELECT' THEN 'USING (true)'
        WHEN 'INSERT' THEN 'WITH CHECK (true)'
        ELSE 'USING (true) WITH CHECK (true)'
      END
    );
  END LOOP;

  FOREACH audit_command IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON app_preview.audit_events',
      'yaarlink_app_' || lower(audit_command)
    );
    EXECUTE format(
      'CREATE POLICY %I ON app_preview.audit_events AS PERMISSIVE FOR %s TO yaarlink_app %s',
      'yaarlink_app_' || lower(audit_command),
      audit_command,
      CASE audit_command
        WHEN 'SELECT' THEN 'USING (true)'
        WHEN 'INSERT' THEN 'WITH CHECK (true)'
        ELSE 'USING (true) WITH CHECK (true)'
      END
    );
  END LOOP;
END
$$;
