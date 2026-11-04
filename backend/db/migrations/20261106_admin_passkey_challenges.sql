-- Administrator Passkey (WebAuthn) ceremony state.
--
-- Apply after 20261104_admin_identity_foundation.sql and
-- 20261105_admin_mfa_session_state.sql, before deploying matching Phase 2B
-- Passkey code. This additive, transactional upgrade widens the WebAuthn
-- signature counter to bigint and adds one-time challenge rows. Only a SHA-256
-- hash of each browser-visible challenge is stored.
--
-- PRODUCTION GATE: verify backup/PITR and test on staging/disposable data
-- before any production application. This file has not been applied to
-- production as part of local Phase 2B development.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_passkeys'
      AND column_name = 'counter'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE public.admin_passkeys ALTER COLUMN counter TYPE bigint;
  END IF;
END
$$;

-- Repair any pre-release staging database that received the original
-- {1,512}/{1,8192} regex checks. PostgreSQL caps regex repetition at 255 and
-- would otherwise reject the first real Passkey insert at runtime.
ALTER TABLE public.admin_passkeys
  DROP CONSTRAINT IF EXISTS admin_passkeys_credential_id_check;
ALTER TABLE public.admin_passkeys
  ADD CONSTRAINT admin_passkeys_credential_id_check
  CHECK (char_length(credential_id) BETWEEN 1 AND 512 AND credential_id ~ '^[A-Za-z0-9_-]+$');
ALTER TABLE public.admin_passkeys
  DROP CONSTRAINT IF EXISTS admin_passkeys_public_key_check;
ALTER TABLE public.admin_passkeys
  ADD CONSTRAINT admin_passkeys_public_key_check
  CHECK (char_length(public_key) BETWEEN 1 AND 8192 AND public_key ~ '^[A-Za-z0-9_-]+$');

CREATE TABLE IF NOT EXISTS public.admin_webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  admin_user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  purpose text NOT NULL,
  challenge_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  revoked_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT admin_webauthn_challenges_challenge_hash_unique UNIQUE (challenge_hash),
  CONSTRAINT admin_webauthn_challenges_purpose_check
    CHECK (purpose IN ('passkey_registration', 'passkey_authentication')),
  CONSTRAINT admin_webauthn_challenges_hash_check
    CHECK (challenge_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_webauthn_challenges_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT admin_webauthn_challenges_terminal_check
    CHECK (
      (used_at IS NULL OR used_at >= created_at)
      AND (revoked_at IS NULL OR revoked_at >= created_at)
      AND NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL)
    )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_webauthn_challenges_admin_user_id_admin_users_id_fk'
      AND conrelid = 'public.admin_webauthn_challenges'::regclass
  ) THEN
    ALTER TABLE public.admin_webauthn_challenges
      ADD CONSTRAINT admin_webauthn_challenges_admin_user_id_admin_users_id_fk
      FOREIGN KEY (admin_user_id) REFERENCES public.admin_users (id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_webauthn_challenges_session_id_admin_sessions_id_fk'
      AND conrelid = 'public.admin_webauthn_challenges'::regclass
  ) THEN
    ALTER TABLE public.admin_webauthn_challenges
      ADD CONSTRAINT admin_webauthn_challenges_session_id_admin_sessions_id_fk
      FOREIGN KEY (session_id) REFERENCES public.admin_sessions (id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS admin_webauthn_challenges_admin_purpose_created_idx
  ON public.admin_webauthn_challenges USING btree (admin_user_id, session_id, purpose, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS admin_webauthn_challenges_expires_at_idx
  ON public.admin_webauthn_challenges USING btree (expires_at);

ALTER TABLE public.admin_webauthn_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_webauthn_challenges FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_webauthn_challenges FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_webauthn_challenges FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_webauthn_challenges TO yaarlink_app';
    DROP POLICY IF EXISTS yaarlink_app_all ON public.admin_webauthn_challenges;
    CREATE POLICY yaarlink_app_all ON public.admin_webauthn_challenges
      AS PERMISSIVE FOR ALL TO yaarlink_app USING (true) WITH CHECK (true);
  END IF;
END
$$;

COMMIT;
