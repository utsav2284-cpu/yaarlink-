# YaarLink administrator identity — Phase 2A and Phase 2B

Status date: 2026-11-04  
Branch: `arena/9b3c6e40-yaarlink`

Phase 2A is implemented and tested locally. Phase 2B now adds mandatory
TOTP/recovery verification, recent step-up checks, and WebAuthn Passkeys
locally. Neither phase has been deployed, and no production DDL or production
administrator account has been created.

Phase 2B is **locally implemented but not production-complete**: a physical
browser/device Passkey test, the production account-recovery drill, staging
evidence, and explicit production approval remain. The legacy shared-password
login has now been retired from this local branch so the database identity
flow below is the only administrator login path; that retirement has not been
deployed to production.

## What Phase 2A adds

- Individual database-backed administrator accounts in `admin_users`.
- A restricted first-owner setup flow:
  - an operator-controlled CLI accepts an owner email only;
  - it refuses to run if administrator setup is already complete;
  - it creates a pending Super Admin row with no password;
  - it generates a cryptographic one-time token and stores only its
    purpose-separated SHA-256 hash;
  - it emails a 20-minute setup link and never prints the raw token.
- A browser setup screen at `/admin/setup` where the owner enters their name
  and chooses their own password. It has show/hide controls, individual
  requirement indicators, a strength indicator, confirmation, and a
  24-character generated-password suggestion.
- A separate administrator password policy: 12–256 characters with uppercase,
  lowercase, number, and symbol. The server also applies the existing
  context/denylist checks and the k-anonymity breach lookup. Passwords are
  stored with the application's existing PBKDF2 password hasher.
- Database-backed, individually revocable administrator sessions in
  `admin_sessions`. The `__Host-yl_admin_account` cookie is HttpOnly, Secure,
  and SameSite=Strict. One environment-gated exception exists for local
  embedded previews (see `shared/admin-cookie.ts`): browsers refuse to
  store/send a Strict cookie inside a cross-site iframe, which made a
  correct password login bounce from `/admin/security` back to sign-in
  (session created server-side, cookie never presented, `/me` 401). When
  an operator explicitly sets `ADMIN_COOKIE_SAME_SITE=none` **and**
  `APP_URL` is a loopback URL, the cookie instead uses
  `SameSite=None; Secure; Partitioned` (CHIPS). The override is ignored
  for any non-loopback `APP_URL`, so production always keeps Strict; it
  is set only in the local `.env.local`. Set/clear paths share one
  options helper (`adminAccountCookieOptions`) so deletion mirrors the
  same attributes. Reproduced pre-fix and verified post-fix in real
  Chromium on 2026-11-04 (cross-site iframe sign-in → security stays →
  TOTP verify → dashboard); unit tests in `tests/admin-cookie.test.mjs`
  pin the loopback gate.
- Administrator sign-in, logout, authenticated password change, generic
  password-reset request, and one-time password reset.
- Invitation-only administrator creation with hashed 24-hour links, resend,
  revocation, duplicate prevention, role assignment, suspension/reactivation,
  access revocation, and session revocation.
- A fixed server-side RBAC matrix for:
  - Super Admin
  - Admin
  - Operations Manager
  - Verification Manager
  - Support Manager
  - Finance Manager
  - Content Manager
  - Analyst
- Last-active-Super-Admin protection for demotion, suspension, and revocation.
- Append-only authentication/security history in `admin_security_events`, plus
  an `actor_admin_id` column on the existing `admin_audit_logs` so transitional
  dashboard moderation/export actions can be attributed to a database admin.
- Database MFA tables in `admin_totp_credentials`, `admin_recovery_codes`,
  `admin_passkeys`, and one-time `admin_webauthn_challenges`.

Public marketplace signup cannot create or promote an `admin_users` row. There
is no public administrator registration route, default administrator, default
password, or hardcoded owner email.

## What Phase 2B-1 adds

- Password sign-in now creates only a 10-minute MFA-pending browser session.
  `admin_sessions.mfa_verified_at` remains null, and sensitive account,
  password, session, dashboard-data, moderation, and health-diagnostic paths
  fail closed for that identity session.
- TOTP/recovery verification or first TOTP enrollment marks the existing
  database session verified and extends it only to its original 12-hour
  absolute cap.
- Authenticator setup starts only after re-entering the current password.
  The begin response contains the one-time setup secret, otpauth URI, and QR
  code with `private, no-store` headers.
- Each administrator's 20-byte TOTP secret is encrypted with AES-256-GCM and
  admin-ID-bound authenticated data. The database stores split ciphertext/IV
  fields, never the raw Base32 secret.
- A separate `ADMIN_MFA_ENCRYPTION_SECRET` is recommended. If it is blank,
  a domain-separated key is derived from `ADMIN_SESSION_SECRET`. Decide the
  production key before the first production enrollment and back it up as
  key material; changing/removing it later makes existing TOTP/recovery
  verification unavailable until the original key is restored.
- TOTP uses standard SHA-1, six digits, a 30-second period, and a ±1-window
  clock tolerance. The matched counter is claimed under a row lock and with
  `last_counter < matched_counter`, so a code cannot be replayed.
- Enrollment issues ten 12-character recovery codes. Only server-peppered
  HMAC-SHA-256 hashes are stored. Codes are returned once, are single-use,
  and regeneration deletes every old code before issuing the replacement set.
- `/admin/security` provides enrollment, sign-in challenge, recovery-code
  use, one-time copy/download/save acknowledgement, recovery regeneration,
  and status refresh in English, Hindi, and Punjabi. It hides password,
  session, account, and dashboard controls until the current browser is
  MFA-satisfied.
- Password change, administrator invitations, role/status changes,
  other-account session revocation, recovery-code regeneration, and TOTP
  disable/replacement require MFA verification within the previous
  15 minutes.
- TOTP disable intentionally returns `admin_last_mfa_method` while TOTP is
  the administrator's only enrolled MFA method. It becomes available when a
  Passkey remains; TOTP and Passkey removal lock in the same order so two
  concurrent requests cannot remove both final methods.
- MFA success/failure, enrollment, recovery regeneration, and related
  security outcomes are written to `admin_security_events` without
  passwords, TOTP secrets, recovery codes, or raw auth tokens.

## What Phase 2B Passkeys add

- Maintained `@simplewebauthn/server` and `@simplewebauthn/browser`
  libraries perform registration and authentication ceremonies; no home-grown
  WebAuthn verifier is used.
- A Passkey can be added only from an MFA-satisfied session with step-up
  verification from the previous 15 minutes **and** the current password.
  This keeps a stolen password or 10-minute pending session from adding an
  attacker's authenticator. TOTP plus recovery codes therefore remain the
  first enrollment path.
- Registration requires user presence and user verification, uses a
  five-minute challenge, excludes already-registered credentials, and stores
  only the credential ID, public key, signature counter, allowlisted
  transports, device name, creation time, and last-used time. The private key
  never reaches YaarLink.
- Authentication challenges are bound to one administrator, database
  session, purpose, and five-minute expiry in `admin_webauthn_challenges`.
  Only a domain-separated SHA-256 hash is stored. Beginning a new ceremony
  revokes the prior unused challenge for that session/purpose, and a
  successful finish claims the challenge atomically, so a response cannot be
  replayed.
- Assertion verification checks the exact expected origin/RP ID, challenge,
  credential owner, user-verification flag, signature, and signature
  counter. A counter may remain zero for authenticators that always report
  zero; any non-zero regression or replay fails closed.
- Production `theyaar.com` and `www.theyaar.com` intentionally use the
  registrable RP ID `theyaar.com`, so one production Passkey works on both.
  Localhost, preview, staging, and production hosts otherwise use separate
  RP IDs and therefore need separate Passkeys. Plain HTTP is accepted only
  for loopback development.
- `/admin/security` lists Passkeys without exposing credential IDs/public
  keys, verifies a pending/stale session with a Passkey, adds a Passkey, and
  revokes one. Revocation also requires fresh step-up plus the current
  password and cannot remove the sole remaining MFA method.
- Passkey registration revokes the administrator's other sessions and marks
  the current session verified. Registration, verification success/failure,
  counter regression, unknown credentials, and revocation are audited in
  `admin_security_events` without private keys, raw challenges, passwords, or
  credential secrets.
- Browser WebAuthn responses are structurally parsed and size-bounded before
  server verification. Unsupported browsers and cancelled/timed-out device
  ceremonies produce honest EN/HI/PA messages instead of a fake success.

Still pending in Phase 2B:

- a physical browser/device Passkey registration and sign-in test on the
  preview/staging RP ID, followed later by apex/www production RP evidence;
- a real account-recovery drill with the production owner account after
  approval;
- staging migration/release evidence and explicit production approval.

## Unified official administrator login and legacy retirement

### Official flow

`/admin/sign-in` is now the single administrator login entry point in this
branch:

1. The administrator enters their own registered email and individual
   password. Unknown email and wrong password keep the same generic failure
   handling.
2. Password success creates only the existing 10-minute MFA-pending database
   session and continues to `/admin/security#admin-mfa`.
3. If MFA is not enrolled, the administrator must re-enter the current
   individual password to reveal the one-time TOTP QR/manual key, then confirm
   the first authenticator code. Recovery codes must be saved/acknowledged
   before the login flow continues onward.
4. If MFA is already enrolled, the administrator must verify with TOTP, an
   unused recovery code, or a registered Passkey.
5. Only after MFA is satisfied does server-side RBAC authorize protected
   APIs. An authorized Super Admin continues to `/admin`; lower roles remain
   limited to the surfaces their permissions allow.
6. Visiting `/admin` without a suitable session sends an unauthenticated
   browser to `/admin/sign-in` and a password-authenticated but MFA-pending
   browser to `/admin/security`. `/admin` no longer renders a login form.

Ordinary public creator/business signup and sign-in are unchanged and cannot
create administrator access.

### Dependency analysis completed before removal

The legacy implementation was inventoried across runtime code, startup
validation, tests, environment templates, and operator documentation:

- `backend/admin.ts` owned the shared `ADMIN_PASSWORD` comparison, optional
  `ADMIN_TOTP_SECRET` verification/replay counter, `__Host-yl_admin` cookie,
  database session-version handling, and legacy unavailable errors.
- Its only runtime importers were the legacy login/logout routes,
  `backend/admin-access.ts`, admin data, admin moderation, and health.
- `app/admin/page.tsx` was the only caller of `/api/admin/login` and
  `/api/admin/logout`; it rendered the duplicate shared-password/optional-code
  form that confused first MFA enrollment.
- `backend/admin-access.ts` previously accepted the legacy cookie before an
  MFA-satisfied database identity. It now accepts only an MFA-satisfied
  database identity with the required permission; the current broad
  data/moderation monolith additionally requires `super_admin` until those
  routes are split by module. Lower roles fail closed rather than receiving
  unrelated private data.
- Health diagnostics now consider only the bearer diagnostic token or the
  database administrator account cookie. The retired legacy cookie is
  ignored if a browser still has one.
- The dashboard logout now calls `/api/admin/identity/logout`; the legacy
  `/api/admin/login` and `/api/admin/logout` route files and
  `backend/admin.ts` were deleted. No replacement shared account, secret
  query parameter, public registration path, or backdoor was added.
- Historical audit labels for old `admin.login`/`admin.logout` rows remain so
  existing audit history can still be rendered; no new legacy login can be
  created.
- The generic settings rows named `admin_session_version` and
  `admin_totp_last_counter`, if present in an existing database, are now
  inert. No database migration is required to stop honoring them, and they
  should not be deleted as part of an incident rollback.

### Environment-variable retirement

After the unified code is deployed to a specific environment and that
environment's database Super Admin has personally verified password sign-in,
MFA, dashboard access, logout, and recovery, these variables can be removed
from that environment under an approved change:

- `ADMIN_PASSWORD`
- `ADMIN_TOTP_SECRET`

They must **not** be removed from production merely because this local branch
ignores them. Production still runs the previous build until the separately
approved identity release, migrations, backup/PITR gate, staging evidence,
and production checks are complete. Retain the old values privately during
cutover only so the previous build remains a rollback option; never print or
copy them into Git, tickets, screenshots, or local test configuration.

These values remain in use and must not be retired with the shared login:

- `ADMIN_SESSION_SECRET` — signs database administrator account cookies.
- `ADMIN_MFA_ENCRYPTION_SECRET` when configured — protects individual MFA
  material; changing/removing it after enrollment can make enrolled MFA
  unavailable until the original key is restored.
- `SESSION_SECRET`, `BOT_CHALLENGE_SECRET`, and `HEALTH_DIAGNOSTIC_TOKEN`
  under their existing independent rules.

### Rollback plan for the retirement

1. Before cutover, retain the prior deployment/build and the rollback-only
   legacy environment values in the hosting secret store. Verify hosted
   backup/PITR and stage the additive identity migrations first.
2. If the unified build must be rolled back, redeploy/revert to the previous
   known-good build. The additive administrator identity/MFA tables and inert
   legacy settings rows can remain; do not drop identity data during an
   incident.
3. If rollback happens after the legacy environment values were deleted,
   restore them from the approved password/secret manager before starting
   the old build. The unified build itself deliberately contains no legacy
   fallback to reactivate.
4. After rollback, verify public health, public auth, administrator access,
   protected APIs, audit writes, and monitoring before attempting cutover
   again.

## Roles and permissions (implemented matrix, reviewed 2026-11-04)

Source of truth: `shared/admin-rbac.ts`. The matrix is fixed in reviewed
source code, not editable database rows, so a compromised lower-privilege
session cannot invent a stronger role. `super_admin` implicitly holds every
permission; all other roles hold only the lists in `ADMIN_ROLE_PERMISSIONS`.

| Role | Rank | Capability scope (summary) |
|---|---:|---|
| `super_admin` | 100 | All 54 permissions, including every Super-Admin-only action below |
| `admin` | 80 | Broad operations: creators/campaigns/users/content/settings/CRM/support/finance (view+manage), audit.view, security.view, incidents, health, backups.view, data.export, privacy |
| `operations_manager` | 50 | Creators/campaigns manage (no verify/approve), reports, users.view, CRM, support, communications, privacy.view |
| `verification_manager` | 45 | creators.verify, campaigns.approve, contact views, reports, support.view, communications |
| `support_manager` | 40 | Contact views, reports, users.view, CRM.view, support manage, communications, privacy.view |
| `finance_manager` | 40 | finance.view/manage/approve, analytics + export, users/creators/campaigns view, data.export |
| `content_manager` | 35 | content.view/manage/publish, marketplace views, analytics.view, communications |
| `analyst` | 20 | Read-only marketplace + analytics.view/analytics.export/data.export |

Full permission catalog (54): `dashboard.view`; `creators.view`,
`creators.contact.view`, `creators.verify`, `creators.manage`,
`creators.export`; `campaigns.view`, `campaigns.contact.view`,
`campaigns.manage`, `campaigns.approve`, `campaigns.publish`,
`campaigns.feature`, `campaigns.export`; `reports.view`, `reports.manage`;
`users.view`, `users.manage`, `users.suspend`, `users.export`;
`content.view`, `content.manage`, `content.publish`; `settings.view`,
`settings.manage`; `website.availability`, `website.emergency`;
`analytics.view`, `analytics.export`; `crm.view`, `crm.manage`;
`support.view`, `support.manage`; `finance.view`, `finance.manage`,
`finance.approve`; `communications.view`, `communications.send`;
`admin_users.view`, `admin_users.invite`, `admin_users.manage_roles`,
`admin_users.suspend`, `admin_users.sessions.manage`; `audit.view`;
`security.view`, `security.manage`, `security.incidents.manage`;
`system.health.view`; `backups.view`; `data.export`, `data.import`,
`data.delete`; `privacy.view`, `privacy.manage`.

Super-Admin-only permissions (no other role holds them):
`website.emergency`, `admin_users.view`, `admin_users.invite`,
`admin_users.manage_roles`, `admin_users.suspend`,
`admin_users.sessions.manage`, `security.manage`, `data.import`,
`data.delete`. Role assignment also requires the target rank to be at or
below the actor's rank, only a Super Admin may invite another Super Admin,
and the last active Super Admin cannot be demoted/suspended/revoked
(`wouldRemoveLastActiveSuperAdmin` plus the transactional DB count).

Current page access (implementation reality, not the target design):

- `/admin/sign-in` — official entry for every administrator role.
- `/admin/security` — any authenticated administrator for their own MFA,
  Passkeys, sessions, and password. Administrator invitation/role/session
  management additionally requires the matching `admin_users.*` permission
  and a fresh step-up; in the fixed matrix that is Super Admin only.
- `/admin` — protected dashboard. The current monolithic data/moderation
  APIs additionally require `super_admin` (see `backend/admin-access.ts`),
  so lower roles are denied dashboard data until Phase 3+ splits the
  endpoints per permission. The Analyst denial is covered by browser E2E.
- `/admin/setup`, `/admin/forgot-password`, `/admin/reset-password` —
  one-time token flows only; no public administrator registration exists.

**Mismatch against the original master specification (reported, not
changed):** the specification names Moderator, Support Admin, Finance
Admin, and Security Admin as separate roles. The implemented taxonomy has
no Moderator (reports/verification duties sit with
`verification_manager`/`operations_manager`) and no Security Admin
(`security.view` is held by `admin`; `security.manage` is Super-Admin
only). `support_manager`/`finance_manager` correspond to Support/Finance
Admin in scope but not in name. No role has been renamed and no permission
changed; reconcile this taxonomy deliberately before claiming Part 10 or
Modules 41–42 complete.

## Database changes

Empty databases receive the identity, MFA session, and Passkey ceremony
schema through:

- `backend/db/drizzle/0002_admin_identity.sql`
- `backend/db/drizzle/0003_admin_mfa_session_state.sql`
- `backend/db/drizzle/0004_admin_passkeys.sql`
- the matching `meta/0002_snapshot.json`, `meta/0003_snapshot.json`, and
  `meta/0004_snapshot.json`

Existing databases must use the reviewed additive upgrades in this order:

1. `backend/db/migrations/20261104_admin_identity_foundation.sql`
2. `backend/db/migrations/20261105_admin_mfa_session_state.sql`
3. `backend/db/migrations/20261106_admin_passkey_challenges.sql`

Do not replay the empty-database bootstrap as a production upgrade. The first
production upgrade creates seven identity tables, adds
`admin_audit_logs.actor_admin_id`, enables RLS, grants ordinary CRUD only to
`yaarlink_app` on identity lifecycle tables, and grants only SELECT/INSERT on
`admin_security_events`. The second adds nullable
`admin_sessions.mfa_verified_at` and its check constraint; existing sessions
remain null and therefore fail closed as MFA-pending. The third widens the
WebAuthn signature counter to `bigint`, repairs the pre-release Passkey
character checks to a PostgreSQL-safe length-plus-charset form, and adds the
hashed one-time `admin_webauthn_challenges` table with RLS and app-only CRUD.

Production application of that SQL remains blocked until:

1. hosted backup/PITR is verified, or a manual backup has been created and
   restore-tested;
2. the SQL passes on a staging/disposable copy;
3. the owner explicitly approves the production DDL and deployment.

## Local test procedure

Use synthetic local data only. Do not copy production records or production
secrets into the local checkout.

1. Create `.env.local` from `.env.local.example` and replace every generated
   secret placeholder with a distinct local value.
2. Start the local stack described in
   `docs/LOCAL_OFFLINE_DEVELOPMENT.md`:

   ```bash
   npm ci
   npm run local:db:up
   npm run local:bootstrap
   npm run local:services
   npm run dev
   ```

   The bootstrap should now verify 24 application tables.
3. In another terminal, create the local first-owner setup email:

   ```bash
   npm run admin:bootstrap-owner -- --email=owner@example.test
   ```

   The command does not print the raw setup link. In local development only,
   open the captured message in `.local/email-outbox.jsonl`. That file contains
   test one-time links; never commit, upload, or share it.
4. Open the setup link, create the Super Admin password, then sign in at
   `/admin/sign-in`.
5. Open `/admin/security`, re-enter the owner password, scan the QR code (or
   enter the shown secret) in an authenticator app, confirm the six-digit
   code, and save the ten one-time recovery codes.
6. While step-up is still fresh, add and name a Passkey with the current
   password. Sign out/in and verify once with the Passkey. A localhost or
   preview Passkey is intentionally separate from staging/production.
7. Only then test password change, sessions, invitations, role changes,
   suspension, and session revocation. Open `/admin` to confirm the
   MFA-verified database Super Admin can use the transitional dashboard.

## Validation performed in this branch

The sandbox has no Docker/PostgreSQL client, so validation used a disposable
embedded PostgreSQL 18.6 instance under `/tmp`, the existing loopback email and
password-range stubs, and a production build of the app.

Phase 2A passed:

- `npm test` — 53/53, including new administrator password/RBAC tests;
- `npm run typecheck`;
- `npm run lint`;
- `npm run db:check`;
- `npm run build`;
- `npm run db:bootstrap:verify` on an empty disposable database — 23 tables,
  RLS enabled, grants checked, transactional app-role writes checked;
- production upgrade SQL applied twice to a separate pre-identity fixture —
  seven identity tables with RLS, least-privilege grants, and actor column;
- local HTTP end-to-end:
  - CLI first-owner email without printing the token;
  - owner setup and token-replay rejection;
  - wrong-password rejection and correct login;
  - Super Admin access to the transitional dashboard data route;
  - invitation creation/acceptance;
  - Analyst denied the owner-level legacy data route and account list;
  - role change revoked the old session;
  - suspension blocked login and reactivation succeeded;
  - self-demotion was blocked;
  - password reset revoked the old owner session;
  - authenticated password change preserved only the current session;
  - stored passwords were PBKDF2 hashes and stored tokens were SHA-256 hashes.

The second run of the owner bootstrap after setup correctly exited without
creating another administrator.

Phase 2B-1 passed on a fresh disposable embedded PostgreSQL 18.6 database:

- `npm test` — 58/58, including RFC 6238, Base32, and recovery-code helper
  tests;
- `npm run typecheck`, `npm run lint`, `npm run db:check`,
  `npm run build`, and `git diff --check`;
- empty-database bootstrap verified 23 tables, RLS, grants, and
  transactional app-role writes;
- `20261105_admin_mfa_session_state.sql` applied twice to a Phase 2A-shaped
  fixture; the existing session remained present with
  `mfa_verified_at = NULL`, the check constraint existed, and RLS stayed on;
- a 100-check local HTTP/database E2E verified:
  - owner setup/replay and wrong-password rejection;
  - 10-minute pending sessions denied sessions/accounts/legacy data;
  - cross-site MFA-begin rejection;
  - wrong-password MFA begin rejection;
  - QR/secret enrollment, wrong code rejection, encrypted TOTP storage,
    persisted replay counter, and TOTP replay rejection;
  - 10 server-peppered hashed recovery codes per administrator;
  - pending-to-verified session transition retaining the 12-hour cap;
  - Super Admin dashboard access only after MFA;
  - authenticated password change and Analyst invitation;
  - Analyst MFA enrollment without account-list or legacy-data access;
  - self-demotion block, suspension/reactivation, role-change session
    revocation, recovery-code login, and password reset with MFA still
    working afterwards;
  - stale step-up blocking password and role changes, then fresh TOTP
    restoring them;
  - recovery regeneration invalidating old codes, new-code verification,
    replay rejection, and a second new code succeeding;
  - sole-TOTP disable returning HTTP 409;
  - database totals of 2 hashed admins, 2 verified TOTP credentials, 20
    recovery rows (16 unused/4 used), and 4 active MFA-verified sessions;
  - 18 security-event groups and no passwords/TOTP secrets/recovery codes
    in security-event metadata;
- HTTP smoke returned 200 for health, setup, sign-in, forgot/reset,
  security, and admin pages, while unauthenticated MFA status returned 401.
- A second owner-bootstrap attempt after setup exited non-zero with
  “Administrator setup is already complete” and the admin count stayed 2.

Phase 2B Passkeys then passed on another fresh disposable embedded
PostgreSQL 18.6 database:

- `npm test` — 65/65, including seven new tests for RP/origin resolution,
  administrator user handles, device-name/transport bounds, bounded browser
  response parsing, and signature-counter rules;
- TypeScript, ESLint, Drizzle check, production build, and diff check;
- empty-database bootstrap verified 24 tables, RLS, least-privilege grants,
  and transactional app-role writes;
- the upgrade test applied `20261106_admin_passkey_challenges.sql` twice to
  a pre-Passkey-ceremony-shaped fixture, preserved the maximum signed counter,
  widened it so the maximum unsigned WebAuthn counter fits, repaired the
  invalid PostgreSQL regex checks, and verified challenge-table RLS, grants,
  and policy;
- an 88-check HTTP/database E2E used a disposable ES256 software
  authenticator to exercise real attestation/assertion cryptography through
  the production API routes. It verified owner TOTP first enrollment,
  wrong-password registration denial, hashed/session-bound/five-minute
  challenges, malformed attestation rejection, registration and replay
  rejection, duplicate exclusion/rejection, wrong-origin and unknown
  credential rejection, pending-session Passkey verification, counter
  advancement and regression rejection, stale-step-up denial followed by
  Passkey step-up, a second Passkey, wrong-password revoke denial, revoked
  credential rejection, TOTP disable with a Passkey remaining, sole-Passkey
  revoke denial, Passkey-only sign-in, and security-event counts;
- the previous 100-check TOTP/recovery/RBAC E2E was rerun cleanly after the
  Passkey and route-level same-origin changes.

The unified-login retirement then passed on 2026-11-04:

- `npm test` — **67/67**, including startup tests proving
  `ADMIN_PASSWORD`/`ADMIN_TOTP_SECRET` are no longer required while
  `ADMIN_SESSION_SECRET` remains mandatory, plus database-cookie health
  checks;
- TypeScript, ESLint, Drizzle check, production build, and diff check
  passed; the build route list contains no `/api/admin/login` or
  `/api/admin/logout`, and source has no `@/backend/admin` imports;
- a clean isolated real-Chromium suite (run `mw1igihsfd0f0f69`, fresh
  disposable database, dedicated synthetic Super Admin + Analyst) passed
  **66/66 checks**: one official sign-in form; identical generic failure
  for unknown email vs wrong password; unauthenticated and MFA-pending
  API denial; mandatory TOTP enrollment (QR + manual key, wrong current
  password and wrong first/enrolled code rejected); recovery-code
  issuance, acknowledgement, and login; Passkey registration/login via a
  Chromium CDP virtual authenticator; Analyst MFA completion followed by
  dashboard/API RBAC denial; session revocation; session expiration;
  retired legacy routes returning 404; mobile sign-in rendering; zero
  unexpected page errors. Final synthetic DB state before drop: 2 admins
  (1 Super Admin, 1 Analyst), 2 TOTP-enrolled, 1 Passkey owner, 6
  sessions (4 revoked, 1 expired). All seven disposable E2E databases
  were dropped afterwards;
- the actual local preview was restarted with the retired variables
  removed from local `.env.local`: health 200, legacy login/logout 404,
  unauthenticated admin data/identity 401, and browser checks for
  `/admin` and `/admin/security` landed on `/admin/sign-in` with no
  legacy fields;
- on 2026-11-04 the sandbox was reset and the whole local stack was
  rebuilt from source (fresh dependencies, local PostgreSQL, regenerated
  local-only secrets, empty-database bootstrap verifying 24 tables/RLS/
  grants/writes, 67/67 tests, typecheck, lint, schema check, production
  build). Fresh probes repeated health 200, retired routes 404, and
  protected APIs 401. The earlier disposable local owner account did not
  survive the sandbox reset — it was local-only and production was never
  involved — so local first-owner setup must be repeated before the
  owner's local enrollment can be verified. No production data, env, or
  deployment changed at any point.

Still not verified: the owner's own completed local MFA enrollment,
a physical platform/roaming Passkey ceremony, staging evidence, a
production recovery drill, and hosted backup/PITR. The Chromium CDP
virtual authenticator is not physical-device evidence.

The disposable E2Es cleared only their own local rate-limit/lockout tables
between legitimate browser journeys because all loopback traffic shares the
conservative unknown-IP bucket. They therefore do not validate production
rate limiting. Embedded PostgreSQL also does not prove `docker-compose.yml`,
production email delivery, or a physical browser/device ceremony. The
software authenticator proves the server/API WebAuthn protocol path; the
owner still needs to complete one real device Passkey registration/sign-in
on preview/staging before production approval.

## Production rollout outline for later approval

No step below has been performed for Phase 2A or Phase 2B:

1. Verify backup/PITR and make a restore-tested manual backup if needed.
2. Set a dedicated production `ADMIN_MFA_ENCRYPTION_SECRET` (or explicitly
   decide to derive from `ADMIN_SESSION_SECRET`) before any production MFA
   enrollment. Back it up as production key material; do not rotate it as an
   ordinary env cleanup.
3. Apply `20261104_admin_identity_foundation.sql`, then
   `20261105_admin_mfa_session_state.sql`, then
   `20261106_admin_passkey_challenges.sql`, to staging. Repeat setup,
   invitation, pending denial, TOTP/Passkey enrollment, replay, wrong-origin,
   counter, recovery, stale step-up, reset, role/status revocation, and
   rollback tests with dedicated staging accounts. Complete at least one
   physical browser/device Passkey registration and second sign-in on the
   staging hostname.
4. Ship the matching code through the normal PR, CI, explicit approval, and
   merge process.
5. Apply the same reviewed SQL files, in order, to production in their
   transactions.
6. On a trusted operator machine, use a private, uncommitted production env
   file containing the production database/app/email settings and run:

   ```bash
   node --env-file=.env.production.local scripts/admin-bootstrap-owner.mjs --email=<owner-email> --yes
   ```

   The `--yes` flag is an explicit remote-database guard. The command emails
   the link to the owner and does not print it.
7. The owner opens the email, creates the password, signs in, enrolls an
   authenticator, stores the password plus one-time recovery codes in a
   password manager/secure offline location, and then adds at least one
   production Passkey.
8. Verify a second sign-in with TOTP, a second sign-in with the production
   Passkey on both apex and www, and one recovery-code drill in staging
   before relying on recovery in production. The unified build has no legacy
   break-glass path. Keep the prior production build and its rollback-only
   environment values available until these checks and the production
   recovery drill pass; only then remove `ADMIN_PASSWORD` and
   `ADMIN_TOTP_SECRET` from production under a separate approved change.

Rollback remains: revert the code deployment. The additive identity tables,
`mfa_verified_at` column, widened counter, and challenge table can remain
unused after a code rollback. Do not drop them during an incident without a
verified backup and separate approval.
