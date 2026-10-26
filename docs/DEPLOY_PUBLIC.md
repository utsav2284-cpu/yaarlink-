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

Generate the two signing secrets with:

```bash
openssl rand -hex 32
```

Use different values for `SESSION_SECRET` and `ADMIN_SESSION_SECRET`. `ADMIN_SESSION_SECRET` is
mandatory: if it is missing or equal to `SESSION_SECRET`, `/api/admin/login` and `/api/admin/logout`
return HTTP 503 instead of sharing a signing key.

## 3. Security behavior in this release

- Campaign creation requires an authenticated **brand** account.
- Creator profile creation requires an authenticated **creator** account.
- Campaign applications require an authenticated **creator** account.
- Dashboard ownership is based only on the authenticated user ID, never an email match.
- Admin access uses an HttpOnly signed session cookie; the admin password is never stored in browser storage.
- Login/signup/admin/public-write endpoints have request throttling. `admin-login` also has a hard
  client lockout with exponential backoff after repeated failures (per Worker isolate).
- Session cookies are `__Host-`-prefixed and always `Secure`; logout revokes the session server-side.
- Public inputs have length/type/URL/email validation.
- Sensitive admin/dashboard responses are `no-store`.
- Public campaign/creator APIs do not expose private contact/budget fields.
- Security headers — including a report-only Content-Security-Policy — are applied by Next.js
  (`next.config.ts`), the single authoritative source. Promote the CSP to enforcing once the
  report stream is clean.

## 4. Deployment

This project is configured for OpenNext + Cloudflare Workers. Build/deploy with your normal Cloudflare/OpenNext workflow.

Before production, verify the deployment build completes successfully in the deployment provider. This source package was audited, but dependency installation could not be completed in the isolated review environment, so a successful production build cannot be claimed from this environment.

## 5. Admin

Open `/admin` and use the value of `ADMIN_PASSWORD`. The password is exchanged only over HTTPS and replaced by a short-lived HttpOnly admin session cookie. Repeated wrong passwords from one client trigger a temporary lockout. Rotate `ADMIN_PASSWORD`, `SESSION_SECRET` and `ADMIN_SESSION_SECRET` if any admin session was ever issued while the old shared-secret fallback was in place.

## 6. Important operational recommendation

For stronger distributed bot protection, add Cloudflare WAF/Rate Limiting rules for the public POST endpoints. The application-level limiter in this package is intentionally lightweight and per Worker isolate; it is defense-in-depth, not a replacement for Cloudflare edge rate limiting.
