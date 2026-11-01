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
3. For the one-time initial schema creation, copy the **Direct connection** string (or the **Session pooler** string if your computer's network is IPv4-only), make sure it uses `sslmode=verify-full`, append `&sslrootcert=/absolute/path/to/the/downloaded-certificate.crt`, and run:

```bash
npx drizzle-kit push --dialect=postgresql --schema=./backend/db/schema.ts --url="PASTE_DIRECT_URL"
```

You should see `[✓] Changes applied`.

4. For the running application, copy the **Transaction pooler** connection string and set/replace its SSL mode with `sslmode=verify-full`. This becomes `DATABASE_URL`.
5. On Vercel, set `DATABASE_CA_CERT` to the complete downloaded PEM certificate, including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`. The application passes that CA to node-postgres with hostname verification enabled.

Never use `sslmode=no-verify`, `disable`, `prefer`, `require`, or `verify-ca` for a remote database. Without a configured CA, the application rejects those modes instead of accepting an unverified connection. When `DATABASE_CA_CERT` is set, the application strips the URL's SSL-mode parameters and verifies the certificate chain and hostname against that CA, so a legacy weaker mode cannot downgrade the actual connection; new URLs should still use `verify-full` explicitly.

## 3 · Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import the GitHub repository.
2. Use the **Next.js** framework preset and the repository root as the Root Directory.
3. Set:
   - Install Command: `npm ci`
   - Build Command: `npm run build`
   - Output Directory: leave as the Next.js default
   - Production Branch: `main`
4. In **Settings → Environment Variables**, add these server-side values for Production:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase Transaction pooler URL with `sslmode=verify-full` |
| `DATABASE_CA_CERT` | Complete Supabase root-certificate PEM downloaded in step 2 |
| `ADMIN_PASSWORD` | Unique passphrase of at least 16 characters |
| `SESSION_SECRET` | Fresh output from `openssl rand -hex 32` |
| `ADMIN_SESSION_SECRET` | A different fresh output from `openssl rand -hex 32` |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender, e.g. `YaarLink <no-reply@theyaar.com>` |

Optional variables are documented in `.env.example`: `APP_URL`, `ADMIN_TOTP_SECRET`, `BOT_CHALLENGE_SECRET`, and `PWNED_PASSWORDS_RANGE_URL`.

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

- `https://www.theyaar.com/api/health` → HTTP 200 with `{"ok":true,...}`. A failure returns HTTP 503 with `"status":"degraded"`; check `DATABASE_URL`, `DATABASE_CA_CERT`, and that the current database schema has been applied.
- A page response includes an enforcing `Content-Security-Policy` header (not `Content-Security-Policy-Report-Only`) and a `Reporting-Endpoints` header
- Sign up as a brand → verify the emailed link → create a campaign → it appears on your dashboard with the budget 🔒
- Sign up as a creator (another email) → verify the emailed link → apply to the campaign → the brand sees it on their dashboard
- `https://www.theyaar.com/admin` → your `ADMIN_PASSWORD` → all data, budgets and contacts
- Contact page → WhatsApp / Call / Email / Instagram all open on your phone

Logs: Vercel → your project → **Logs**. CSP violations are logged with the `[csp-report]` prefix after being sanitized by `/api/security/csp-report`.

---

## Things only you control

| What | Where |
|---|---|
| Phone, WhatsApp, email, Instagram, city, domain | `config/site.ts` |
| Admin password and other secrets | Vercel → Settings → Environment Variables (redeploy after changing them) |
| All data | `/admin` on your site, or Supabase → Table Editor |
| Hindi / Punjabi text | `frontend/i18n.tsx` |
| Categories, languages, formats | `shared/constants.ts` |
| Colours, fonts, animations | `app/globals.css` |

**Update the live site:** merge or push to `main`; Vercel deploys automatically.

**Changed `backend/db/schema.ts`?** Apply and verify the corresponding database change in Supabase before deploying application code that depends on it. For an existing production database, review the exact SQL/diff and take a backup first; do not blindly push destructive schema changes.

---

## Run on your own computer

```bash
cp .env.example .env     # fill in DATABASE_URL and generate fresh auth secrets; placeholders refuse to start
npm ci
npm run dev              # http://localhost:3000
```

For a remote Supabase database from local development, either set `DATABASE_CA_CERT` to the downloaded PEM or append `&sslrootcert=/absolute/path/to/prod-ca-2021.crt` to the local `DATABASE_URL`. A loopback PostgreSQL URL does not need remote-TLS settings.

---

## How it's built (for future developers)

- **Login:** signed, httpOnly cookie (`backend/auth.ts`). Passwords are hashed with PBKDF2 via Web Crypto.
- **Privacy:** budgets, phone numbers and applications are never in public APIs. Brands see only their own campaigns + applications (`/api/me/dashboard`); the owner sees everything at `/admin`.
- **Database:** `backend/db/index.ts` uses one shared node-postgres pool per warm Node/Vercel instance, with an explicit size/timeout policy and an idle-client error handler. `backend/db/connection-config.ts` fails closed when a remote database URL does not require verified TLS, and `/api/health` verifies both connectivity and the required tables/columns.
- **Security headers:** `proxy.ts` generates a per-request CSP nonce so the enforcing policy can allow Next.js bootstrap/RSC scripts without `unsafe-inline`; the root layout renders dynamically for that nonce. Static security headers live in `next.config.ts`, and sanitized CSP reports are collected at `/api/security/csp-report`.
