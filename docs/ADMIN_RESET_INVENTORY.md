# Admin Dashboard reset — inventory and rollback record

**Inventory date:** 2026-11-05 (Asia/Calcutta)  
**Scope:** inventory only; no source removal, database mutation, Vercel mutation, deployment, Git push, or Production change has been made.  
**Branch:** `arena/9b3c6e40-yaarlink`  
**Historical pre-cleanup HEAD recorded during inventory:** `06e7760166df84d78f0235258655af6ca8566364`  
**Rollback tag status:** `admin-reset-pre-cleanup-20261105` was reported as created in an earlier turn, but it is absent from the current checkout. The current state has not yet been preserved in a commit at the time this document is updated; see the latest Git status and subsequent backup commit.

## 1. Supabase project identity and Production preservation baseline

| Role | Name | Ref | Status / region | PostgreSQL system identifier |
|---|---|---|---|---|
| Production | `Yaarlink` | `dqhxgwzjwzvpqiilteld` | `ACTIVE_HEALTHY`, `ap-northeast-2` | `7690937621030482216` |
| Preview | `yaarlink-preview` | `rjxpvkzlwhabuntfvkct` | `ACTIVE_HEALTHY`, `ap-southeast-1` | `7702070854497379551` |

The two projects have distinct refs and PostgreSQL system identifiers. Both were reported healthy for DB, Auth, REST, Storage, Realtime, pooler/PgBouncer and database-user services. The identity of `yaarlink-preview` is therefore verified as separate from Production `Yaarlink`; this alone does not authorize deletion before backup.

Production baseline captured read-only:

- 17 migrations; latest `20261102144648` (`revoke_audit_events_delete_from_app`). The Preview-only Admin identity/MFA/passkey migrations are not in Production history.
- Aggregate row counts at capture time: `users` 4, `creators` 2, `brands` 2, `campaigns` 1, `applications` 0. These are non-identifying counts only.
- `public.admin_users` is absent. `public.admin_audit_logs` exists in Production, so it and its data must not be dropped or altered as part of this task. Its count/content was not queried.
- Production Auth reported site URL `https://yaarlink-utsav-936a.vercel.app/` and a wildcard Vercel redirect allowlist. This is recorded as the observed configuration, not as an assertion that the URL is the canonical production domain. No Auth setting was changed.
- Vercel Production domains observed: `theyaar.com` → `www.theyaar.com` (308), `www.theyaar.com`, and `yaarlink.vercel.app`. Preserve these, all Production-scoped Vercel variables, Production credentials, records, deployment, and DNS.
- Live public page `https://www.theyaar.com/` returned the YaarLink marketing website (title: “YaarLink · theyaar.com — Simple marketing for everyone.”). No public-site change was made.

## 2. Preview database inventory and data check

Preview has six recorded migrations, latest `20261104175800` (`yl_0004_admin_passkeys`). The Admin-specific migrations are `yl_0002_admin_identity`, `yl_0003_admin_mfa_session_state`, and `yl_0004_admin_passkeys`. The deployed `public` schema contains 24 base tables; all have RLS enabled. Catalog review returned no Admin-named database functions or non-internal triggers. Admin and shared RLS policies exist for `yaarlink_app`; there are no separate edge functions and no database branches on the Preview project.

| Preview table | Exact rows | Preview table | Exact rows |
|---|---:|---|---:|
| `account_tokens` | 0 | `admin_audit_logs` | 0 |
| `admin_auth_tokens` | 0 | `admin_passkeys` | 0 |
| `admin_recovery_codes` | 0 | `admin_security_events` | 0 |
| `admin_sessions` | 0 | `admin_totp_credentials` | 0 |
| `admin_users` | 0 | `admin_webauthn_challenges` | 0 |
| `applications` | 0 | `audit_events` | 0 |
| `auth_failure_lockouts` | 0 | `brands` | 0 |
| `campaigns` | 0 | `contacts` | 0 |
| `creators` | 0 | `notifications` | 0 |
| `pending_signups` | 0 | `rate_limit_buckets` | 0 |
| `reports` | 0 | `settings` | 0 |
| `user_sessions` | 0 | `users` | 0 |

`auth.users` and `storage.objects` also each returned 0 rows. These checks establish that no current application/Admin records were found in the Preview DB/Auth/Storage; they are not a substitute for a database export. Preview Auth was observed with `site_url` `http://localhost:3000`, an empty redirect allowlist, email auth enabled, phone auth disabled, and Supabase Auth passkeys disabled. No Auth configuration was changed. No external Auth provider is reported enabled.

The repo’s schema/migration source at the rollback tag provides a source-level schema reconstruction point (`backend/db/schema.ts`, `backend/db/drizzle/0000_initial_schema.sql` through `0004_admin_passkeys.sql`, and the three dated Admin migration SQL files). This is **not** a physical `pg_dump`/provider backup. No database backup export has been created or downloaded in this session; therefore the Preview project must not be deleted yet. A durable export/verified provider backup is still required even though all checked Preview application data counts are zero.

## 3. Source/UI/API inventory and ownership boundary

### Admin-only surface to remove in a later cleanup pass (not removed yet)

- Pages: `app/admin/page.tsx`, `layout.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `security/page.tsx`, `setup/page.tsx`, `sign-in/page.tsx`, `preview-runtime-check/page.tsx`.
- APIs: `app/api/admin/data/route.ts`, `moderation/route.ts`, the identity setup/login/logout/me/accounts/password/session routes, all Admin MFA/TOTP/recovery/passkey routes, and `app/api/admin/preview-runtime-check/route.ts` (27 Admin API route files in total).
- Server/shared Admin modules: `backend/admin-access.ts`, `backend/admin-audit.ts`, `backend/admin-identity.ts`, `backend/admin-mfa.ts`, `backend/admin-password-policy.ts`, `shared/admin-cookie.ts`, `shared/admin-mfa.ts`, `shared/admin-password-policy.ts`, `shared/admin-rbac.ts`, `shared/admin-webauthn.ts`.
- Components: `frontend/components/admin/AdminMfaPanel.tsx`, `AdminPasswordField.tsx`, `PreviewRuntimeVerification.tsx`; Admin-specific route metadata, localization keys, styles, and tests also need selective cleanup.
- Bootstrap/diagnostics: `scripts/admin-bootstrap-owner.mjs`, `admin:bootstrap-owner` package script, `app/api/admin/preview-runtime-check`, `frontend/components/admin/PreviewRuntimeVerification.tsx`, and the Admin preview runtime verification page.
- Admin-only dependencies evidenced by imports: `@simplewebauthn/browser`, `@simplewebauthn/server`; `qrcode` is also used by the public `frontend/components/ContactLink.tsx`, so it must remain. `bcryptjs` is used by shared `backend/auth.ts` and must remain.
- Admin UI screenshots exist under `docs/previews/phase-2b/`; remove only Admin-specific preview assets when cleanup is approved.

### Shared website/business code and infrastructure to preserve

- Public routes, account auth, brand/creator/campaign/application APIs, `backend/auth.ts`, `bcryptjs`, `backend/email.ts`, database connection/pool, `backend/db/connection-config.ts`, `backend/db/index.ts`, public `ContactLink` QR behavior, translations framework, site-availability behavior, CSRF/CSP/health reporting, local Postgres development stack, and public Vercel/Production configuration.
- Shared DB objects observed in Preview: `account_tokens`, `applications`, `audit_events`, `auth_failure_lockouts`, `brands`, `campaigns`, `contacts`, `creators`, `notifications`, `pending_signups`, `rate_limit_buckets`, `reports`, `settings`, `user_sessions`, and `users`. Preserve these; the Admin feature’s presence in neighboring files is not a reason to remove them.
- `backend/db/health.ts` currently imports Admin audit schema for schema checks; revise selectively if the Admin table is retired from the Preview schema. Keep the public `/api/health` route and its redacted behavior; do not remove public observability or the optional bearer-token diagnostic path merely because Admin-session authorization is removed.
- `proxy.ts` and `shared/site-availability.ts` exempt Admin paths during maintenance. This is shared maintenance behavior and should be adjusted surgically, not replaced wholesale.
- `admin_audit_logs` is Admin-oriented history, but is present in Production and was part of the pre-existing baseline. Do not modify/drop it in Production. `actor_admin_id` and its index were added by the newer Admin identity migration. `backend/db/drizzle/0001_app_role_rls_grants.sql` also has grants/RLS references to `admin_audit_logs`; any future source cleanup must review these references and the historical-vs-active migration strategy rather than blindly deleting the table.

## 4. Vercel inventory and known scope

- Vercel project: `yaarlink-`, ID `prj_nXvPZ5A39vGdVOykIb8PlfCn9Ih3`, team `team_OUuTcaCw4MWT3X3SUdQ54HEV`, framework Next.js.
- The connected project serves Production domains listed above and also has Preview/staging deployments. Do not delete the Vercel project, Production deployment, Production variables, domains, or DNS.
- Confirmed current Arena-branch deployment IDs/SHAs include: `dpl_A6BSMbQEhedjaWvq1KJpGTc2uhJi` (`06e7760`, staged READY); `dpl_FEzkw6wi97i4ai5Z9EuBWvERwk7d` and `dpl_C1pizEQk1nQBwmBukJnUV8hUaynq` (`232c88b`); `dpl_6omjo1yoVuEGZ8LdczK2i582epv8` and `dpl_Gqi9SSmQLjmA4P4H39Fn9s9exyu3` (`3830220`); `dpl_DGAdxzCC871XxpFcwRfVMBiNyzyU` (`ba81214`); `dpl_Bbc5kCVtW1yCX1BQPiTBKqVMDdH5` (`f0855fb`); `dpl_CKgVk7LpqgYCU6UPn2Zz7YQ23sY9` (`652da5d`); `dpl_94QgyHBTM2Y8oPMeHwniZNUtgYVR` (`546f888`); and `dpl_8tSjZBRnzGGy6QibumTYRGE9igTw` (`9e60f94`). These are whole public-site deployments containing the Admin app, not Admin-only deployment artifacts; do not delete them merely because Admin code is present. The larger deployment listing includes unrelated public-site and other-branch entries. Exact complete deployment association inventory remains incomplete, so no deployment cleanup is authorized yet.
- Preview variable names/scopes observed in connector metadata (values were not read/decrypted): `PREVIEW_RUNTIME_VERIFY_TOKEN` (one Preview-wide and one Arena-branch Preview entry), `ADMIN_FIRST_SETUP_KEY`, `ADMIN_MFA_REQUIRED`, `ADMIN_SESSION_SECRET`, `SESSION_SECRET`, `APP_URL`, `DATABASE_CA_CERT`, and `DATABASE_URL` (Arena-branch Preview entries among these). `.env.example` / `.env.local.example` also document `ADMIN_MFA_ENCRYPTION_SECRET`, `HEALTH_DIAGNOSTIC_TOKEN`, `RESEND_API_KEY`, `RESEND_API_BASE_URL`, `EMAIL_FROM`, `BOT_CHALLENGE_SECRET`, `PWNED_PASSWORDS_RANGE_URL`, and `SLOW_QUERY_THRESHOLD_MS`; examples do not prove they exist in Vercel. The connector’s environment-variable response was truncated, so this is not a complete Vercel variable inventory. Do not delete/update any environment variable until its exact ID, target, Git-branch scope, and Preview-vs-Production association are verified. Preserve all Production-scoped variables. In particular, `SESSION_SECRET`, `APP_URL`, health/email and other variables may be shared website configuration rather than Admin-only.
- Previously observed Preview runtime logs for `dpl_A6BSMbQEhedjaWvq1KJpGTc2uhJi` showed database-backed routes failing with a generic PostgreSQL URL-parse error. The database URL value was not inspected. This is a Preview configuration issue, not a reason to touch Production.

## 5. Git and docs inventory

- Working branch and its remote-tracking branch are both `arena/9b3c6e40-yaarlink`; `main` is at `e4c6a9180e248acd1967690741a55f7ca600d9b6`. No other local/remote branches were listed. Do not remove or rename this Arena-tracked branch; do not push or merge to `main`.
- Admin work appears in commits `0249332`, `546f888`, `652da5d`, `f0855fb`, `ba81214`, `3830220`, `232c88b`, and `06e7760`; `9e60f94` adds Admin docs and related progress material. These commits are part of this branch’s history. No other Admin-only branch is present in the current branch listing. The local tag above preserves the exact pre-cleanup HEAD.
- Admin-heavy docs: `docs/ADMIN_IDENTITY.md`, `docs/SUPER_ADMIN_DISCOVERY.md`, `docs/SUPER_ADMIN_PROGRESS.md`, plus Admin sections in `docs/YAARLINK_PHASE_PREVIEWS.md`, `docs/YAARLINK_IMPLEMENTATION_CHECKLIST.md`, `docs/YAARLINK_MASTER_PROGRESS.md`, `docs/OWNER_LOCAL_SETUP.md`, `docs/LOCAL_OFFLINE_DEVELOPMENT.md`, and `README.md`. Other listed docs (backup/recovery, deploy, observability, structure) contain shared guidance and need surgical review.
- CI workflows are `.github/workflows/ci.yml` and `.github/dependabot.yml`; no Admin-only GitHub workflow or repository-level Vercel config was found. The app uses `proxy.ts` (not root `middleware.ts`).

## 6. Pre-removal gates and next actions

1. Create/download and verify a durable Preview database export (schema plus relevant data) outside the Preview project. Current repo migrations and zero-count checks are a source/emptiness record, not a physical backup.
2. Record the complete, non-secret Vercel Preview environment-variable metadata (names, IDs, exact target/branch scope) and full Preview deployment association inventory using an untruncated listing. Keep shared/public and Production resources untouched.
3. Once gates 1–2 are satisfied, clean the Admin-only source/docs/tests and Preview-only variables carefully; preserve public API/auth/business functions and `admin_audit_logs`/Production records. Do not deploy to Production or merge to `main`.
4. Only then request/execute deletion of the exact Preview ref `rjxpvkzlwhabuntfvkct`. If Supabase requires account-owner confirmation, stop and report the exact Dashboard confirmation required; do not claim deletion.
5. Verify old Admin routes/APIs/diagnostics are gone from source, verify Preview cleanup state, recheck Production identity/config/data counts and public-site behavior, and present a clean replacement architecture proposal only. Do not implement that proposal in this cleanup task.

## 7. Safety audit follow-up — 2026-11-05

### Backup capability check

The connected Supabase tools offer SQL queries, migration/project/configuration reads and project operations, but no backup/export/download or restore-test operation. This workspace has no `pg_dump`, `psql`, Docker, or Supabase CLI executable, and no database connection variable was present in the process environment (names only were checked). No credential or database URL was inspected. Consequently, **no database backup file was created, no storage location exists, and no restore test was possible**. The migration source and empty-row counts recorded above remain logical inventory evidence only, not the requested verified backup.

Auth and Storage require separate configuration/data capture beyond a Postgres application-schema dump:

- Preview Auth settings were read without exposing credentials: `http://localhost:3000` site URL, no redirect allowlist, email enabled, phone disabled, no enabled external identity provider, and built-in Auth MFA/passkeys settings disabled. `auth.users` is empty. SMTP/provider/hook secrets are intentionally not read. A DB dump does not preserve all Supabase Auth project-level settings; retain a separate safe settings export.
- Preview has no rows in `storage.objects` and no rows in `storage.buckets`. Storage bucket settings, storage policies and any external object payloads are not guaranteed to be included in a database dump; capture separately. No object data was found, but that does not remove the separate-config requirement.

### Vercel variable metadata observed (names/IDs/scopes only)

Project `prj_nXvPZ5A39vGdVOykIb8PlfCn9Ih3`, team `team_OUuTcaCw4MWT3X3SUdQ54HEV`. The safe metadata visible in the list response includes these Preview records:

| Variable | ID | Target | Git branch | Preliminary classification |
|---|---|---|---|---|
| `PREVIEW_RUNTIME_VERIFY_TOKEN` | `xzbgKGm92MLfBWAD` | Preview | — (all Preview branches) | Admin runtime diagnostic |
| `PREVIEW_RUNTIME_VERIFY_TOKEN` | `mRTpKg5JOLa1kC2E` | Preview | `arena/9b3c6e40-yaarlink` | Admin runtime diagnostic |
| `ADMIN_FIRST_SETUP_KEY` | `lGYLyt7vygUIsDbd` | Preview | `arena/9b3c6e40-yaarlink` | Admin-only setup |
| `APP_URL` | `d5sMm6EGXrVWXFw1` | Preview | `arena/9b3c6e40-yaarlink` | Shared application URL; preserve pending architecture |
| `ADMIN_MFA_REQUIRED` | `ksKSoV3z7bcAHbBU` | Preview | `arena/9b3c6e40-yaarlink` | Admin-only MFA policy |
| `ADMIN_SESSION_SECRET` | `lFYWaZwqaKEW6r2Q` | Preview | `arena/9b3c6e40-yaarlink` | Admin-only session signing |
| `SESSION_SECRET` | `aq1hdZnHnkwvrCJD` | Preview | `arena/9b3c6e40-yaarlink` | Shared website/session secret; preserve pending architecture |
| `DATABASE_CA_CERT` | `dMtDBraZv2fSy9WF` | Preview | `arena/9b3c6e40-yaarlink` | Preview DB connection setting; project association not verified by value |
| `DATABASE_URL` | `6R6oQf5OppbAgdTs` | Preview | `arena/9b3c6e40-yaarlink` | Preview DB connection setting; project association not verified by value |

The API response itself was truncated, with Production entries visible at both its beginning and end and omitted entries in between. Thus the table above is **not a complete environment inventory**; exact Production and Development lists/scopes/IDs, and any additional Preview records, remain unavailable from this response. No values were decrypted or intentionally included in this report. Do not use `get_env_var` to fill gaps because that operation decrypts the value. A complete names/IDs/target/branch inventory requires a metadata-only Vercel export or dashboard review by the account owner.

### Arena-branch Preview deployment inventory observed

Paginated Vercel deployment results show these deployments associated with `arena/9b3c6e40-yaarlink` (all are whole-site deployments, not Admin-only artifacts):

| Deployment ID | Commit | Vercel target/status |
|---|---|---|
| `dpl_A6BSMbQEhedjaWvq1KJpGTc2uhJi` | `06e7760` | API target `null` (staged Preview URL) / READY |
| `dpl_FEzkw6wi97i4ai5Z9EuBWvERwk7d` | `232c88b` | target `staging` / READY |
| `dpl_C1pizEQk1nQBwmBukJnUV8hUaynq` | `232c88b` | API target `null` (Preview URL) / READY |
| `dpl_6omjo1yoVuEGZ8LdczK2i582epv8` | `3830220` | target `staging` / READY |
| `dpl_Gqi9SSmQLjmA4P4H39Fn9s9exyu3` | `3830220` | API target `null` (Preview URL) / READY |
| `dpl_DGAdxzCC871XxpFcwRfVMBiNyzyU` | `ba81214` | API target `null` (Preview URL) / READY |
| `dpl_Bbc5kCVtW1yCX1BQPiTBKqVMDdH5` | `f0855fb` | API target `null` (Preview URL) / READY |
| `dpl_CKgVk7LpqgYCU6UPn2Zz7YQ23sY9` | `652da5d` | API target `null` (Preview URL) / READY |
| `dpl_94QgyHBTM2Y8oPMeHwniZNUtgYVR` | `546f888` | API target `null` (Preview URL) / READY |
| `dpl_8tSjZBRnzGGy6QibumTYRGE9igTw` | `9e60f94` | API target `null` (Preview URL) / READY |

No deployment was deleted. These deployments bundle the public website as well as Admin routes, so none is classified as Admin-only. No exact database-to-deployment link can be confirmed from names/scopes alone; the observed branch Preview `DATABASE_URL`/`DATABASE_CA_CERT` values were not read.

### Proposed deletion boundary (not executed)

- After an independently stored, verified backup and explicit user approval: delete only Supabase Preview project `rjxpvkzlwhabuntfvkct` if still confirmed as `yaarlink-preview` and still distinct from Production.
- After full Vercel metadata review and approval: candidate Admin-specific Preview variables are the two `PREVIEW_RUNTIME_VERIFY_TOKEN` records (`xzbgKGm92MLfBWAD`, `mRTpKg5JOLa1kC2E`), `ADMIN_FIRST_SETUP_KEY` (`lGYLyt7vygUIsDbd`), `ADMIN_MFA_REQUIRED` (`ksKSoV3z7bcAHbBU`), and `ADMIN_SESSION_SECRET` (`lFYWaZwqaKEW6r2Q`). This is only a preliminary candidate list, not deletion authorization. Preserve shared `APP_URL` and `SESSION_SECRET`; do not remove DB settings until their project association and replacement/impact are documented. Preserve every Production variable, all domains, and all whole-site deployments; do not delete deployments solely because they contain Admin routes.
- Exact complete variable inventory, durable backup, and restoration verification are not yet available. **No destructive cleanup has been performed.**

**Current gate (rechecked):** Production remains unchanged. Preview identity, zero-row counts, Auth/Storage status and current Arena deployment IDs were read-only checks. No external durable backup or restore verification exists. The Vercel variable response remains truncated. A current-checkout consistency check also found that the previously reported local tag `admin-reset-pre-cleanup-20261105` is **not present** in this checkout: `HEAD` is `e4c6a9180e248acd1967690741a55f7ca600d9b6`, and the old Admin implementation/schema/migration work is present as uncommitted tracked and untracked working-tree changes. Do not claim that rollback tag currently exists or create a tag at `HEAD` as though it captured those working-tree changes. No Supabase deletion, Vercel variable deletion, deployment deletion, or Production modification has occurred.

## 8. User-requested final identity confirmation (read-only recheck)

On the latest recheck, Supabase returned:

- Deletion target: project **`yaarlink-preview`**, ref **`rjxpvkzlwhabuntfvkct`**, status `ACTIVE_HEALTHY`, region `ap-southeast-1`, PostgreSQL 17.11.
- Protected Production project: **`Yaarlink`**, ref **`dqhxgwzjwzvpqiilteld`**, status `ACTIVE_HEALTHY`, region `ap-northeast-2`, PostgreSQL 17.11.
- The refs and DB hosts are distinct; do not use the Production ref in the deletion call.

The only safe prepared deletion target is `project_ref: "rjxpvkzlwhabuntfvkct"` via the Supabase project-delete operation. **No deletion call has been made. Await explicit user approval after showing this exact target.** The connected Supabase tool inventory contains no database backup/export/download operation, and no Dashboard UI is available in this workspace; whether the owner’s Dashboard presents a downloadable backup is therefore unverified. No backup location or restore verification exists.

Confirmed candidate Admin-only Vercel variable metadata from the prior untruncated visible portion of the response (names, IDs and scopes only): `PREVIEW_RUNTIME_VERIFY_TOKEN` / `xzbgKGm92MLfBWAD` / Preview all branches; `PREVIEW_RUNTIME_VERIFY_TOKEN` / `mRTpKg5JOLa1kC2E` / Preview branch `arena/9b3c6e40-yaarlink`; `ADMIN_FIRST_SETUP_KEY` / `lGYLyt7vygUIsDbd` / Preview branch `arena/9b3c6e40-yaarlink`; `ADMIN_MFA_REQUIRED` / `ksKSoV3z7bcAHbBU` / Preview branch `arena/9b3c6e40-yaarlink`; `ADMIN_SESSION_SECRET` / `lFYWaZwqaKEW6r2Q` / Preview branch `arena/9b3c6e40-yaarlink`. These are candidates only; no Vercel deletion has occurred. Shared variables, Production variables, database variables with unverified project association, and whole-site deployments remain excluded.