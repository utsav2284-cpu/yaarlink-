-- Administrator identity foundation for YaarLink.
--
-- PRODUCTION GATE: do not apply this file until a current hosted backup or
-- point-in-time recovery path has been verified and this migration has passed
-- against a disposable/staging PostgreSQL database. It is additive: it does
-- not alter marketplace rows, public user passwords, or the existing legacy
-- owner login. It also deliberately creates no administrator account and no
-- default password. The first owner is created later through the restricted
-- one-time setup-token flow.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  password_hash text,
  role text NOT NULL,
  status text DEFAULT 'invited' NOT NULL,
  email_verified_at timestamp,
  password_changed_at timestamp,
  last_login_at timestamp,
  token_version integer DEFAULT 0 NOT NULL,
  created_by_admin_id uuid,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT admin_users_email_unique UNIQUE (email),
  CONSTRAINT admin_users_role_check
    CHECK (role IN ('super_admin', 'admin', 'operations_manager', 'verification_manager', 'support_manager', 'finance_manager', 'content_manager', 'analyst')),
  CONSTRAINT admin_users_status_check
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  CONSTRAINT admin_users_email_canonical_check
    CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT admin_users_name_check
    CHECK (name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT admin_users_activation_check
    CHECK ((status = 'invited' AND password_hash IS NULL) OR (status <> 'invited' AND password_hash IS NOT NULL AND name IS NOT NULL AND email_verified_at IS NOT NULL)),
  CONSTRAINT admin_users_token_version_check
    CHECK (token_version >= 0)
);

CREATE TABLE IF NOT EXISTS admin_auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  admin_user_id uuid NOT NULL,
  purpose text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  revoked_at timestamp,
  email_send_count integer DEFAULT 0 NOT NULL,
  last_email_attempt_at timestamp DEFAULT now() NOT NULL,
  last_email_sent_at timestamp,
  created_by_admin_id uuid,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT admin_auth_tokens_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT admin_auth_tokens_purpose_check
    CHECK (purpose IN ('owner_setup', 'admin_invitation', 'password_reset')),
  CONSTRAINT admin_auth_tokens_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_auth_tokens_email_send_count_check
    CHECK (email_send_count BETWEEN 0 AND 5),
  CONSTRAINT admin_auth_tokens_expires_after_creation_check
    CHECK (expires_at > created_at),
  CONSTRAINT admin_auth_tokens_used_check
    CHECK (used_at IS NULL OR used_at >= created_at),
  CONSTRAINT admin_auth_tokens_revoked_check
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  admin_user_id uuid NOT NULL,
  token_version integer NOT NULL,
  user_agent text,
  ip_address text,
  created_at timestamp DEFAULT now() NOT NULL,
  last_seen_at timestamp DEFAULT now() NOT NULL,
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  CONSTRAINT admin_sessions_token_version_check CHECK (token_version >= 0),
  CONSTRAINT admin_sessions_user_agent_check CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  CONSTRAINT admin_sessions_ip_address_check CHECK (ip_address IS NULL OR char_length(ip_address) <= 120),
  CONSTRAINT admin_sessions_expires_after_creation_check CHECK (expires_at > created_at),
  CONSTRAINT admin_sessions_last_seen_check CHECK (last_seen_at >= created_at),
  CONSTRAINT admin_sessions_revoked_check CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE IF NOT EXISTS admin_totp_credentials (
  admin_user_id uuid PRIMARY KEY NOT NULL,
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  verified_at timestamp,
  last_counter integer DEFAULT -1 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT admin_totp_credentials_ciphertext_check CHECK (char_length(secret_ciphertext) BETWEEN 1 AND 1000),
  CONSTRAINT admin_totp_credentials_iv_check CHECK (secret_iv ~ '^[A-Za-z0-9_-]{1,64}$'),
  CONSTRAINT admin_totp_credentials_counter_check CHECK (last_counter >= -1),
  CONSTRAINT admin_totp_credentials_verified_check CHECK (verified_at IS NULL OR verified_at >= created_at)
);

CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  admin_user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT admin_recovery_codes_code_hash_unique UNIQUE (code_hash),
  CONSTRAINT admin_recovery_codes_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_recovery_codes_used_check CHECK (used_at IS NULL OR used_at >= created_at)
);

CREATE TABLE IF NOT EXISTS admin_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  admin_user_id uuid NOT NULL,
  credential_id text NOT NULL,
  public_key text NOT NULL,
  counter integer DEFAULT 0 NOT NULL,
  transports jsonb DEFAULT '[]'::jsonb NOT NULL,
  device_name text,
  created_at timestamp DEFAULT now() NOT NULL,
  last_used_at timestamp,
  CONSTRAINT admin_passkeys_credential_id_unique UNIQUE (credential_id),
  CONSTRAINT admin_passkeys_credential_id_check CHECK (char_length(credential_id) BETWEEN 1 AND 512 AND credential_id ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT admin_passkeys_public_key_check CHECK (char_length(public_key) BETWEEN 1 AND 8192 AND public_key ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT admin_passkeys_counter_check CHECK (counter >= 0),
  CONSTRAINT admin_passkeys_transports_check CHECK (jsonb_typeof(transports) = 'array' AND pg_column_size(transports) <= 1024),
  CONSTRAINT admin_passkeys_device_name_check CHECK (device_name IS NULL OR char_length(device_name) <= 120),
  CONSTRAINT admin_passkeys_last_used_check CHECK (last_used_at IS NULL OR last_used_at >= created_at)
);

CREATE TABLE IF NOT EXISTS admin_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  admin_user_id uuid,
  actor_admin_id uuid,
  event_type text NOT NULL,
  outcome text DEFAULT 'success' NOT NULL,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT admin_security_events_type_check CHECK (char_length(event_type) BETWEEN 1 AND 100),
  CONSTRAINT admin_security_events_outcome_check CHECK (outcome IN ('success', 'failure')),
  CONSTRAINT admin_security_events_ip_address_check CHECK (ip_address IS NULL OR char_length(ip_address) <= 120),
  CONSTRAINT admin_security_events_user_agent_check CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  CONSTRAINT admin_security_events_metadata_check CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 4096)
);

ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS actor_admin_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_created_by_admin_id_admin_users_id_fk' AND conrelid = 'admin_users'::regclass) THEN
    ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_created_by_admin_id_admin_users_id_fk
      FOREIGN KEY (created_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_auth_tokens_admin_user_id_admin_users_id_fk' AND conrelid = 'admin_auth_tokens'::regclass) THEN
    ALTER TABLE admin_auth_tokens
      ADD CONSTRAINT admin_auth_tokens_admin_user_id_admin_users_id_fk
      FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_auth_tokens_created_by_admin_id_admin_users_id_fk' AND conrelid = 'admin_auth_tokens'::regclass) THEN
    ALTER TABLE admin_auth_tokens
      ADD CONSTRAINT admin_auth_tokens_created_by_admin_id_admin_users_id_fk
      FOREIGN KEY (created_by_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_sessions_admin_user_id_admin_users_id_fk' AND conrelid = 'admin_sessions'::regclass) THEN
    ALTER TABLE admin_sessions
      ADD CONSTRAINT admin_sessions_admin_user_id_admin_users_id_fk
      FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_totp_credentials_admin_user_id_admin_users_id_fk' AND conrelid = 'admin_totp_credentials'::regclass) THEN
    ALTER TABLE admin_totp_credentials
      ADD CONSTRAINT admin_totp_credentials_admin_user_id_admin_users_id_fk
      FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_recovery_codes_admin_user_id_admin_users_id_fk' AND conrelid = 'admin_recovery_codes'::regclass) THEN
    ALTER TABLE admin_recovery_codes
      ADD CONSTRAINT admin_recovery_codes_admin_user_id_admin_users_id_fk
      FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_passkeys_admin_user_id_admin_users_id_fk' AND conrelid = 'admin_passkeys'::regclass) THEN
    ALTER TABLE admin_passkeys
      ADD CONSTRAINT admin_passkeys_admin_user_id_admin_users_id_fk
      FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_lower_key ON admin_users USING btree (lower(email));
CREATE INDEX IF NOT EXISTS admin_users_role_status_idx ON admin_users USING btree (role, status);
CREATE INDEX IF NOT EXISTS admin_users_created_at_idx ON admin_users USING btree (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_auth_tokens_admin_purpose_idx ON admin_auth_tokens USING btree (admin_user_id, purpose, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_auth_tokens_expires_at_idx ON admin_auth_tokens USING btree (expires_at);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_last_seen_idx ON admin_sessions USING btree (admin_user_id, last_seen_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_active_idx ON admin_sessions USING btree (admin_user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions USING btree (expires_at);
CREATE INDEX IF NOT EXISTS admin_recovery_codes_admin_unused_idx ON admin_recovery_codes USING btree (admin_user_id, used_at, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_passkeys_admin_created_idx ON admin_passkeys USING btree (admin_user_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_security_events_admin_created_idx ON admin_security_events USING btree (admin_user_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_security_events_actor_created_idx ON admin_security_events USING btree (actor_admin_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_security_events_type_created_idx ON admin_security_events USING btree (event_type, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_security_events_created_idx ON admin_security_events USING btree (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_created_at_idx ON admin_audit_logs USING btree (actor_admin_id, created_at DESC NULLS LAST);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_totp_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_security_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE admin_users, admin_auth_tokens, admin_sessions, admin_totp_credentials, admin_recovery_codes, admin_passkeys, admin_security_events FROM PUBLIC;

DO $$
DECLARE
  app_table text;
  audit_command text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE admin_users, admin_auth_tokens, admin_sessions, admin_totp_credentials, admin_recovery_codes, admin_passkeys, admin_security_events FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE admin_users, admin_auth_tokens, admin_sessions, admin_totp_credentials, admin_recovery_codes, admin_passkeys, admin_security_events FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_users, admin_auth_tokens, admin_sessions, admin_totp_credentials, admin_recovery_codes, admin_passkeys TO yaarlink_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE admin_security_events FROM yaarlink_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE admin_security_events TO yaarlink_app';

    FOREACH app_table IN ARRAY ARRAY[
      'admin_users',
      'admin_auth_tokens',
      'admin_sessions',
      'admin_totp_credentials',
      'admin_recovery_codes',
      'admin_passkeys'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS yaarlink_app_all ON public.%I', app_table);
      EXECUTE format(
        'CREATE POLICY yaarlink_app_all ON public.%I AS PERMISSIVE FOR ALL TO yaarlink_app USING (true) WITH CHECK (true)',
        app_table
      );
    END LOOP;

    FOREACH audit_command IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.admin_security_events',
        'yaarlink_app_' || lower(audit_command)
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.admin_security_events AS PERMISSIVE FOR %s TO yaarlink_app %s',
        'yaarlink_app_' || lower(audit_command),
        audit_command,
        CASE audit_command
          WHEN 'SELECT' THEN 'USING (true)'
          ELSE 'WITH CHECK (true)'
        END
      );
    END LOOP;
  END IF;
END
$$;

COMMIT;
