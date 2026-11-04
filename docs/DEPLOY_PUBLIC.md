# YaarLink — Public Deployment Checklist

Vercel + Supabase is the only supported production deployment path for this repository. Keeping one authoritative path prevents a second host configuration from drifting on environment variables, database TLS, client-IP trust, or security headers. Do not add another hosting adapter or a custom build-output directory; the standard Vercel Next.js build output is the deployable artifact. External deployment/check integrations are controlled from the provider and GitHub App settings, not from files in this repository; disconnect and remove repository access for any non-Vercel deployment integration that appears on pull requests.

### Canonical production project

For theyaar.com, the only authorized Vercel project is **`yaarlink-`** in the **`utsav-936a`** team. It is the project that owns `www.theyaar.com`, `theyaar.com`, and `yaarlink.vercel.app`. Use that same project's Preview deployments for branches and pull requests.

Do not import this repository into a second Vercel project—even as a temporary test or fallback. A duplicate project creates a second set of Git-triggered builds, generated URLs, integration connections, and environment variables that can silently diverge from production. If another project is discovered connected to this repository, pause it immediately, confirm it owns no custom domains, record only its project/integration identifiers and environment-variable **names** for the audit trail (never values), and delete it. Then verify that production still belongs to `yaarlink-` and `/api/health` is healthy.

The canonical database is Supabase PostgreSQL, reached by the application only through `DATABASE_URL` plus verified-TLS settings. A Neon integration, `NEON_*` variables, or an application project relying on integration-generated `POSTGRES_*` variables indicates infrastructure drift; the application code does not use those variables.

## 1. Database and verified TLS

For initial provisioning of a **new, empty database**, run the tracked Drizzle baseline once with the Supabase **Direct connection** string (or the **Session pooler** string from an IPv4-only network) before the first production deployment:

```bash
npm run db:check
npm run db:bootstrap
```

`PROVISIONING_DATABASE_URL` must be present only in the operator's shell/deployment secret store, use `sslmode=verify-full`, and include an `sslrootcert` pointing at the root certificate downloaded from Supabase **Database settings → SSL Configuration**. Never commit a database URL. Do not substitute `drizzle-kit push`: the bootstrap also applies/verifies the `yaarlink_app` role model, RLS enablement, policies, and least-privilege grants, and it refuses an existing unjournalled database.

The bootstrap creates a new `yaarlink_app` as `NOLOGIN` without a source-controlled password. Set its unique password and `LOGIN` attribute through an administrator/provider workflow before configuring the application. Do not record that password in this repository, a pull request, an issue, or chat.

For the deployed application:

- Set `DATABASE_URL` to the Supabase **Transaction pooler** connection string for the **`yaarlink_app` role**, with `sslmode=verify-full`; do not run the application as the database owner/`postgres` role.
- Set `DATABASE_CA_CERT` in Vercel to the complete downloaded Supabase root-certificate PEM, including the `BEGIN CERTIFICATE` and `END CERTIFICATE` lines.
- Alternatively, for a runtime that provides the certificate as a file, append `&sslrootcert=/absolute/path/to/prod-ca-2021.crt` to `DATABASE_URL` and leave `DATABASE_CA_CERT` unset.

Do not use `sslmode=no-verify`, `disable`, `prefer`, `require`, or `verify-ca` for a remote database. Without a configured CA, `backend/db/connection-config.ts` rejects those modes for remote hosts. When `DATABASE_CA_CERT` is set, the app strips the URL's SSL-mode parameters and passes that CA explicitly to node-postgres with `rejectUnauthorized: true`, so both the certificate chain and hostname are verified and a legacy weaker `sslmode` cannot downgrade the actual connection. New connection strings should still specify `verify-full` explicitly.

For an existing production database, review schema changes and satisfy the verified-backup gate in [`BACKUP_AND_RECOVERY.md`](./BACKUP_AND_RECOVERY.md) before applying them; do not blindly repeat the empty-database bootstrap or assume that a successful prior migration proves a backup exists. If it has application tables but no `drizzle.__drizzle_migrations` journal, the bootstrap will refuse to run; use a separately reviewed upgrade/history-reconciliation plan instead of deleting tables or fabricating journal rows. A database created before the data-model/reporting fields must instead run the reviewed transactional file `backend/db/migrations/20261102_data_model_reporting.sql` with the verified-TLS Direct/Session provisioning URL (for example, `psql "$PROVISIONING_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/20261102_data_model_reporting.sql`) before the matching application deployment. It includes historical listed-date, contact-source, brand-link, campaign-expiry, settings, and audit-table backfills that a schema-only push cannot reproduce; verify the commented read-only checks and `/api/health` afterward.

For a pre-constraint database that still contains a non-canonical creator platform (for example `cr.both`) or an application with `creator_id IS NULL`, apply `backend/db/migrations/20261103_legacy_listing_integrity_repair.sql` through the same verified-backup/provisioning process. The repair canonicalizes known platform aliases, relinks applications only to the applicant's own creator profile when that link is provable, and enforces the platform/NOT-NULL/foreign-key constraints. It does not moderate content: after running its commented public-row review queries, use Admin → Campaigns/Creators → Suspend/Reject/Delete for confirmed test/spam listings.

## 2. Required production environment variables

Set these as server-side Vercel environment variables for the Production environment:

- `DATABASE_URL`
- `DATABASE_CA_CERT` (required for Supabase unless `sslrootcert` is used instead)
- `SESSION_SECRET`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

> **Unified-login transition:** the retired `ADMIN_PASSWORD` and
> `ADMIN_TOTP_SECRET` values are not read by the unified-login code. Do not
> remove them from an existing production project until the unified build,
> identity/MFA migrations, first-owner creation, backup/PITR evidence, and a
> successful production sign-in + MFA + dashboard check have all been approved
> and verified. Until that point they are rollback-only configuration for the
> previous build. `ADMIN_SESSION_SECRET` remains mandatory because it signs
> the database-backed administrator session cookie; it is not an admin login
> password.

Configure Preview separately. Do not give Preview deployments the production database URL or production signing secrets unless you intentionally want previews to share production data and sessions.

The application requires **no project-defined `NEXT_PUBLIC_*` environment variables**. Never give a database URL, database password, service-role key, JWT secret, signing secret, API secret, or access token a `NEXT_PUBLIC_*` name: that prefix makes a value eligible to be inlined into a browser bundle if code ever references it. This applies even when the Vercel variable is marked Sensitive/Secret—the storage type does not make a browser-prefixed name safe.

`next.config.ts` enforces this before bundling by checking variable **names only**. Builds fail for unapproved or secret-like `NEXT_PUBLIC_*` names, including duplicated/re-prefixed integration aliases such as `NEXT_PUBLIC_SUPABASE_SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_SUPABASE_POSTGRES_URL_NON_POOLING`. Vercel's own `NEXT_PUBLIC_VERCEL_*` framework metadata is allowed unless its suffix is secret-like. The canonical Supabase integration's exact public identifier names—`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`—are tolerated as unused configuration only; do not reference them in browser code without a separate security review, including Supabase Row Level Security. Adding any other public name requires a reviewed code change to the allowlist in `backend/public-env.ts`.

Verify the `EMAIL_FROM` sending domain in Resend before deployment. Signup verification fails closed with HTTP 503 when either email setting is missing; it never falls back to creating an unverified account. `APP_URL` may optionally pin the public origin used in verification links.

Generate each signing secret independently with:

```bash
openssl rand -hex 32
```

Use different values for `SESSION_SECRET` and `ADMIN_SESSION_SECRET`. At server startup the app validates these signing secrets and refuses to start when a required value is missing, weak, copied from `.env.example`, or shared with another signing secret. Startup also validates the public origin/contact/social settings in `config/site.ts`; malformed entries emit a `startup.site_configuration_warning` containing only field/code pairs, and the corresponding link builders return no link rather than rendering a broken WhatsApp, email, or Instagram URL. Request-level fail-closed checks are also present: for example, a missing/weak/shared administrator signing secret makes the database administrator identity endpoints return HTTP 503 instead of sharing a signing key. Human passphrases are not accepted as signing secrets—use generated key material such as the OpenSSL output above.

Administrator MFA is individual and database-backed, not an environment-shared secret. Each administrator enrolls TOTP and/or a Passkey after password sign-in; recovery codes are stored only as hashes. Set a dedicated `ADMIN_MFA_ENCRYPTION_SECRET` before production MFA enrollment if possible, or explicitly accept the documented domain-separated derivation from `ADMIN_SESSION_SECRET`; do not change that key material casually after enrollment. The retired `ADMIN_TOTP_SECRET` is ignored by unified-login code.

Optional public-form challenge secret: generate `BOT_CHALLENGE_SECRET` separately and make it different from both session secrets. If unset, a validated `SESSION_SECRET` signs those short-lived, one-time challenges.

Optional health-diagnostic credential: public `/api/health` responses contain only `ok`, `status`, and `checkedAt`. Detailed database/schema/pool diagnostics require either a valid admin session or `HEALTH_DIAGNOSTIC_TOKEN` sent as an HTTPS `Authorization: Bearer …` header. Generate that token separately with `openssl rand -hex 32`; weak or reused values fail startup. Never put it in a URL—the historical `?diag=…` value is only a cache-buster and does not authorize diagnostics. Authorized diagnostic reads and rejected credentials are audit-logged (`health.diagnostics_accessed` / `health.diagnostics_rejected`) without recording the credential.

CSRF posture: session cookies are `HttpOnly; Secure; SameSite=Lax` (admin: `SameSite=Strict`), and the proxy additionally rejects state-changing `/api` requests whose browser `Origin`/`Referer` does not name this site or that the browser labels `Sec-Fetch-Site: cross-site` (HTTP 403, code `forbidden_origin`; see `shared/csrf.ts`). First-party pages are unaffected, non-browser clients without those headers still go through normal authentication and rate limiting, and the unauthenticated CSP-report endpoint is exempt because it changes no state. Do not add third-party embeds or cross-origin form posts to the API without revisiting this guard. As a repository-level complement, enable GitHub **secret scanning** and **push protection** (Settings → Code security) so a credential can never be committed by accident; both are free for public repositories.

Optional slow-query threshold: leave `SLOW_QUERY_THRESHOLD_MS` unset for 1000 ms, or set it between 50 and 60000 ms. See [`OBSERVABILITY.md`](./OBSERVABILITY.md) for the JSON log schema, request correlation, privacy boundary, external log-drain setup, and health/uptime alerting. A drain or uptime monitor is not active merely because this code is deployed; the project owner must configure and verify it in the chosen external service.

When a user creates or changes a password, the server checks it against known breached passwords through Have I Been Pwned's k-anonymity range API. Only the first five characters of the password's SHA-1 hash leave the server. If that check is unavailable, the password-setting request returns HTTP 503 instead of accepting an unchecked password. `PWNED_PASSWORDS_RANGE_URL` may point to a compatible HTTPS mirror; leave it unset for the public endpoint.

Client-IP trust has no environment switch. The rate limiter trusts client-IP headers only when Vercel itself is running the app (`VERCEL=1`, set by Vercel). In local development, requests share the conservative `unknown` bucket rather than trusting client-supplied forwarding headers.

After changing Vercel environment variables, create a new deployment so the running application picks up the new values.

## 3. Security behavior in this release

- Campaign creation requires an authenticated **brand** account.
- Creator profile creation requires an authenticated **creator** account.
- Campaign applications require an authenticated **creator** account.
- Dashboard ownership is based only on the authenticated user ID, never an email match.
- Administrator access uses an individual database account, an HttpOnly signed session cookie, mandatory MFA, and server-side RBAC; no administrator password or MFA secret is stored in browser storage.
- Login/signup/admin/public-write endpoints have request throttling. User and admin login also have database-backed failed-attempt lockouts with exponential backoff. A user-login lockout is keyed by the submitted normalized email whether or not an account exists, plus the client key.
- Wrong user credentials return HTTP 401 with the same body for an unknown email and a wrong password; unknown emails still run a dummy PBKDF2 verification so password work is not skipped.
- New passwords must be 6–256 Unicode characters with uppercase and lowercase letters, a number, and a symbol, and pass local predictable-password rules plus the breached-password check. Existing passwords are unaffected — login only verifies the stored hash. An authenticated password change keeps only the current device session (reissued at the new token version), revokes other sessions, and invalidates account action tokens.
- Signup returns one generic verification-required response for new, pending, and already registered addresses and sets no session cookie. User/profile rows are created only after the emailed one-time link and the signup password are verified.
- Session cookies are `__Host-`-prefixed and always `Secure`; logout revokes the session server-side.
- Administrator sessions are database-backed and individually revocable. A successful password creates only a short pending session; protected APIs stay locked until MFA enrollment/verification completes. Logout and password/MFA changes revoke sessions server-side according to the identity policy, and the dashboard clears loaded data from browser state.
- Administrator security events and moderation decisions are recorded in append-only audit/security tables; moderation audit rows carry the individual administrator actor when the route is authorized through the identity boundary.
- Public inputs have length/type/URL/email validation.
- Sensitive admin/dashboard responses are `no-store`.
- Public campaign/creator APIs do not expose private contact/budget fields.
- Remote PostgreSQL connections must use verified TLS with a trusted CA. Unverified modes are rejected when no CA is configured; when `DATABASE_CA_CERT` is configured, URL SSL-mode parameters are stripped and cannot downgrade verification.
- Documents receive an **enforcing** Content-Security-Policy from `proxy.ts`. A fresh per-request nonce plus `strict-dynamic` lets Next.js run its inline bootstrap/RSC scripts without adding `unsafe-inline` to `script-src`; the root layout therefore renders dynamically. The policy also sends violations to `/api/security/csp-report` through `Reporting-Endpoints`/`report-to`, with legacy `report-uri` as a fallback.
- The CSP report collector is rate-limited and body-size-bounded. It logs only sanitized fields: URL query strings/fragments, script samples, user agents, and the original policy (which contains the nonce) are intentionally omitted.
- Non-CSP security headers are static in `next.config.ts`. API responses additionally receive a deny-all CSP (`default-src 'none'; sandbox`) because they are data responses, not documents.

## 4. Deployment

Import the repository into Vercel as a Next.js project with the repository root as the Root Directory:

- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: Next.js default
- Production Branch: `main`

Install with `npm ci` so builds use the exact versions recorded in the tracked `package-lock.json`. Before promoting a production deployment, verify in Vercel's deployment output that the build completed successfully.

Before deploying, also confirm there is exactly one Vercel project connected to this GitHub repository: canonical `yaarlink-`. Check project **names, domains, and environment-variable names only**; do not open, copy, or log secret values during the audit. A second connected project, a Neon resource, or any non-allowlisted `NEXT_PUBLIC_*` name is a release blocker until the drift is removed.

After deployment, check:

1. Public `/api/health` returns HTTP 200 with only `{"ok":true,"status":"ok","checkedAt":"…"}`. HTTP 503/`"status":"degraded"` means the database connection or required schema check failed. Use an admin session or the optional bearer diagnostic token when detailed checks/pool counters are needed; an invalid Authorization header returns HTTP 401.
2. A document response has `Content-Security-Policy` and `Reporting-Endpoints`, and does **not** rely on `Content-Security-Policy-Report-Only`.
3. Pages hydrate and forms work with no CSP errors in the browser console.
4. Vercel logs show no database TLS/configuration errors. Operational records are JSON; sanitized CSP violations, if any, use `"event":"security.csp_report"`, and responses include the matching `x-request-id` header.

Add `www.theyaar.com` and `theyaar.com` under Vercel **Settings → Domains**, publish the DNS records Vercel provides, and keep `www` as the canonical host.

## 5. Admin

Open `/admin/sign-in` and sign in with the administrator's own registered email and individual password. A correct password creates only a short pending session and sends the administrator to `/admin/security`: an unenrolled administrator must enroll TOTP (QR/manual key plus first-code confirmation) or another supported factor, while an enrolled administrator must verify with TOTP, a recovery code, or a Passkey. Only then does server-side RBAC allow the relevant dashboard/APIs. Visiting `/admin` without a fully verified authorized session redirects to the official sign-in or MFA stage; it never presents a shared-password form.

There is no public administrator registration or shared owner password. Create the first owner only through the restricted setup process in [`ADMIN_IDENTITY.md`](./ADMIN_IDENTITY.md), then invite additional administrators individually. Ordinary marketplace signup never grants administrator access.

## 6. Important operational recommendation

The application limiter and failed-login lockouts are shared through PostgreSQL, so limits do not reset merely because a request reaches a different Vercel function instance. For volumetric attacks, still add Vercel edge/WAF rate-limit rules for public POST endpoints: edge controls can reject traffic before it reaches the app/database, while the database limiter remains defense-in-depth if the edge layer is bypassed or unavailable.
