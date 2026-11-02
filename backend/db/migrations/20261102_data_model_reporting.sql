-- Data-model and reporting migration for YaarLink.
--
-- Apply this reviewed SQL to the pre-change PostgreSQL schema after taking a
-- backup and before deploying the matching application code. The script is
-- transactional. It deliberately does not fabricate historical application
-- snapshots or historical audit entries: legacy applications retain the
-- notification-based history fallback and have no submitted-profile snapshot.
--
-- Legacy conventions used below:
-- * `users` is the canonical account-contact record; `brands` mirrors it.
-- * An equal creator/campaign contact is inferred to be account-sourced,
--   while a different value is preserved as an intentional local contact.
-- * A completed legacy creator's listed date is approximated from its review
--   time, falling back to its existing update/creation times. Incomplete
--   signup placeholders remain unlisted.
-- * A legacy campaign receives the configured default lifetime from its
--   creation time, so already-stale pending/open/paused campaigns close as
--   expired instead of receiving a fresh public lifetime.

BEGIN;

-- ---------------------------------------------------------------------------
-- Platform campaign-expiry settings
-- ---------------------------------------------------------------------------

INSERT INTO settings (key, value)
VALUES
  ('campaign_default_expiry_days', '45'),
  ('campaign_max_expiry_days', '180')
ON CONFLICT (key) DO NOTHING;

UPDATE settings
SET value = '45', updated_at = now()
WHERE key = 'campaign_default_expiry_days'
  AND CASE
        WHEN value ~ '^[0-9]+$' THEN value::integer NOT BETWEEN 7 AND 90
        ELSE true
      END;

UPDATE settings
SET value = '180', updated_at = now()
WHERE key = 'campaign_max_expiry_days'
  AND CASE
        WHEN value ~ '^[0-9]+$' THEN value::integer NOT BETWEEN 7 AND 365
        ELSE true
      END;

UPDATE settings AS max_setting
SET value = default_setting.value, updated_at = now()
FROM settings AS default_setting
WHERE max_setting.key = 'campaign_max_expiry_days'
  AND default_setting.key = 'campaign_default_expiry_days'
  AND max_setting.value::integer < default_setting.value::integer;

-- ---------------------------------------------------------------------------
-- Domain audit events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  actor_type text NOT NULL,
  actor_user_id uuid,
  owner_user_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  changed_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT audit_events_actor_type_check
    CHECK (actor_type IN ('user', 'admin', 'system')),
  CONSTRAINT audit_events_entity_type_check
    CHECK (entity_type IN ('user', 'brand', 'creator_profile', 'campaign', 'application', 'report', 'contact', 'setting')),
  CONSTRAINT audit_events_action_check
    CHECK (char_length(action) BETWEEN 1 AND 100),
  CONSTRAINT audit_events_from_status_check
    CHECK (from_status IS NULL OR char_length(from_status) <= 40),
  CONSTRAINT audit_events_to_status_check
    CHECK (to_status IS NULL OR char_length(to_status) <= 40),
  CONSTRAINT audit_events_changed_fields_check
    CHECK (jsonb_typeof(changed_fields) = 'array' AND pg_column_size(changed_fields) <= 4096),
  CONSTRAINT audit_events_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 4096)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_events_actor_user_id_users_id_fk'
      AND conrelid = 'audit_events'::regclass
  ) THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_actor_user_id_users_id_fk
      FOREIGN KEY (actor_user_id) REFERENCES users (id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_events_owner_user_id_users_id_fk'
      AND conrelid = 'audit_events'::regclass
  ) THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES users (id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS audit_events_entity_created_idx
  ON audit_events USING btree (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON audit_events USING btree (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx
  ON audit_events USING btree (actor_user_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS audit_events_owner_created_idx
  ON audit_events USING btree (owner_user_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS audit_events_action_created_idx
  ON audit_events USING btree (action, created_at DESC NULLS LAST);

-- Supabase production keeps RLS enabled on every public application table.
-- The Data API roles receive broad default table grants in that project, so
-- leaving this new table on PostgreSQL's RLS-disabled default would expose
-- reporting history outside the application. Enable RLS unconditionally;
-- role-specific grants/policies are conditional so this reviewed file still
-- runs on a plain PostgreSQL database that has none of Supabase's roles.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE audit_events FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE audit_events FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE audit_events FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    -- The runtime role inserts and reads reporting history. UPDATE is also
    -- required for the actor/owner foreign keys' ON DELETE SET NULL action
    -- when an account is deleted; DELETE remains unavailable to the app.
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE audit_events TO yaarlink_app';
    DROP POLICY IF EXISTS yaarlink_app_audit_events_all ON audit_events;
    EXECUTE 'CREATE POLICY yaarlink_app_audit_events_all ON audit_events FOR ALL TO yaarlink_app USING (true) WITH CHECK (true)';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Missing updated_at columns
-- ---------------------------------------------------------------------------
-- Add each column nullable first and backfill from the best historical time
-- already on the row. Using migration time for every legacy row would make
-- old records falsely appear freshly edited.

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp;
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE users
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS updated_at timestamp;
UPDATE brands SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE brands
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at timestamp;
UPDATE notifications
SET updated_at = GREATEST(created_at, COALESCE(read_at, created_at))
WHERE updated_at IS NULL;
ALTER TABLE notifications
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at timestamp;
UPDATE contacts SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE contacts
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at timestamp;
UPDATE reports
SET updated_at = GREATEST(created_at, COALESCE(resolved_at, created_at))
WHERE updated_at IS NULL;
ALTER TABLE reports
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Brand contacts are a mirror of canonical account contacts, not a second
-- independently edited identity. Repair drift now; the application keeps
-- them synchronized after deployment.
UPDATE brands AS brand
SET email = account.email,
    phone = account.phone,
    updated_at = now()
FROM users AS account
WHERE brand.user_id = account.id
  AND (brand.email IS DISTINCT FROM account.email
       OR brand.phone IS DISTINCT FROM account.phone);

-- ---------------------------------------------------------------------------
-- Creator contact sources and effective listing date
-- ---------------------------------------------------------------------------

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS email_source text,
  ADD COLUMN IF NOT EXISTS phone_source text,
  ADD COLUMN IF NOT EXISTS listed_at timestamp;

UPDATE creators AS creator
SET email = CASE
      WHEN creator.status = 'incomplete' THEN account.email
      WHEN creator.email IS NOT NULL
           AND lower(btrim(creator.email)) = lower(btrim(account.email)) THEN account.email
      ELSE creator.email
    END,
    email_source = CASE
      WHEN creator.status = 'incomplete' THEN 'account'
      WHEN creator.email IS NOT NULL
           AND lower(btrim(creator.email)) = lower(btrim(account.email)) THEN 'account'
      ELSE 'profile'
    END,
    phone = CASE
      WHEN creator.status = 'incomplete' THEN account.phone
      ELSE creator.phone
    END,
    phone_source = CASE
      WHEN creator.status = 'incomplete' AND account.phone IS NOT NULL THEN 'account'
      WHEN creator.status <> 'incomplete'
           AND creator.phone IS NOT NULL
           AND account.phone IS NOT NULL
           AND creator.phone = account.phone THEN 'account'
      ELSE 'profile'
    END,
    listed_at = CASE
      WHEN creator.status = 'incomplete' THEN NULL
      ELSE COALESCE(
        creator.listed_at,
        GREATEST(
          creator.created_at,
          COALESCE(creator.reviewed_at, creator.updated_at, creator.created_at)
        )
      )
    END
FROM users AS account
WHERE creator.user_id = account.id;

ALTER TABLE creators
  ALTER COLUMN email_source SET DEFAULT 'profile',
  ALTER COLUMN email_source SET NOT NULL,
  ALTER COLUMN phone_source SET DEFAULT 'profile',
  ALTER COLUMN phone_source SET NOT NULL;

ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_email_source_check;
ALTER TABLE creators
  ADD CONSTRAINT creators_email_source_check
  CHECK (email_source IN ('account', 'profile'));

ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_phone_source_check;
ALTER TABLE creators
  ADD CONSTRAINT creators_phone_source_check
  CHECK (phone_source IN ('account', 'profile'));

CREATE INDEX IF NOT EXISTS creators_public_listed_idx
  ON creators USING btree (status, verification_status, listed_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- Campaign brand link, contact sources, deadlines, and expiry
-- ---------------------------------------------------------------------------

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS email_source text,
  ADD COLUMN IF NOT EXISTS phone_source text,
  ADD COLUMN IF NOT EXISTS deadline_at timestamp,
  ADD COLUMN IF NOT EXISTS expires_at timestamp,
  ADD COLUMN IF NOT EXISTS expired_at timestamp;

-- Create the one-to-one brand row for any legacy campaign owner who started
-- in another workspace and therefore has no brand record yet. The earliest
-- campaign supplies the primary business name; contacts are canonical.
WITH first_campaign AS (
  SELECT DISTINCT ON (owner_id)
    owner_id,
    business_name,
    created_at
  FROM campaigns
  ORDER BY owner_id, created_at ASC, id ASC
)
INSERT INTO brands (user_id, name, email, phone, status, created_at, updated_at)
SELECT
  first_campaign.owner_id,
  first_campaign.business_name,
  account.email,
  account.phone,
  'active',
  first_campaign.created_at,
  now()
FROM first_campaign
JOIN users AS account ON account.id = first_campaign.owner_id
ON CONFLICT (user_id) DO NOTHING;

UPDATE campaigns AS campaign
SET brand_id = brand.id
FROM brands AS brand
WHERE brand.user_id = campaign.owner_id
  AND campaign.brand_id IS DISTINCT FROM brand.id;

UPDATE campaigns AS campaign
SET email = CASE
      WHEN campaign.email IS NOT NULL
           AND lower(btrim(campaign.email)) = lower(btrim(account.email)) THEN account.email
      ELSE campaign.email
    END,
    email_source = CASE
      WHEN campaign.email IS NULL THEN 'account'
      WHEN lower(btrim(campaign.email)) = lower(btrim(account.email)) THEN 'account'
      ELSE 'campaign'
    END,
    phone_source = CASE
      WHEN campaign.phone IS NOT NULL
           AND account.phone IS NOT NULL
           AND campaign.phone = account.phone THEN 'account'
      ELSE 'campaign'
    END
FROM users AS account
WHERE campaign.owner_id = account.id;

UPDATE campaigns
SET expires_at = created_at + (
  (SELECT value::integer FROM settings WHERE key = 'campaign_default_expiry_days')
  * interval '1 day'
)
WHERE expires_at IS NULL;

ALTER TABLE campaigns
  ALTER COLUMN email_source SET DEFAULT 'campaign',
  ALTER COLUMN email_source SET NOT NULL,
  ALTER COLUMN phone_source SET DEFAULT 'campaign',
  ALTER COLUMN phone_source SET NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT now() + interval '45 days',
  ALTER COLUMN expires_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaigns_brand_id_brands_id_fk'
      AND conrelid = 'campaigns'::regclass
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_brand_id_brands_id_fk
      FOREIGN KEY (brand_id) REFERENCES brands (id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_email_source_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_email_source_check
  CHECK (email_source IN ('account', 'campaign'));

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_phone_source_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_phone_source_check
  CHECK (phone_source IN ('account', 'campaign'));

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_expiry_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_expiry_check
  CHECK (
    expires_at > created_at
    AND (deadline_at IS NULL OR deadline_at = expires_at)
    AND (expired_at IS NULL OR expired_at >= expires_at)
  );

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('pending', 'open', 'paused', 'rejected', 'suspended', 'closed', 'expired'));

CREATE INDEX IF NOT EXISTS campaigns_public_expiry_idx
  ON campaigns USING btree (status, verification_status, expires_at);
CREATE INDEX IF NOT EXISTS campaigns_status_expires_idx
  ON campaigns USING btree (status, expires_at);
CREATE INDEX IF NOT EXISTS campaigns_brand_created_idx
  ON campaigns USING btree (brand_id, created_at DESC NULLS LAST);

-- Capture each pre-migration status before materializing expiry so the new
-- reporting stream starts with an accurate system transition for every
-- campaign this migration closes.
CREATE TEMPORARY TABLE migration_expired_campaigns ON COMMIT DROP AS
SELECT id, owner_id, status AS from_status
FROM campaigns
WHERE status IN ('pending', 'open', 'paused')
  AND expires_at <= now();

UPDATE campaigns AS campaign
SET status = 'expired',
    expired_at = now(),
    updated_at = now()
FROM migration_expired_campaigns AS expired
WHERE campaign.id = expired.id;

INSERT INTO audit_events (
  actor_type,
  actor_user_id,
  owner_user_id,
  entity_type,
  entity_id,
  action,
  from_status,
  to_status,
  changed_fields,
  metadata,
  created_at
)
SELECT
  'system',
  NULL,
  expired.owner_id,
  'campaign',
  expired.id,
  'campaign.expired',
  expired.from_status,
  'expired',
  '["expiredAt", "status"]'::jsonb,
  '{"migrationBackfilled": true}'::jsonb,
  now()
FROM migration_expired_campaigns AS expired;

-- ---------------------------------------------------------------------------
-- Application commercial proposal and submitted-profile snapshot
-- ---------------------------------------------------------------------------

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS quote_amount integer,
  ADD COLUMN IF NOT EXISTS proposed_timeline_days integer,
  ADD COLUMN IF NOT EXISTS proposed_timeline text,
  ADD COLUMN IF NOT EXISTS creator_profile_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_captured_at timestamp;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_quote_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_quote_check
  CHECK (quote_amount IS NULL OR quote_amount BETWEEN 1 AND 10000000);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_timeline_days_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_timeline_days_check
  CHECK (proposed_timeline_days IS NULL OR proposed_timeline_days BETWEEN 1 AND 365);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_timeline_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_timeline_check
  CHECK (proposed_timeline IS NULL OR char_length(proposed_timeline) BETWEEN 1 AND 300);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_snapshot_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_snapshot_check
  CHECK (
    (creator_profile_snapshot IS NULL AND snapshot_captured_at IS NULL)
    OR (
      creator_profile_snapshot IS NOT NULL
      AND jsonb_typeof(creator_profile_snapshot) = 'object'
      AND snapshot_captured_at IS NOT NULL
    )
  );

COMMIT;

-- Suggested post-migration verification (read-only):
--   SELECT key, value FROM settings WHERE key LIKE 'campaign_%_expiry_days';
--   SELECT status, count(*) FROM campaigns GROUP BY status ORDER BY status;
--   SELECT count(*) FROM campaigns WHERE expires_at IS NULL;
--   SELECT count(*) FROM creators WHERE status <> 'incomplete' AND listed_at IS NULL;
--   SELECT count(*) FROM audit_events WHERE action = 'campaign.expired';
