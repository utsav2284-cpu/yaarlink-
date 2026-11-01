# YaarLink — Public Deployment Checklist

Vercel + Supabase is the only supported production deployment path for this repository. Keeping one authoritative path prevents a second host configuration from drifting on environment variables, database TLS, client-IP trust, or security headers.

## 1. Database and verified TLS

For initial provisioning, run the schema push once with the Supabase **Direct connection** string (or the **Session pooler** string from an IPv4-only network) before the first production deployment:

```bash
npx drizzle-kit push --dialect=postgresql --schema=./backend/db/schema.ts --url="$PROVISIONING_DATABASE_URL"
```

The URL used for that command must use `sslmode=verify-full` and an `sslrootcert` pointing at the root certificate downloaded from Supabase **Database settings → SSL Configuration**. Never commit a database URL.

For the deployed application:

- Set `DATABASE_URL` to the Supabase **Transaction pooler** connection string with `sslmode=verify-full`.
- Set `DATABASE_CA_CERT` in Vercel to the complete downloaded Supabase root-certificate PEM, including the `BEGIN CERTIFICATE` and `END CERTIFICATE` lines.
- Alternatively, for a runtime that provides the certificate as a file, append `&sslrootcert=/absolute/path/to/prod-ca-2021.crt` to `DATABASE_URL` and leave `DATABASE_CA_CERT` unset.

Do not use `sslmode=no-verify`, `disable`, `prefer`, `require`, or `verify-ca` for a remote database. Without a configured CA, `backend/db/connection-config.ts` rejects those modes for remote hosts. When `DATABASE_CA_CERT` is set, the app strips the URL's SSL-mode parameters and passes that CA explicitly to node-postgres with `rejectUnauthorized: true`, so both the certificate chain and hostname are verified and a legacy weaker `sslmode` cannot downgrade the actual connection. New connection strings should still specify `verify-full` explicitly.

For an existing production database, review schema changes and take a backup before applying them; do not blindly repeat an initial-provisioning push.

## 2. Required production environment variables

Set these as server-side Vercel environment variables for the Production environment:

- `DATABASE_URL`
- `DATABASE_CA_CERT` (required for Supabase unless `sslrootcert` is used instead)
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Configure Preview separately. Do not give Preview deployments the production database URL or production signing secrets unless you intentionally want previews to share production data and sessions.

Verify the `EMAIL_FROM` sending domain in Resend before deployment. Signup verification fails closed with HTTP 503 when either email setting is missing; it never falls back to creating an unverified account. `APP_URL` may optionally pin the public origin used in verification links.

Generate each signing secret independently with:

```bash
openssl rand -hex 32
```

Use different values for `SESSION_SECRET` and `ADMIN_SESSION_SECRET`, and use a unique `ADMIN_PASSWORD` of at least 16 characters stored in a password manager. At server startup the app validates these values and refuses to start when a required value is missing, weak, copied from `.env.example`, or shared with another signing secret. Request-level fail-closed checks are also present: for example, a missing/weak/shared admin signing secret makes `/api/admin/login` and `/api/admin/logout` return HTTP 503 instead of sharing a signing key. Human passphrases are not accepted as signing secrets—use generated key material such as the OpenSSL output above.

Optional admin MFA: set `ADMIN_TOTP_SECRET` to a valid Base32 TOTP secret (at least 16 Base32 characters) after enrolling that secret in the owner's authenticator app. When set, `/admin` requires the current six-digit code in addition to `ADMIN_PASSWORD`. If the value is invalid or too short, startup/admin login fail closed; it does not fall back to password-only access.

Optional public-form challenge secret: generate `BOT_CHALLENGE_SECRET` separately and make it different from both session secrets. If unset, a validated `SESSION_SECRET` signs those short-lived, one-time challenges.

When a user creates or changes a password, the server checks it against known breached passwords through Have I Been Pwned's k-anonymity range API. Only the first five characters of the password's SHA-1 hash leave the server. If that check is unavailable, the password-setting request returns HTTP 503 instead of accepting an unchecked password. `PWNED_PASSWORDS_RANGE_URL` may point to a compatible HTTPS mirror; leave it unset for the public endpoint.

Client-IP trust has no environment switch. The rate limiter trusts client-IP headers only when Vercel itself is running the app (`VERCEL=1`, set by Vercel). In local development, requests share the conservative `unknown` bucket rather than trusting client-supplied forwarding headers.

After changing Vercel environment variables, create a new deployment so the running application picks up the new values.

## 3. Security behavior in this release

- Campaign creation requires an authenticated **brand** account.
- Creator profile creation requires an authenticated **creator** account.
- Campaign applications require an authenticated **creator** account.
- Dashboard ownership is based only on the authenticated user ID, never an email match.
- Admin access uses an HttpOnly signed session cookie; the admin password is never stored in browser storage.
- Login/signup/admin/public-write endpoints have request throttling. User and admin login also have database-backed failed-attempt lockouts with exponential backoff. A user-login lockout is keyed by the submitted normalized email whether or not an account exists, plus the client key.
- Wrong user credentials return HTTP 401 with the same body for an unknown email and a wrong password; unknown emails still run a dummy PBKDF2 verification so password work is not skipped.
- New passwords must be 10–256 Unicode characters and pass local predictable-password rules plus the breached-password check. An authenticated password change keeps only the current device session (reissued at the new token version), revokes other sessions, and invalidates account action tokens.
- Signup returns one generic verification-required response for new, pending, and already registered addresses and sets no session cookie. User/profile rows are created only after the emailed one-time link and the signup password are verified.
- Session cookies are `__Host-`-prefixed and always `Secure`; logout revokes the session server-side.
- Admin tokens carry a DB-backed session version; admin logout increments it, revoking copied or previously issued admin cookies, and the admin page clears loaded data from browser state.
- Admin logins, logouts, and moderation decisions are recorded in the append-only `admin_audit_logs` table and shown on the admin **audit log** tab.
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

After deployment, check:

1. `/api/health` returns `{"ok":true}`.
2. A document response has `Content-Security-Policy` and `Reporting-Endpoints`, and does **not** rely on `Content-Security-Policy-Report-Only`.
3. Pages hydrate and forms work with no CSP errors in the browser console.
4. Vercel logs show no database TLS/configuration errors. Sanitized CSP violations, if any, appear with the `[csp-report]` prefix.

Add `www.theyaar.com` and `theyaar.com` under Vercel **Settings → Domains**, publish the DNS records Vercel provides, and keep `www` as the canonical host.

## 5. Admin

Open `/admin` and use the value of `ADMIN_PASSWORD` (plus the authenticator code if `ADMIN_TOTP_SECRET` is set). The password is exchanged only over HTTPS and replaced by a short-lived HttpOnly admin session cookie. Repeated wrong passwords/codes from one client trigger a temporary lockout. **Lock admin** revokes all current admin sessions server-side, so a copied cookie cannot be replayed after logout. Rotate `ADMIN_PASSWORD`, `SESSION_SECRET` and `ADMIN_SESSION_SECRET` if any admin session was ever issued while the old shared-secret fallback was in place.

## 6. Important operational recommendation

The application limiter and failed-login lockouts are shared through PostgreSQL, so limits do not reset merely because a request reaches a different Vercel function instance. For volumetric attacks, still add Vercel edge/WAF rate-limit rules for public POST endpoints: edge controls can reject traffic before it reaches the app/database, while the database limiter remains defense-in-depth if the edge layer is bypassed or unavailable.
