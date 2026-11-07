-- Local Docker only. The application bootstrap creates this role as NOLOGIN
-- when it does not already exist; pre-creating it here lets the disposable
-- local database use the same least-privilege runtime role as production.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    CREATE ROLE yaarlink_app
      LOGIN
      PASSWORD 'yaarlink_local_app'
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
