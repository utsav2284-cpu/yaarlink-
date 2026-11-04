# YaarLink local offline development

This is the recommended way to run and test YaarLink—including `/admin`—on
your own laptop without touching production data.

It uses the same Next.js application and PostgreSQL schema as production,
but every service is local:

- PostgreSQL 17 in Docker, bound only to `127.0.0.1`;
- the existing empty-database bootstrap and least-privilege `yaarlink_app`
  runtime role;
- a local Resend-compatible email capture service;
- a local password-breach *range-shape* stub for offline password-flow
  testing (not a real breach database);
- synthetic local accounts/data only.

> Never point a local checkout at the production database for admin testing.
> Never reuse production passwords, session secrets, Resend keys or TOTP
> secrets locally.

## One-time prerequisites

Install:

- Node.js version from `.nvmrc` (Node 22 line) and npm 10.9+;
- Docker Desktop or Docker Engine with Docker Compose;
- OpenSSL (or another secure random generator) for local signing secrets.

The first `npm ci` and first Docker image pull need internet. After that,
the local app/database/email-stub workflow can run offline.

## 1. Install dependencies

```bash
npm ci
```

## 2. Create local environment values

Copy the template:

```bash
cp .env.local.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

Open `.env.local` and replace:

- `SESSION_SECRET` with fresh output from `openssl rand -hex 32`;
- `ADMIN_SESSION_SECRET` with a different fresh output from
  `openssl rand -hex 32`.

There is no shared local administrator password variable. The local first
owner is an individual database account created through the restricted setup
flow below.

Keep the local database URLs and local stub URLs from the template. The file
is ignored by Git.

## 3. Start local PostgreSQL

```bash
npm run local:db:up
```

Wait until the database is healthy:

```bash
docker compose ps
```

The Compose file binds PostgreSQL only to `127.0.0.1:5432`. Its credentials
are disposable local-development values and must not be used anywhere else.

## 4. Bootstrap the empty local database

```bash
npm run local:bootstrap
```

This runs the reviewed Drizzle empty-database baseline with write/grant/RLS
verification. It uses `BOOTSTRAP_DATABASE_URL` from `.env.local`; the app
itself uses the restricted `DATABASE_URL` account.

Do not run the empty-database bootstrap against production. It deliberately
refuses an existing application schema without a Drizzle migration journal.

## 5. Start local email/password-flow stubs

In a second terminal:

```bash
npm run local:services
```

This listens only on `127.0.0.1:4025` and provides:

- `POST /emails` for the existing Resend transport;
- `GET /range/<5 hex chars>` for offline password creation/change flows;
- `GET /health` for a quick local check.

Captured test emails are appended to `.local/email-outbox.jsonl`, which is
ignored by Git. Open verification/reset links from that file in your local
browser. Treat it as sensitive test data and delete it when finished.

The local range stub returns a non-breach padding response. It exists only
to exercise offline flows; local password acceptance is therefore **not**
evidence that a password passed the real production breach corpus.

## 6. Start the app

In a third terminal:

```bash
npm run dev
```

Open:

- public site: <http://localhost:3000>
- administrator sign-in: <http://localhost:3000/admin/sign-in>
- health: <http://localhost:3000/api/health>

Sign in with an individual local administrator account. A correct password
creates only a pending session and continues to `/admin/security` for
mandatory TOTP/Passkey enrollment or verification; `/admin` itself never
shows a shared-password form. Individual administrator accounts create their
own encrypted TOTP secrets through `/admin/security`; optionally set a
distinct local-only `ADMIN_MFA_ENCRYPTION_SECRET`, or leave it blank to derive
the local MFA key from the local `ADMIN_SESSION_SECRET`. Never copy a
production administrator password, MFA key, TOTP secret, or recovery code into
the local database.

## Test database-backed administrator accounts

The local bootstrap now creates the administrator-identity tables. To test
the restricted first-owner flow without any production account:

```bash
npm run admin:bootstrap-owner -- --email=owner@example.test
```

The command sends the one-time link through the local email stub and does not
print it. Open the captured local message in `.local/email-outbox.jsonl`,
create a synthetic local Super Admin password, then test:

- administrator sign-in: <http://localhost:3000/admin/sign-in>
- mandatory authenticator enrollment and recovery codes:
  <http://localhost:3000/admin/security>
- account, password, session, invitation, and role management on the same
  security page after the current browser completes MFA;
- transitional Super Admin dashboard: <http://localhost:3000/admin>

After password sign-in, the local identity session is MFA-pending for only
10 minutes. Re-enter the synthetic password, scan the QR code or enter the
manual secret in an authenticator app under a clearly local label, confirm
the six-digit code, and save the ten recovery codes. Password/session/account
controls and dashboard data stay locked until enrollment or verification.
On later sign-ins, use a current TOTP code or one unused recovery code.
Sensitive actions may ask for another fresh code after 15 minutes.

Do not use the same authenticator entry or recovery codes as production.
They belong only to synthetic accounts in the local database.

See `docs/ADMIN_IDENTITY.md` for Phase 2A/2B-1 scope, validation evidence,
and production gates, and `docs/SUPER_ADMIN_PROGRESS.md` for the 13-stage
status ledger.

## 7. Create synthetic test data

Use the normal local UI:

1. Sign up a test brand and a test creator with clearly fake local details.
2. Open each verification link from `.local/email-outbox.jsonl`.
3. Complete the creator profile and submit a test campaign.
4. In `/admin`, send each item to review, copy its verification code, verify
   the linked test profile/business as you would in production, then approve.
5. Use the admin row’s live-page link to open the resulting local public
   creator/campaign page.
6. Test applications, reports, contacts, CSV export, session revocation and
   website availability with those synthetic records only.

Do not import a production dump into this environment for routine feature
testing.

## Website availability test

While signed in locally as admin:

1. Set **Website availability** to Maintenance and save.
2. In a private/incognito window, open `/`, `/campaigns`, `/creators` and
   `/login`; each should return the maintenance page with HTTP 503.
3. Confirm `/admin` still opens and `/api/health` still responds.
4. Set availability back to Online and confirm the public pages recover.
5. Repeat with a future start/end window to verify scheduled behavior.

Admin paths remain available by design. They still require the admin
password/TOTP and server-side session checks.

## Stop or reset local services

Stop containers without deleting local data:

```bash
npm run local:db:down
```

Delete the disposable local database volume only when you intentionally
want a clean local reset:

```bash
docker compose down -v
```

That command destroys only the local Docker volume named
`yaarlink_local_pgdata`; do not adapt it to any hosted database.

## Local checks before asking for a PR/ship

```bash
npm test
npm run lint
npm run typecheck
npm run db:check
npm run build
```

For a production-like local run after a build:

```bash
npm run build
npm run start
```

## Troubleshooting

- **Port 5432 is busy:** another local PostgreSQL is using it. Stop that
  service or change the Compose host port and both local DB URLs together.
- **Port 4025 is busy:** set `LOCAL_DEV_SERVICES_PORT` for
  `npm run local:services` and update both stub URLs in `.env.local`.
- **Administrator sign-in returns “not configured”:** `SESSION_SECRET` or
  `ADMIN_SESSION_SECRET` is missing/weak/shared, the local identity/MFA
  schema is absent, or the configured MFA encryption key is unsafe. The app
  intentionally fails closed.
- **Signup/reset email does not arrive:** confirm `npm run local:services`
  is running and check `.local/email-outbox.jsonl`.
- **Password creation returns unavailable offline:** confirm
  `PWNED_PASSWORDS_RANGE_URL=http://127.0.0.1:4025/range` in `.env.local` and
  that the local services process is running.
- **Database bootstrap refuses the target:** the local DB is not empty or
  does not look like the supported baseline. Inspect it; reset only the
  disposable local volume if appropriate.
