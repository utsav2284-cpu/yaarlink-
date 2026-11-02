# YaarLink database backup and recovery runbook

This runbook covers the production Supabase project **Yaarlink**
(`dqhxgwzjwzvpqiilteld`, `ap-northeast-2`, PostgreSQL 17). It is an owner-only
operations document: backup files contain production personal data and must be
treated with the same care as production credentials.

## Current verification status — action required

On 2026-11-02, the available Supabase connector verified that the project and
its database/pooler services were `ACTIVE_HEALTHY` and listed the applied
migrations through `20261102144648_revoke_audit_events_delete_from_app`.

A read-only PostgreSQL check at `2026-11-02T15:39:53Z` also found:

- `archive_mode=on` with Supabase's `admin-mgr wal-push` archive command;
- `archive_timeout=2min` and `wal_level=logical`;
- 233 WAL files archived and 0 archive failures since the statistics reset on
  `2026-10-31T05:11:41Z`;
- the last successfully archived WAL file at `2026-11-02T15:08:58Z`.

That is evidence that WAL archiving has been operating; partial/current WAL is
only archived after a WAL switch, and WAL files alone do **not** prove that a
scheduled base/physical backup exists, what its retention is, whether PITR is
purchased, or whether a restore succeeds.

The connector and readable PostgreSQL catalogs do **not** expose the
organization plan, scheduled-backup list, backup retention, physical-backup
status, PITR status, latest recovery point, or restore history. Therefore:

- automated hosted backups are **not verified**;
- retention is **not verified**;
- PITR is **not verified**;
- a hosted-backup restore has **not** been rehearsed; and
- a successful migration, healthy service status, or WAL archiving must never
  be treated as evidence that a usable hosted backup exists.

The owner must complete one of the owner-authenticated checks below and record
the result in the release evidence for the next schema change. Never paste a
Supabase access token or database connection string into chat, Git, a pull
request, or a recorded terminal transcript.

## Exact Supabase dashboard check

Use an account with organization owner/admin and billing visibility:

1. Open the scheduled-backup page:
   <https://supabase.com/dashboard/project/dqhxgwzjwzvpqiilteld/database/backups/scheduled>
2. Record, without copying any credentials:
   - whether physical/daily backups are shown;
   - newest backup timestamp and status;
   - oldest available backup and effective retention;
   - whether a logical backup can be downloaded.
3. Open **Database → Backups → Point in Time**:
   <https://supabase.com/dashboard/project/dqhxgwzjwzvpqiilteld/database/backups/pitr>
4. Record whether PITR is enabled and, if so, its earliest/latest recovery
   points and retention period.
5. Open the organization billing/subscription page and record the current plan
   plus any compute/PITR add-ons.
6. Add only those non-secret facts and timestamps to the deployment record.

### Owner-authenticated CLI/API alternative

Supabase CLI 3.0.0 includes a physical-backup list command. On the owner's own
machine—not in a shared transcript—authenticate locally and run:

```bash
supabase backups list --remote=dqhxgwzjwzvpqiilteld
```

If a scoped access token is used, Supabase CLI documents the required
`backups_read` scope; `projects_read` and main-branch read access may also be
required. The equivalent Management API endpoint is:

```text
GET https://api.supabase.com/v1/projects/dqhxgwzjwzvpqiilteld/database/backups
```

Record only these non-secret response facts:

- `walg_enabled` and `pitr_enabled`;
- each backup's status, insertion time, and whether it is physical;
- `earliest_physical_backup_date_unix` and
  `latest_physical_backup_date_unix`, converted to UTC;
- the resulting effective retention window.

Do not call the PITR restore endpoint or `supabase backups restore` against
production as a test. A production restore rehearsal must restore to a new,
isolated project; an in-place PITR restore is disaster recovery only.

Supabase's documentation says daily backups are automatic for Pro, Team, and
Enterprise projects, with 7, 14, and up to 30 days respectively; free projects
should export logical dumps and keep them off-site. PITR is a paid add-on, uses
second-level recovery granularity, requires at least a Small compute add-on,
and replaces daily backups when enabled. If PITR is desired, enable it from
**Database → Backups → Point in Time** and complete any add-on purchase the
dashboard requests under the project/organization add-ons. Do not buy or enable
it merely to pass a checklist without an explicit RPO/cost decision.

Official references:

- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/reference/api/v1-list-all-backups>
- <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- <https://supabase.com/docs/guides/platform/clone-project>

## Backup rule before every production schema change

No production DDL may run until one of these is true and recorded:

1. A successful scheduled/PITR recovery point exists at or after the approved
   recovery-point objective (RPO) for that release; **or**
2. A fresh manual logical backup has been created, checksummed, stored outside
   Supabase and outside Git, and passed at least a restore-list/smoke check.

For a high-risk migration, do both. Also record aggregate-only pre-migration
checks (table counts and status counts), never dumps or customer rows in a pull
request, issue, chat, or log.

### Manual logical backup

Use the owner-controlled Direct connection, or Session pooler on an IPv4-only
network, with verified TLS. Keep the connection string in a password manager
or a shell variable set outside recorded output; never place it in a command
transcript or repository.

Following Supabase's CLI procedure, create all three files in an encrypted,
owner-only directory outside the repository:

```bash
umask 077
mkdir -p /secure/path/yaarlink-backup-YYYYMMDD-HHMMSS
cd /secure/path/yaarlink-backup-YYYYMMDD-HHMMSS

supabase db dump --remote="$PROVISIONING_DATABASE_URL" -f roles.sql --role-only
supabase db dump --remote="$PROVISIONING_DATABASE_URL" -f schema.sql
supabase db dump --remote="$PROVISIONING_DATABASE_URL" -f data.sql \
  --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

sha256sum roles.sql schema.sql data.sql > SHA256SUMS
```

Then:

1. Confirm all commands exited successfully and the files are non-empty.
2. Verify `sha256sum --check SHA256SUMS` after copying them to encrypted
   off-site storage.
3. Record only filename, timestamp, sizes, checksum status, project ref, and
   the last applied migration in the release record.
4. Test the backup into an isolated PostgreSQL/Supabase project—never over
   production—before relying on this procedure for a risky migration.
5. Apply an owner-defined retention/deletion date so old production-data
   copies do not accumulate indefinitely.

Supabase `db dump` currently requires the Supabase CLI and Docker. A
`pg_dump --format=custom` file plus `pg_restore --list` is an acceptable
alternative only when the operator has rehearsed its restore; role passwords,
extensions, grants, RLS policies, and the custom `yaarlink_app` role need
special attention either way.

## Restore rehearsal

A backup is not considered verified until a restore has been rehearsed.

Preferred rehearsal paths, in order:

1. **Restore to a new project** from **Database → Backups → Restore to a New
   Project**, when the plan/physical-backup feature is available. This leaves
   production untouched and creates an independent database copy.
2. **Logical restore** into a newly created disposable Supabase project or a
   local isolated PostgreSQL 17 instance using Supabase's roles/schema/data
   order.

On 2026-11-02, the logical procedure was rehearsed with synthetic disposable
data only: a compressed `pg_dump --format=custom` archive was created from an
isolated local copy of the current application schema, its SHA-256 checksum
was verified, `pg_restore --list` read all 119 archive entries, and
`pg_restore --exit-on-error` restored it into a separate empty database. The
restored users, brands, creators, campaigns, applications, settings, and
audit-event counts matched the source exactly, as did the sampled campaign and
application identifiers/content. The rebuilt application was then started
against the restored database: public health returned only the minimal status
fields, a locally configured diagnostic bearer token returned successful
detailed health, and the Admin screen displayed the restored synthetic counts.
This proves the local logical backup/restore mechanics for the current schema;
it does **not** prove that Supabase has a hosted physical backup, PITR window,
or successful hosted restore for production.

In the isolated copy, verify:

- PostgreSQL starts and the expected extensions are present;
- migration history includes the expected final version;
- application tables, constraints, indexes, RLS enablement, policies, grants,
  and the `yaarlink_app` role exist;
- aggregate row/status counts match the backup-time record;
- a locally started app using disposable secrets and the restored database
  returns authenticated detailed health successfully;
- no production email/webhook credentials are configured in the rehearsal;
- the disposable project/data is deleted or securely retained according to
  the recorded retention decision.

Daily physical backups do not preserve custom-role passwords. After a real
restore, reset the `yaarlink_app` password, update the corresponding Vercel
server-side database credential through the dashboard, redeploy, and verify
health. Never transmit the new password through Git, chat, or a PR.

## Production recovery procedure

1. **Stop the release and limit damage.** Pause further deploys/migrations.
   If bad writes are continuing, use the least destructive available control
   (for example, roll Vercel back to the prior deployment) while preserving
   logs and timestamps.
2. **Record the incident window.** Note the last known-good time, first bad
   migration/deploy, affected tables, and aggregate impact. Take a logical
   dump of the current state if it can be done safely; it may contain rows
   created after the recovery point.
3. **Choose selective recovery first.** Prefer restoring a backup/PITR point
   to a new project, inspecting it there, and copying only approved missing
   rows back. This avoids discarding unrelated production writes.
4. **Use in-place restore only for whole-database rollback.** In Supabase
   **Database → Backups**, select the closest scheduled backup before the
   incident, or in **Point in Time** select **Start a restore** and choose a
   timestamp inside the displayed recovery window. Review the confirmation
   carefully. The project is inaccessible during restore, and all writes after
   the chosen point are lost unless separately recovered.
5. **Rebuild runtime access.** Reset custom database-role passwords, confirm
   RLS/policies/grants, verify migration history, and make sure Vercel is
   pointed at the intended restored database. Do not point the production app
   at a rehearsal project accidentally.
6. **Verify before reopening.** Check aggregate counts, app health, public
   reads, login, dashboard, admin access, campaign/application reads, and logs.
   Only then resume deployments.
7. **Close the incident.** Record data-loss window, rows recovered, credentials
   rotated, remaining losses, and the corrective migration/test that prevents
   recurrence.

## Migration and rollback policy

- Commit the exact reviewed migration before applying it to production:
  generated/schema migrations and their snapshots under `backend/db/drizzle/`,
  plus any separately reviewed production upgrade/backfill SQL under
  `backend/db/migrations/`. Do not make dashboard-only DDL changes.
- Migrations must be transactional where PostgreSQL permits, idempotent or
  guarded against a safe retry, and prefer an expand → deploy → contract
  sequence so the prior app version can keep running.
- Do not drop/rename tables or columns, tighten constraints, or backfill in the
  same step as code that first depends on them unless the release plan proves
  both app versions remain safe.
- The normal rollback is a reviewed **forward corrective migration**, not an
  untested hand-written inverse and not a whole-database restore.
- A database restore is disaster recovery. It discards later writes and is
  reserved for corruption, destructive mistakes, or a migration that cannot be
  corrected forward safely.
- After applying SQL, verify migration history, schema/RLS/grants, aggregate
  counts, and authenticated health diagnostics before merging/deploying the
  dependent application change.

The repository now contains a tracked empty-database Drizzle baseline plus a
reviewed role/RLS/grants migration and bootstrap verifier. That can recreate
the application schema and direct-app role model on a new PostgreSQL database,
but it cannot recreate production data, provider-managed settings/passwords,
Supabase project configuration, or the effect of later production-only
changes that were not committed as migrations. It therefore does not replace
the role/schema/data backup and restore rehearsal above, which remain part of
the release gate. The bootstrap also refuses to replay the baseline over an
existing unjournalled production database.
