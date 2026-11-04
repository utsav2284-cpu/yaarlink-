# YaarLink Super Admin — Phase 0 discovery and delivery plan

Status date: 2026-11-03  
Workspace branch: `arena/9b3c6e40-yaarlink` (the fixed Arena session branch for this work)

This document records what actually exists before the Super Admin Control
Center is expanded phase by phase. It is not a claim that all 42 requested
modules are complete. Existing uncommitted Cloudflare/Netlify repository
cleanup in `.gitignore`, `eslint.config.mjs`, `README.md`, and
`docs/DEPLOY_PUBLIC.md` was preserved when this work began.

## Executive conclusion

YaarLink already has a real owner-only administration system at `/admin`.
It is connected to production backend routes and PostgreSQL and already covers
the most important day-to-day marketplace controls: creator/campaign review,
reports, applications, contacts, users, brands, platform campaign-expiry
settings, security audit logs, domain activity history, search/filter/sort,
cursor pagination, and CSV export.

The correct next step is **not** to replace it with a generic dashboard or a
second admin application. The safest path is to evolve the existing admin in
small vertical slices, keep Vercel + Supabase PostgreSQL + Resend, and add
new data models only when a workflow truly needs them.

Implemented as the first new vertical slice in this branch:

- database-backed **Website Online / Maintenance / Emergency Offline** control
  using the existing `settings` table (no schema change);
- scheduled start/end windows and a custom visitor message;
- admin, health, CSP-report, logout and static-asset exemptions so the owner
  cannot lock themselves out;
- direct “view live page” links from admin campaign/creator rows, shown only
  when the same public eligibility conditions are met;
- a local offline development foundation (Docker PostgreSQL plus local email
  and password-breach range stubs) documented in
  `docs/LOCAL_OFFLINE_DEVELOPMENT.md`;
- Phase 2A database-backed administrator identity: restricted first-owner
  setup, individual hashed passwords, RBAC, invitations, revocable sessions,
  password change/reset, and security events. It is locally end-to-end tested
  but not deployed; see `docs/ADMIN_IDENTITY.md`;
- Phase 2B mandatory authenticator and Passkey MFA: encrypted per-admin TOTP
  secrets, replay counters, hashed one-time recovery codes, WebAuthn
  registration/assertions with hashed one-time challenges and signature
  counters, pending/verified session states, and 15-minute step-up for
  sensitive identity actions. A clean 100-check TOTP/recovery regression and
  an 88-check software-authenticator Passkey E2E passed locally; physical
  device, staging, recovery-drill, and production rollout evidence remain.
  The 13-stage status ledger is `docs/SUPER_ADMIN_PROGRESS.md`, and the
  governing Parts/Modules/Phases/Releases tracker is
  `docs/YAARLINK_MASTER_PROGRESS.md`.

## Current architecture

| Area | Existing implementation |
|---|---|
| Web app | Next.js 16.4.3 App Router, React 19, TypeScript |
| Styling/design | Tailwind CSS 4 with YaarLink source-owned components and local fonts |
| API | Next.js route handlers under `app/api/**`; reusable server logic in `backend/**` |
| Database | PostgreSQL through Drizzle ORM and `pg`; production is Supabase PostgreSQL |
| Hosting | Vercel project `yaarlink-`; Vercel + Supabase is the only supported production path |
| User auth | Application accounts, PBKDF2/bcrypt-compatible password verification, signed cookies, database-backed revocable user sessions |
| Admin auth | Separate owner password, distinct signing secret, HttpOnly/Secure/SameSite=Strict cookie, database session-version revocation, rate limit/lockout, optional replay-resistant TOTP |
| Email | Resend HTTPS API through `backend/email.ts` |
| Public abuse controls | Bot challenge, database-backed rate limits, auth lockouts, content checks |
| Password safety | Shared creation policy, local denylist/context checks, HIBP k-anonymity range check |
| Observability | Redacted structured logs, request IDs, slow-query fingerprints, public/privileged health split |
| Tests | Node test suite, ESLint, TypeScript, production build, empty-PostgreSQL bootstrap verification in CI |

There is currently **no** in-app payment processor, payment ledger, uploaded
file/media storage, background job system, external analytics product, CRM
pipeline table, CMS table, push/SMS provider, or WhatsApp API integration.
The public product copy correctly states that fees/payments are agreed
directly off-platform; the admin must not pretend otherwise.

## Existing administration inventory

Primary files:

- `app/admin/page.tsx` — owner login and the current tabbed admin workspace;
- `app/api/admin/login/route.ts` and `app/api/admin/logout/route.ts`;
- `app/api/admin/data/route.ts` — authenticated, searchable, filtered,
  sorted, cursor-paginated admin collections and CSV export;
- `app/api/admin/moderation/route.ts` — authenticated transactional actions;
- `backend/admin.ts` — password/TOTP/session security;
- `backend/admin-audit.ts` — append-only admin security log writer;
- `backend/audit-events.ts` — marketplace-domain history writer;
- `backend/platform-settings.ts` — campaign expiry policy;
- `backend/site-availability.ts` — new website availability settings/cache;
- `shared/site-availability.ts` — pure availability parsing/effective-window
  and path-exemption rules with unit tests.

Already working with real data:

- exact total counts for users, brands, campaigns, creators, applications,
  contacts, pending reviews, open reports, expired campaigns and activity;
- campaign review/approve/reject/suspend/close/delete with verification
  code, verified status, moderation note, deadline/expiry handling and audit;
- creator review/approve/reject/suspend/delete with verified follower count,
  verification code/status, moderation note and audit;
- reports with resolve/dismiss/reopen plus target suspension actions;
- applications with campaign/creator context, proposal information, profile
  snapshot, status history and spam deletion;
- contact enquiries with call/WhatsApp/email links and spam deletion;
- users with role, email-verification state, linked brand/creator status,
  campaign/application counts, active-session count and session revocation;
- brands with linked account, campaign/application counts, contact sync and
  session revocation;
- security audit logs and domain activity events;
- campaign default/maximum expiry settings;
- filtered CSV export with spreadsheet-formula neutralization and audit.

Important limitations of the current UI/architecture:

- one very large client component and two large admin route files make future
  modules harder to review; new work should be extracted incrementally, not
  rewritten in one risky operation;
- no sidebar/overview route split yet—the current admin is one tabbed page;
- statistics are current totals, not time-series analytics;
- contacts are messages, not a full CRM pipeline;
- applications support marketplace decisions, but there is no deliverable,
  proof-of-post, dispute or execution workspace data model;
- no admin notification inbox, task system, content manager, feature-flag UI,
  incident register, backup-status integration or finance ledger.

## Database relationship map

Current application tables in `backend/db/schema.ts`:

| Table | Purpose / key relationships |
|---|---|
| `users` | Canonical account identity; role is `brand` or `creator`; owns sessions, brand/creator profile, campaigns and applications |
| `pending_signups` | Holds unverified signups and hashed verification token until inbox ownership is proven |
| `account_tokens` | Hashed one-time password-reset/email-verification/email-change tokens by user and purpose |
| `user_sessions` | Server-side revocable browser/device sessions for users |
| `brands` | One brand profile per user; campaigns optionally link back to it |
| `creators` | One creator profile per user; review and verification state controls public eligibility |
| `campaigns` | Owned by a user, optionally linked to their brand; review/verification/expiry controls public eligibility |
| `applications` | Creator user + creator profile + campaign, with unique campaign/user pair and composite creator ownership FK |
| `notifications` | User-facing application notifications only; not an admin notification center |
| `contacts` | Public contact/enquiries (`brand`, `creator`, `other`) |
| `reports` | Campaign/creator reports with open/resolved/dismissed state |
| `settings` | Non-secret key/value settings: campaign expiry, admin session version/TOTP replay counter, website availability |
| `admin_audit_logs` | Admin login/logout/moderation/export security history; runtime role has SELECT/INSERT only |
| `audit_events` | Marketplace field/status history without copying sensitive values; runtime DELETE denied |
| `rate_limit_buckets` | Hashed shared rate-limit keys |
| `auth_failure_lockouts` | Hashed failed-auth lockout keys |

Public visibility is fail-closed in `backend/public-listings.ts`:

- campaigns: `status=open`, `verificationStatus=verified`, not expired;
- creators: `status=approved`, `verificationStatus=verified`, complete
  category/taxonomy/link/follower validation.

The empty-database baseline enables RLS on application tables and grants the
runtime `yaarlink_app` role only the privileges it needs. Audit history is
append/read constrained. Any new admin tables must follow the same pattern.

## Security foundation: verified state and gaps

Already present:

- startup validation of required signing secrets and admin password;
- separate admin session secret and one-day signed admin cookie;
- optional TOTP with atomic counter replay protection;
- admin login rate limiting and progressive lockout;
- database-backed admin session-version revocation on logout;
- DB-backed user sessions and token-version backstop;
- proxy CSRF/origin checks for state-changing APIs;
- strict document CSP with nonce and API deny-all CSP;
- security headers, redacted logs, request correlation and health split;
- server-side object ownership checks in marketplace routes;
- append-constrained audit storage and RLS/least-privilege DB grants;
- no passwords/session tokens returned by admin data queries.

Priority gaps against the requested enterprise model:

1. **Shared owner credential model in production.** Phase 2A now implements
   individual administrator identity and fixed RBAC locally, but production
   still uses the legacy shared credential until the migration and deployment
   gates are completed. The legacy path remains only as transitional
   break-glass access; no second person should receive it.
2. **Production MFA is still transitional.** The legacy login's TOTP is
   mandatory only after `ADMIN_TOTP_SECRET` is configured and enrolled. The
   new database identity path now mandates per-admin TOTP/recovery locally,
   but production does not receive that protection until the gated identity
   migration/deployment and first-owner enrollment are completed.
3. **No account suspension state.** `users` has no suspended/restricted
   status and `brands.status` is constrained to `active`. User suspension,
   reactivation and restriction history need a backward-compatible migration.
4. **Advanced MFA is not production-complete yet.** Phase 2B implements and
   locally validates TOTP/recovery enrollment, WebAuthn Passkey
   registration/assertions, mandatory pending-session gating, replay and
   counter protection, credential revocation, and step-up verification. The
   physical-device test, production recovery drill, dual-approval decisions,
   and break-glass retirement remain release work. *(Update 2026-11-04: the
   legacy shared-password login has since been retired locally — the
   database-backed `/admin/sign-in` is the only administrator login in this
   branch, browser-tested 66/66. Production retirement, the physical-device
   test, and the recovery drill remain release work.)*
5. **Hosted backup/PITR is not verified.** See
   `docs/BACKUP_AND_RECOVERY.md`. No production DDL should run until the
   owner completes the recorded backup check or creates/restore-tests a
   manual backup.
6. **External account hygiene remains owner-side.** GitHub secret scanning/
   push protection and disconnecting unused third-party GitHub deployment
   apps cannot be completed from repository code.

## Recommended target architecture

Keep one Next.js application and one PostgreSQL database. Continue this
layering for every new module:

1. **Pure domain rules** in `shared/**` where browser/server/test reuse is
   useful.
2. **Backend services** in `backend/**` for validation, permissions,
   transactions, audit and database access.
3. **Thin route handlers** in `app/api/**` for HTTP request/response shaping.
4. **Focused admin UI components** extracted incrementally from
   `app/admin/page.tsx` into `frontend/components/admin/**` as modules are
   touched.
5. **Database constraints/indexes/RLS/grants** added with every new table in
   a reviewed, transactional, idempotent migration.

Do not add a separate admin backend, a public creator directory, a payment
processor, or file upload/storage vendor until the product decision and
security model for that workflow are explicit.

## Delivery roadmap

### Phase 0 — Discovery (this document)

- architecture, database, API, security and feature inventory;
- preserve existing work and identify blockers.

### Phase 1 — Safety and local foundation

- local offline PostgreSQL and service stubs;
- baseline validation commands (`lint`, `typecheck`, `test`, `db:check`,
  `build`);
- owner backup/PITR verification remains the production-DDL gate;
- rollback remains: revert the feature commit/PR; no production data is
  changed by local tooling.

### Phase 2A — Administrator identity foundation (local implementation complete)

- individual `admin_users`, fixed roles/permissions, hashed one-time tokens,
  and database-backed administrator sessions;
- restricted CLI first-owner setup and invitation-only account creation with
  no public registration or default password;
- administrator password change/reset, role/status management, session
  revocation, last-Super-Admin protection, and actor-attributed security
  history;
- server-side permission helpers; the legacy owner-level marketplace routes
  remain restricted to the legacy owner or a database Super Admin until they
  are split by module;
- disposable-PostgreSQL empty-bootstrap, production-upgrade, and local HTTP
  end-to-end evidence recorded in `docs/ADMIN_IDENTITY.md`.

Production migration/deployment still requires the backup gate and explicit
approval.

### Phase 2B — TOTP/recovery and Passkey MFA (local implementation complete)

- 10-minute MFA-pending database sessions and 12-hour verified absolute cap;
- authenticator enrolment/verification with AES-256-GCM encrypted secrets
  and persisted counter replay protection;
- ten server-peppered hashed one-time recovery codes, regeneration, and
  sole-method disable protection;
- WebAuthn Passkey registration/login and credential revocation with
  maintained libraries, hashed one-time challenges, required user
  verification, RP/origin checks, and signature-counter protection;
- mandatory MFA for database identity sessions and 15-minute step-up for
  password/account-critical changes;
- disposable PostgreSQL/API evidence: a clean 100-check TOTP/recovery
  regression plus an 88-check ES256 software-authenticator Passkey E2E.

### Phase 2B remaining — release hardening

- physical browser/device Passkey evidence on preview/staging and, after
  approval, production apex/www;
- recovery drill, then a separately reviewed legacy break-glass cutover;
- user suspension/restriction state and enforcement in login/session/listing
  paths;
- broader negative authorization tests for anonymous, brand, creator and each
  admin role across split module routes.

### Phase 3 — Core admin completion

- split admin shell into overview + module navigation without changing data
  contracts unnecessarily;
- richer overview: pending work, recent registrations/actions, availability,
  health summary and unavailable-vs-zero metric states;
- campaign pause/resume/feature/priority only if the public ordering model
  adopts those fields;
- request-more-information and richer case notes where they do not duplicate
  moderation notes/activity history.

The website availability slice from this phase is implemented now because it
needed no schema change.

### Phase 4 — Business operations

- CRM status/assignment/follow-up model for contacts and brand enquiries;
- private creator matching filters/shortlists and recommendation history;
- campaign execution deliverables/proof/completion/dispute workflow;
- communication history based on actual email events;
- manual finance ledger only for real off-platform managed engagements,
  clearly labelled manual; no fake payment processing.

### Phase 5 — Operations and intelligence

- real registration/campaign/application time-series from existing tables;
- admin notification inbox derived from persisted events;
- privacy-request register and export/retention workflows;
- backup/incident/security registers with real status, not fake scores;
- system health expansion only for signals the app can actually verify.

### Phase 6–8 — Hardening, quality and release

- role-based negative tests, DB permission tests and API authorization tests;
- responsive/accessibility/performance passes;
- production migration/deployment/rollback checklist per release;
- no production deployment without the normal PR review, CI and explicit
  ship approval.

## Module relevance decisions

- **Payments (20/32):** do not build checkout/escrow now. YaarLink's actual
  public model is direct off-platform payment. A restricted manual ledger
  can be considered later for written managed engagements.
- **Uploads (30):** do not add uploads until a concrete workflow needs them.
  When added, private storage, content sniffing, size limits, quarantine and
  signed access are mandatory.
- **Homepage CMS (5):** valuable later, but featured creators/campaigns must
  preserve the same fail-closed public eligibility rules and revision
  history. Do not make arbitrary homepage HTML editable.
- **Analytics (8):** build from database timestamps/statuses already present;
  do not invent engagement/conversion metrics the product does not collect.
- **Security Operations (26/36/37):** start with real auth/audit/health data
  and manual incident records; do not display a fabricated security score.
- **Bulk operations (25):** defer until individual-action RBAC, preview,
  audit and failure reporting are strong enough.

## Local offline decision

For YaarLink, the best local setup is the **same Next.js app** with:

- local PostgreSQL 17 in Docker;
- the existing empty-database bootstrap and least-privilege app role;
- local-only Resend-compatible email capture;
- a local-only HIBP-range-shaped stub so password flows can run without
  internet (it is not a real breach check);
- `.env.local` secrets generated locally and never reused in production.

After `npm ci` and the first Docker image pull, development and admin testing
can run without internet. Production data must not be copied into this local
environment; use synthetic test accounts/data.

See `docs/LOCAL_OFFLINE_DEVELOPMENT.md` for exact commands and limitations.
