# YaarLink — Public Deployment Checklist

## 1. Database

Run the schema push against the production PostgreSQL database:

```bash
npx drizzle-kit push --dialect=postgresql --schema=./backend/db/schema.ts --url="$DATABASE_URL"
```

Do this once before the first production deployment. Never commit the database URL.

## 2. Required production secrets

Set these as Cloudflare Worker secrets (or your deployment provider's server-side environment variables):

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Verify the `EMAIL_FROM` sending domain in Resend before deployment. Signup verification fails
closed with HTTP 503 when either email setting is missing; it never falls back to creating an
unverified account. `APP_URL` may optionally pin the public origin used in verification links.

Generate each signing secret independently with:

```bash
openssl rand -hex 32
```

Use different values for `SESSION_SECRET` and `ADMIN_SESSION_SECRET`, and use a unique
`ADMIN_PASSWORD` of at least 16 characters stored in a password manager. At server startup the
app validates these values and refuses to start when a required value is missing, weak, copied
from `.env.example`, or shared with another signing secret. Request-level fail-closed checks are
also present: for example, a missing/weak/shared admin signing secret makes `/api/admin/login`
and `/api/admin/logout` return HTTP 503 instead of sharing a signing key. Human passphrases are
not accepted as signing secrets—use generated key material such as the OpenSSL output above.

Optional admin MFA: set `ADMIN_TOTP_SECRET` to a valid Base32 TOTP secret (at least 16 Base32
characters) after enrolling that secret in the owner's authenticator app. When set, `/admin`
requires the current six-digit code in addition to `ADMIN_PASSWORD`. If the value is invalid or
too short, startup/admin login fail closed; it does not fall back to password-only access.

Optional public-form challenge secret: generate `BOT_CHALLENGE_SECRET` separately and make it
different from both session secrets. If unset, a validated `SESSION_SECRET` signs those
short-lived, one-time challenges.

When a user creates or changes a password, the server checks it against known breached
passwords through Have I Been Pwned's k-anonymity range API. Only the first five characters of
the password's SHA-1 hash leave the server. If that check is unavailable, the password-setting
request returns HTTP 503 instead of accepting an unchecked password. `PWNED_PASSWORDS_RANGE_URL`
may point to a compatible HTTPS mirror; leave it unset for the public endpoint.

Client-IP proxy trust: Cloudflare Workers, Vercel (`VERCEL=1`), and Netlify are detected
automatically. For any other host, do not set `TRUST_CLOUDFLARE_HEADERS=true` or
`TRUST_PROXY_HEADERS=true` unless that proxy is the only ingress, strips inbound forwarding
headers, and the origin cannot be reached directly. With `TRUST_PROXY_HEADERS`, set
`TRUST_PROXY_HOPS` to the number of trusted proxies appended to `x-forwarded-for` (default 1).

## 3. Security behavior in this release

- Campaign creation requires an authenticated **brand** account.
- Creator profile creation requires an authenticated **creator** account.
- Campaign applications require an authenticated **creator** account.
- Dashboard ownership is based only on the authenticated user ID, never an email match.
- Admin access uses an HttpOnly signed session cookie; the admin password is never stored in browser storage.
- Login/signup/admin/public-write endpoints have request throttling. User and admin login also
  have database-backed failed-attempt lockouts with exponential backoff. A user-login lockout is
  keyed by the submitted normalized email whether or not an account exists, plus the client key.
- Wrong user credentials return HTTP 401 with the same body for an unknown email and a wrong
  password; unknown emails still run a dummy PBKDF2 verification so password work is not skipped.
- New passwords must be 10–256 Unicode characters and pass local predictable-password rules plus
  the breached-password check. An authenticated password change keeps only the current device
  session (reissued at the new token version), revokes other sessions, and invalidates account
  action tokens.
- Signup returns one generic verification-required response for new, pending, and already
  registered addresses and sets no session cookie. User/profile rows are created only after the
  emailed one-time link and the signup password are verified.
- Session cookies are `__Host-`-prefixed and always `Secure`; logout revokes the session server-side.
- Admin tokens carry a DB-backed session version; admin logout increments it, revoking copied or
  previously issued admin cookies, and the admin page clears loaded data from browser state.
- Admin logins, logouts, and moderation decisions are recorded in the append-only
  `admin_audit_logs` table and shown on the admin **audit log** tab.
- Public inputs have length/type/URL/email validation.
- Sensitive admin/dashboard responses are `no-store`.
- Public campaign/creator APIs do not expose private contact/budget fields.
- Security headers — including a report-only Content-Security-Policy — are applied by Next.js
  (`next.config.ts`), the single authoritative source. Promote the CSP to enforcing once the
  report stream is clean.

## 4. Deployment

This project is configured for OpenNext + Cloudflare Workers. Build/deploy with your normal Cloudflare/OpenNext workflow.

Install dependencies with `npm ci` so builds use the exact versions recorded in the tracked
`package-lock.json`. Before production, verify the deployment build completes successfully in
the deployment provider.

## 5. Admin

Open `/admin` and use the value of `ADMIN_PASSWORD` (plus the authenticator code if
`ADMIN_TOTP_SECRET` is set). The password is exchanged only over HTTPS and replaced by a
short-lived HttpOnly admin session cookie. Repeated wrong passwords/codes from one client trigger
a temporary lockout. **Lock admin** revokes all current admin sessions server-side, so a copied
cookie cannot be replayed after logout. Rotate `ADMIN_PASSWORD`, `SESSION_SECRET` and
`ADMIN_SESSION_SECRET` if any admin session was ever issued while the old shared-secret fallback
was in place.

## 6. Important operational recommendation

The application limiter and failed-login lockouts are now shared through PostgreSQL, so limits do
not reset merely because a request reaches a different Vercel instance or Cloudflare isolate.
For volumetric attacks, still add provider-edge WAF/rate-limit rules for public POST endpoints:
edge controls can reject traffic before it reaches the app/database, while the database limiter
remains defense-in-depth if the edge layer is bypassed or unavailable.
