# YaarLink · theyaar.com — Simple marketing for everyone

Creator-marketing platform connecting brands, local businesses, creators and meme pages.
Next.js 16 · Tailwind CSS · PostgreSQL · Drizzle ORM · deployed on **Vercel** with **Supabase PostgreSQL**.

Layout: `app/` (routes) · `frontend/` (UI) · `backend/` (data + auth) · `shared/` (domain constants) · `config/` (site settings) · `docs/`.
See [`docs/STRUCTURE.md`](docs/STRUCTURE.md) for the full map and [`docs/DEPLOY_PUBLIC.md`](docs/DEPLOY_PUBLIC.md) for the production checklist.

> **Single deployment path:** Vercel is the only supported production host for this repository, and theyaar.com must use only the canonical `yaarlink-` Vercel project. Do not import the repository into a second Vercel project or deploy it from another hosting configuration; use the canonical project's Preview deployments for branches/PRs. Keeping one project avoids divergent environment variables, database integrations, client-IP trust, and security-header behavior.

---

## What you need

| Account | What it's for |
|---|---|
| [GitHub](https://github.com) | Stores your code |
| [Vercel](https://vercel.com) | Builds and runs the Next.js application |
| [Supabase](https://supabase.com) | Hosts the PostgreSQL database |
| [Resend](https://resend.com) | Sends verification and account email |
| [Node.js 22 LTS](https://nodejs.org) | Runs local setup commands |

---

## 1 · Get the code onto your computer and GitHub

Download the project, unzip it into a folder called `yaarlink`, open a terminal in that folder, then:

```bash
npm ci
git init
git add .
git commit -m "YaarLink launch"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/yaarlink.git
git push -u origin main
```

(`.gitignore` keeps secrets like `.env` and build folders off GitHub.)

## 2 · Create and configure the Supabase database

1. In Supabase, create a project in the region closest to your users.
2. Download the server root certificate from **Database settings → SSL Configuration**. You need it for verified TLS; downloading it alone is not enough—the app must be configured to use it.
3. For a **brand-new, empty database only**, copy the **Direct connection** string (or the **Session pooler** string if your computer's network is IPv4-only), make sure it uses `sslmode=verify-full`, append `&sslrootcert=/absolute/path/to/the/downloaded-certificate.crt`, store it only in your local shell as `PROVISIONING_DATABASE_URL`, and run the tracked Drizzle baseline:

```bash
npm run db:check
npm run db:bootstrap
```

You should see `Database bootstrap verified: 16 tables, RLS enabled, app-role grants checked.` This creates the schema, enables RLS on every application table, creates the least-privilege `yaarlink_app` role/policies/grants, and refuses to treat an existing unjournalled database as an empty one. Do not use `drizzle-kit push` for initial provisioning; a schema push does not apply the role/RLS migration.

   The newly created `yaarlink_app` role is intentionally `NOLOGIN` with no password in source control. Before deploying, use a privileged database-provider session to give that role a unique password and `LOGIN`; never put that password in Git, shell history shared with others, an issue, or chat.

4. For the running application, use the **Transaction pooler** connection string **for the `yaarlink_app` role** and set/replace its SSL mode with `sslmode=verify-full`. This becomes `DATABASE_URL`. Do not use the database-owner/`postgres` role as the runtime application user.
5. On Vercel, set `DATABASE_CA_CERT` to the complete downloaded PEM certificate, including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`. The application passes that CA to node-postgres with hostname verification enabled.

Never use `sslmode=no-verify`, `disable`, `prefer`, `require`, or `verify-ca` for a remote database. Without a configured CA, the application rejects those modes instead of accepting an unverified connection. When `DATABASE_CA_CERT` is set, the application strips the URL's SSL-mode parameters and verifies the certificate chain and hostname against that CA, so a legacy weaker mode cannot downgrade the actual connection; new URLs should still use `verify-full` explicitly.

## 3 · Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import the GitHub repository.
2. Use the **Next.js** framework preset and the repository root as the Root Directory.
3. Set:
   - Install Command: `npm ci`
   - Build Command: `npm run build`
   - Output Directory: leave as the Next.js default (do not set a custom `dist`, `out`, or other adapter output)
   - Production Branch: `main`
4. In **Settings → Environment Variables**, add these server-side values for Production:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase Transaction pooler URL with `sslmode=verify-full` |
| `DATABASE_CA_CERT` | Complete Supabase root-certificate PEM downloaded in step 2 |
| `SESSION_SECRET` | Fresh output from `openssl rand -hex 32` |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender, e.g. `YaarLink <no-reply@theyaar.com>` |

Optional variables are documented in `.env.example`: `APP_URL`, `BOT_CHALLENGE_SECRET`, `HEALTH_DIAGNOSTIC_TOKEN`, `PWNED_PASSWORDS_RANGE_URL`, and `SLOW_QUERY_THRESHOLD_MS`.


The server refuses to start when a required auth secret is missing, weak, copied from `.env.example`, or shared. The app needs no project-defined `NEXT_PUBLIC_*` variables, and the build fails if an unapproved or secret-like public variable name is configured. Signup also fails closed until the two email settings are present and the sending domain is verified in Resend.

5. Deploy. After this initial setup, every merge/push to `main` creates the next production deployment automatically. Pull requests get Vercel Preview deployments; do not point a Preview at the production database unless you intentionally want it to read/write production data.

**Tip — random secret:** `openssl rand -hex 32`

## 4 · Connect theyaar.com

1. In the Vercel project, open **Settings → Domains**.
2. Add `www.theyaar.com` and `theyaar.com`.
3. Add the DNS records Vercel shows at your DNS provider.
4. Keep `www.theyaar.com` as the primary/canonical domain and redirect the apex to it.

HTTPS certificates are provisioned by Vercel automatically.

## 5 · Check everything works

- `https://www.theyaar.com/api/health` → HTTP 200 with only `{"ok":true,"status":"ok","checkedAt":"…"}`. A failure returns HTTP 503 with `"status":"degraded"`. Detailed schema/pool diagnostics require `HEALTH_DIAGNOSTIC_TOKEN` in an `Authorization: Bearer …` header; keep the token out of URLs.
- A page response includes an enforcing `Content-Security-Policy` header (not `Content-Security-Policy-Report-Only`) and a `Reporting-Endpoints` header
- Sign up as a brand → verify the emailed link → create a campaign → it appears on your dashboard with the budget 🔒
- Sign up as a creator (another email) → verify the emailed link → apply to the campaign → the brand sees it on their dashboard
- Contact page → WhatsApp / Call / Email / Instagram all open on your phone

Logs: Vercel → your project → **Logs**. Application errors are one-line JSON with `level`, a stable `event`, `route`/`component`, and `requestId`; the same request ID is returned in the `x-request-id` response header. CSP violations use the `security.csp_report` event after being sanitized by `/api/security/csp-report`. A malformed public contact/social entry in `config/site.ts` produces a `startup.site_configuration_warning` with field/code pairs only (never the values), and the affected link builder returns no link instead of a broken one. See [`docs/OBSERVABILITY.md`](./docs/OBSERVABILITY.md) for slow-query logging, external log-drain setup, and uptime-monitor configuration.

---

## Things only you control

| What | Where |
|---|---|
| Phone, WhatsApp, email, Instagram, city, domain | `config/site.ts` |
| English / Hindi / Punjabi text | `frontend/i18n/locales/en.ts`, `hi.ts`, and `pa.ts` |
| Categories, languages, formats | `shared/constants.ts` |
| Colours, fonts, animations | `app/globals.css` |

**Update the live site:** merge or push to `main`; Vercel deploys automatically.

**Changed `backend/db/schema.ts`?** Generate and review a tracked migration under `backend/db/drizzle/` (`npm run db:generate`, then `npm run db:check`) and test it through the empty-database bootstrap before deploying application code that depends on it. For an existing production database, review the exact SQL/diff and satisfy the verified-backup gate in [`docs/BACKUP_AND_RECOVERY.md`](./docs/BACKUP_AND_RECOVERY.md) first; do not blindly push destructive schema changes or infer that a backup exists from migration success. The bootstrap script intentionally refuses an existing database that has application tables but no Drizzle migration journal, because that state requires a separately reviewed history-reconciliation/upgrade plan rather than replaying the empty-database baseline.

For an existing database that predates the data-model/reporting fields, run the reviewed transactional migration `backend/db/migrations/20261102_data_model_reporting.sql` before deploying code that expects it. Use the Direct/Session provisioning connection with verified TLS, for example `psql "$PROVISIONING_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/20261102_data_model_reporting.sql`, then verify `/api/health`. This migration also performs the historical listed-date, contact-source, brand-link, campaign-expiry, settings, and audit-table backfills that a schema-only push cannot reproduce. A brand-new database provisioned with `npm run db:bootstrap` does not need those legacy backfills.


---

## Run on your own computer

```bash
cp .env.example .env     # fill in DATABASE_URL and generate fresh auth secrets; placeholders refuse to start
nvm use                  # Node version pinned in .nvmrc; npm is pinned by packageManager in package.json
npm ci
npm run dev              # http://localhost:3000
```

For a remote Supabase database from local development, either set `DATABASE_CA_CERT` to the downloaded PEM or append `&sslrootcert=/absolute/path/to/prod-ca-2021.crt` to the local `DATABASE_URL`. A loopback PostgreSQL URL does not need remote-TLS settings.

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
npm run build
```

GitHub Actions runs the same checks and separately proves `npm run db:bootstrap:verify` against a disposable PostgreSQL service.

---

## How it's built (for future developers)

- **Login:** signed, httpOnly cookie (`backend/auth.ts`). Passwords are hashed with PBKDF2 via Web Crypto.
- **Privacy:** budgets, phone numbers and applications are never in public APIs. Brands see only their own campaigns + applications (`/api/me/dashboard`); private records remain available only through authenticated account APIs.
- **Database:** `backend/db/index.ts` uses one shared node-postgres pool per warm Node/Vercel instance, with an explicit size/timeout policy and an idle-client error handler. `backend/db/connection-config.ts` fails closed when a remote database URL does not require verified TLS. `/api/health` internally verifies connectivity and required tables/columns, but anonymous callers receive only overall status; the detailed checks and pool counters require diagnostic bearer-token authorization.
- **Security headers:** `proxy.ts` generates a per-request CSP nonce so the enforcing policy can allow Next.js bootstrap/RSC scripts without `unsafe-inline`; the root layout renders dynamically for that nonce. Static security headers live in `next.config.ts`, and sanitized CSP reports are collected at `/api/security/csp-report`.
- **Observability:** `proxy.ts` establishes `x-request-id`; `shared/observability.ts` emits bounded, redacted JSON logs; `instrumentation.ts` handles unhandled server errors; and the pooled database client logs slow queries as duration/operation/hash-only fingerprints. External drains and uptime alerting remain owner-configured integrations, as documented in `docs/OBSERVABILITY.md`.
