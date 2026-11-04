-- Administrator MFA session state.
--
-- Apply after 20261104_admin_identity_foundation.sql and before deploying the
-- matching Phase 2B code. This additive, transactional change records whether
-- an individual administrator browser session has completed MFA. Existing
-- rows remain null and therefore fail closed as MFA-pending.
--
-- PRODUCTION GATE: verify backup/PITR and test on staging/disposable data
-- before any production application. This file has not been applied to
-- production as part of local Phase 2B development.

BEGIN;

ALTER TABLE admin_sessions
  ADD COLUMN IF NOT EXISTS mfa_verified_at timestamp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_sessions_mfa_verified_check'
      AND conrelid = 'admin_sessions'::regclass
  ) THEN
    ALTER TABLE admin_sessions
      ADD CONSTRAINT admin_sessions_mfa_verified_check
      CHECK (mfa_verified_at IS NULL OR mfa_verified_at >= created_at);
  END IF;
END
$$;

COMMIT;
