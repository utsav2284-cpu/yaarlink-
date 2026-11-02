-- Empty-database runtime role, row-level security, and least-privilege grants.
--
-- This migration is part of the new-database Drizzle baseline. It must be run
-- by a database owner/administrator through the migration/bootstrap path; it
-- is not a production backfill and must not be replayed blindly against the
-- existing production database.
--
-- A newly created yaarlink_app role is deliberately NOLOGIN and has no
-- password in source control. After bootstrapping a new database, an operator
-- must set its password and LOGIN attribute through the hosting provider or a
-- local administrator session. An existing role's LOGIN/password state is not
-- changed here.

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

-- Enforce the non-login parts of the runtime-role security model without
-- changing an operator-managed password or an existing role's LOGIN state.
-- Hosted database owners are not always true superusers, and PostgreSQL
-- requires superuser rights to alter SUPERUSER/REPLICATION/BYPASSRLS even when
-- asserting the negative form. Only issue that ALTER when an existing role is
-- actually unsafe; fail clearly instead of silently accepting it.
DO $$
DECLARE
  app_role record;
  current_role_is_superuser boolean;
BEGIN
  SELECT rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
         rolbypassrls, rolconnlimit
    INTO app_role
    FROM pg_roles
   WHERE rolname = 'yaarlink_app';

  SELECT rolsuper
    INTO current_role_is_superuser
    FROM pg_roles
   WHERE rolname = current_user;

  IF app_role.rolsuper OR app_role.rolreplication OR app_role.rolbypassrls THEN
    IF NOT COALESCE(current_role_is_superuser, false) THEN
      RAISE EXCEPTION 'yaarlink_app has SUPERUSER, REPLICATION, or BYPASSRLS and must be corrected by a superuser before bootstrap';
    END IF;
    ALTER ROLE yaarlink_app NOSUPERUSER NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT app_role.rolinherit
     OR app_role.rolcreatedb
     OR app_role.rolcreaterole
     OR app_role.rolconnlimit <> -1 THEN
    ALTER ROLE yaarlink_app
      INHERIT
      NOCREATEDB
      NOCREATEROLE
      CONNECTION LIMIT -1;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO yaarlink_app;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM yaarlink_app;
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
  public.account_tokens,
  public.applications,
  public.auth_failure_lockouts,
  public.brands,
  public.campaigns,
  public.contacts,
  public.creators,
  public.notifications,
  public.pending_signups,
  public.rate_limit_buckets,
  public.reports,
  public.settings,
  public.user_sessions,
  public.users
TO yaarlink_app;
--> statement-breakpoint

-- Admin audit history is append-only for the runtime role.
GRANT SELECT, INSERT ON TABLE public.admin_audit_logs TO yaarlink_app;
--> statement-breakpoint

-- Domain audit history is append/read-only, apart from UPDATE needed by the
-- actor/owner foreign keys' ON DELETE SET NULL behavior. DELETE stays denied.
GRANT SELECT, INSERT, UPDATE ON TABLE public.audit_events TO yaarlink_app;
--> statement-breakpoint

-- The current schema has no sequences. This keeps the baseline correct if the
-- schema snapshot is regenerated with a sequence-backed default.
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO yaarlink_app;
--> statement-breakpoint

ALTER TABLE public.account_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.auth_failure_lockouts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
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
    EXECUTE format('DROP POLICY IF EXISTS yaarlink_app_all ON public.%I', app_table);
    EXECUTE format(
      'CREATE POLICY yaarlink_app_all ON public.%I AS PERMISSIVE FOR ALL TO yaarlink_app USING (true) WITH CHECK (true)',
      app_table
    );
  END LOOP;

  FOREACH audit_command IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.admin_audit_logs',
      'yaarlink_app_' || lower(audit_command)
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.admin_audit_logs AS PERMISSIVE FOR %s TO yaarlink_app %s',
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
      'DROP POLICY IF EXISTS %I ON public.audit_events',
      'yaarlink_app_' || lower(audit_command)
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.audit_events AS PERMISSIVE FOR %s TO yaarlink_app %s',
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
