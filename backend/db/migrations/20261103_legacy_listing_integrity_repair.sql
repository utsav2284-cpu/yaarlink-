-- Legacy listing integrity repair for YaarLink.
--
-- Apply this reviewed SQL only to an existing pre-constraint database, after
-- satisfying the verified-backup gate in docs/BACKUP_AND_RECOVERY.md and
-- before deploying application code that assumes the repaired invariants.
-- The script is transactional and idempotent on the current schema.
--
-- It repairs two historical data shapes found by audit:
-- * creator platform values stored as display labels/translation keys such
--   as `cr.both` instead of the canonical IDs used by shared/constants.ts;
-- * applications whose live creator-profile link (`creator_id`) is NULL even
--   though the applicant still has the one-to-one creator profile row.
--
-- It deliberately does not delete, suspend, or otherwise moderate
-- test-looking listings. Public visibility is a moderation decision: review
-- the read-only queries at the end, then use Admin -> Campaigns/Creators ->
-- Suspend/Reject/Delete for rows the owner confirms are test/spam data.

BEGIN;

-- ---------------------------------------------------------------------------
-- Canonical creator platform values
-- ---------------------------------------------------------------------------

WITH normalized AS (
  SELECT
    id,
    CASE lower(regexp_replace(btrim(platform), '\s+', ' ', 'g'))
      WHEN 'instagram' THEN 'Instagram'
      WHEN 'youtube' THEN 'YouTube'
      WHEN 'both' THEN 'Both'
      WHEN 'both instagram & youtube' THEN 'Both'
      WHEN 'instagram & youtube' THEN 'Both'
      WHEN 'instagram and youtube' THEN 'Both'
      WHEN 'cr.both' THEN 'Both'
      WHEN 'instagram और youtube दोनों' THEN 'Both'
      WHEN 'दोनों' THEN 'Both'
      WHEN 'instagram ਅਤੇ youtube ਦੋਵੇਂ' THEN 'Both'
      WHEN 'ਦੋਵੇਂ' THEN 'Both'
      WHEN 'other' THEN 'Other'
      WHEN 'other platform' THEN 'Other'
      WHEN 'cr.otherplat' THEN 'Other'
      WHEN 'कोई और प्लेटफॉर्म' THEN 'Other'
      WHEN 'अन्य प्लेटफॉर्म' THEN 'Other'
      WHEN 'ਹੋਰ ਪਲੇਟਫਾਰਮ' THEN 'Other'
      ELSE NULL
    END AS platform
  FROM creators
)
UPDATE creators AS creator
SET platform = normalized.platform,
    updated_at = now()
FROM normalized
WHERE creator.id = normalized.id
  AND normalized.platform IS NOT NULL
  AND creator.platform IS DISTINCT FROM normalized.platform;

-- Application snapshots are stored data as well; do not leave the same legacy
-- display value embedded in JSON after the live profile row is repaired.
WITH normalized AS (
  SELECT
    id,
    CASE lower(regexp_replace(btrim(creator_profile_snapshot->>'platform'), '\s+', ' ', 'g'))
      WHEN 'instagram' THEN 'Instagram'
      WHEN 'youtube' THEN 'YouTube'
      WHEN 'both' THEN 'Both'
      WHEN 'both instagram & youtube' THEN 'Both'
      WHEN 'instagram & youtube' THEN 'Both'
      WHEN 'instagram and youtube' THEN 'Both'
      WHEN 'cr.both' THEN 'Both'
      WHEN 'instagram और youtube दोनों' THEN 'Both'
      WHEN 'दोनों' THEN 'Both'
      WHEN 'instagram ਅਤੇ youtube ਦੋਵੇਂ' THEN 'Both'
      WHEN 'ਦੋਵੇਂ' THEN 'Both'
      WHEN 'other' THEN 'Other'
      WHEN 'other platform' THEN 'Other'
      WHEN 'cr.otherplat' THEN 'Other'
      WHEN 'कोई और प्लेटफॉर्म' THEN 'Other'
      WHEN 'अन्य प्लेटफॉर्म' THEN 'Other'
      WHEN 'ਹੋਰ ਪਲੇਟਫਾਰਮ' THEN 'Other'
      ELSE NULL
    END AS platform
  FROM applications
  WHERE jsonb_typeof(creator_profile_snapshot) = 'object'
    AND creator_profile_snapshot ? 'platform'
)
UPDATE applications AS application
SET creator_profile_snapshot = jsonb_set(
      application.creator_profile_snapshot,
      '{platform}',
      to_jsonb(normalized.platform),
      false
    ),
    updated_at = now()
FROM normalized
WHERE application.id = normalized.id
  AND normalized.platform IS NOT NULL
  AND application.creator_profile_snapshot->>'platform' IS DISTINCT FROM normalized.platform;

-- ---------------------------------------------------------------------------
-- Restore the live application -> creator-profile link where it is provable
-- ---------------------------------------------------------------------------

-- First choice: the snapshot captured at submission time, but only when that
-- profile still exists and belongs to the same applicant account.
UPDATE applications AS application
SET creator_id = creator.id,
    updated_at = now()
FROM creators AS creator
WHERE application.creator_id IS NULL
  AND jsonb_typeof(application.creator_profile_snapshot) = 'object'
  AND application.creator_profile_snapshot->>'creatorId'
      ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND creator.id = (application.creator_profile_snapshot->>'creatorId')::uuid
  AND creator.user_id = application.user_id;

-- Second choice: the applicant's sole one-to-one creator profile. Do not
-- guess when a legacy database somehow contains multiple profiles for one
-- account; the preflight below will stop and report those rows for review.
WITH sole_creator AS (
  SELECT user_id, min(id::text)::uuid AS creator_id
  FROM creators
  GROUP BY user_id
  HAVING count(*) = 1
)
UPDATE applications AS application
SET creator_id = sole_creator.creator_id,
    updated_at = now()
FROM sole_creator
WHERE application.creator_id IS NULL
  AND sole_creator.user_id = application.user_id;

-- Stop before adding/validating constraints if any row still cannot prove
-- the invariants. Rolling back is safer than deleting an application or
-- inventing a creator link.
DO $$
DECLARE
  bad_platform_count bigint;
  null_creator_count bigint;
  orphan_creator_count bigint;
  mismatched_creator_count bigint;
BEGIN
  SELECT count(*) INTO bad_platform_count
  FROM creators
  WHERE platform NOT IN ('Instagram', 'YouTube', 'Both', 'Other');
  IF bad_platform_count > 0 THEN
    RAISE EXCEPTION 'legacy listing repair stopped: % creator rows still have a non-canonical platform', bad_platform_count;
  END IF;

  SELECT count(*) INTO null_creator_count
  FROM applications
  WHERE creator_id IS NULL;
  IF null_creator_count > 0 THEN
    RAISE EXCEPTION 'legacy listing repair stopped: % applications still have creator_id IS NULL', null_creator_count;
  END IF;

  SELECT count(*) INTO orphan_creator_count
  FROM applications AS application
  LEFT JOIN creators AS creator ON creator.id = application.creator_id
  WHERE creator.id IS NULL;
  IF orphan_creator_count > 0 THEN
    RAISE EXCEPTION 'legacy listing repair stopped: % applications reference a missing creator profile', orphan_creator_count;
  END IF;

  SELECT count(*) INTO mismatched_creator_count
  FROM applications AS application
  JOIN creators AS creator ON creator.id = application.creator_id
  WHERE creator.user_id <> application.user_id;
  IF mismatched_creator_count > 0 THEN
    RAISE EXCEPTION 'legacy listing repair stopped: % applications reference a creator profile owned by another user', mismatched_creator_count;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Enforce the repaired invariants on databases that predate them
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  platform_constraint_validated boolean;
BEGIN
  SELECT convalidated INTO platform_constraint_validated
  FROM pg_constraint
  WHERE conrelid = 'public.creators'::regclass
    AND conname = 'creators_platform_check';

  IF NOT FOUND THEN
    ALTER TABLE creators
      ADD CONSTRAINT creators_platform_check
      CHECK (platform IN ('Instagram', 'YouTube', 'Both', 'Other'));
  ELSIF NOT platform_constraint_validated THEN
    ALTER TABLE creators VALIDATE CONSTRAINT creators_platform_check;
  END IF;
END
$$;

ALTER TABLE applications
  ALTER COLUMN creator_id SET NOT NULL;

-- The composite foreign key below needs a unique index on the referenced
-- pair. In the current schema this is the creators_id_user_id_key constraint;
-- creating the same-named index is a no-op there.
CREATE UNIQUE INDEX IF NOT EXISTS creators_id_user_id_key
  ON creators (id, user_id);

DO $$
DECLARE
  creator_fk_delete_action "char";
  creator_fk_validated boolean;
BEGIN
  SELECT confdeltype, convalidated
    INTO creator_fk_delete_action, creator_fk_validated
  FROM pg_constraint
  WHERE conrelid = 'public.applications'::regclass
    AND conname = 'applications_creator_id_fkey';

  IF NOT FOUND THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES creators (id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  ELSIF creator_fk_delete_action <> 'c' THEN
    ALTER TABLE applications DROP CONSTRAINT applications_creator_id_fkey;
    ALTER TABLE applications
      ADD CONSTRAINT applications_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES creators (id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  ELSIF NOT creator_fk_validated THEN
    ALTER TABLE applications VALIDATE CONSTRAINT applications_creator_id_fkey;
  END IF;
END
$$;

DO $$
DECLARE
  creator_user_fk_delete_action "char";
  creator_user_fk_validated boolean;
BEGIN
  SELECT confdeltype, convalidated
    INTO creator_user_fk_delete_action, creator_user_fk_validated
  FROM pg_constraint
  WHERE conrelid = 'public.applications'::regclass
    AND conname = 'applications_creator_user_fkey';

  IF NOT FOUND THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_creator_user_fkey
      FOREIGN KEY (creator_id, user_id) REFERENCES creators (id, user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  ELSIF creator_user_fk_delete_action <> 'c' THEN
    ALTER TABLE applications DROP CONSTRAINT applications_creator_user_fkey;
    ALTER TABLE applications
      ADD CONSTRAINT applications_creator_user_fkey
      FOREIGN KEY (creator_id, user_id) REFERENCES creators (id, user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  ELSIF NOT creator_user_fk_validated THEN
    ALTER TABLE applications VALIDATE CONSTRAINT applications_creator_user_fkey;
  END IF;
END
$$;

COMMIT;

-- Suggested post-migration verification (read-only):
--   SELECT count(*) FROM creators
--   WHERE platform NOT IN ('Instagram', 'YouTube', 'Both', 'Other');
--   SELECT count(*) FROM applications WHERE creator_id IS NULL;
--   SELECT conname, convalidated, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid IN ('public.creators'::regclass, 'public.applications'::regclass)
--     AND conname IN (
--       'creators_platform_check',
--       'applications_creator_id_fkey',
--       'applications_creator_user_fkey'
--     );
--
-- Suggested owner review for public test-looking content (read-only; then use
-- the Admin UI rather than deleting rows in this migration):
--   SELECT id, name, status, verification_status, platform, listed_at, created_at
--   FROM creators
--   WHERE status = 'approved' AND verification_status = 'verified'
--   ORDER BY created_at;
--   SELECT id, business_name, title, status, verification_status, expires_at, created_at
--   FROM campaigns
--   WHERE status = 'open' AND verification_status = 'verified' AND expires_at > now()
--   ORDER BY created_at;
