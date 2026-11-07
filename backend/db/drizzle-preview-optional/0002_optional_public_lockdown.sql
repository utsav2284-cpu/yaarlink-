-- OPTIONAL, SEPARATELY AUTHORIZED Preview hardening. NOT part of the baseline.
--
-- Purpose: remove the PostgreSQL default grant of USAGE on schema public to
-- the PUBLIC pseudo-role for this database, so yaarlink_app does not inherit
-- USAGE on public at all.
--
-- Why it is optional:
--   * public holds no application tables in the Preview project, so inherited
--     USAGE confers no reachable data. The baseline already denies the app role
--     every table privilege outside app_preview.
--   * public IS shared: anon, authenticated and service_role hold their own
--     explicit grants and are unaffected. But the schema ACL is a shared
--     object, and pg_database_owner/CREATE semantics on PostgreSQL 15+ must be
--     re-verified on the target before running this.
--
-- Verify, then run by hand if desired:
--   SELECT nspacl FROM pg_namespace WHERE nspname = 'public';
--   SELECT has_table_privilege('yaarlink_app', c.oid, 'SELECT')
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r';
--
-- Expected after running: has_schema_privilege('yaarlink_app','public','USAGE')
-- is false, and every Supabase Data API role still works.

REVOKE ALL ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO pg_database_owner;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO anon;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO service_role;
