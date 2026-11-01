# YaarLink · theyaar.com — Simple marketing for everyone

Creator-marketing platform connecting brands, local businesses, creators and meme pages.
Next.js 16 · Tailwind CSS · PostgreSQL · Drizzle ORM · deployed on **Cloudflare Workers** (via OpenNext).

Layout: `app/` (routes) · `frontend/` (UI) · `backend/` (data + auth) · `shared/` (domain constants) · `config/` (site settings) · `docs/`.
See [`docs/STRUCTURE.md`](docs/STRUCTURE.md) for the full map.

---

## What you need (all free)

| Account | What it's for |
|---|---|
| [GitHub](https://github.com) | Stores your code |
| [Cloudflare](https://dash.cloudflare.com/sign-up) | Runs the website + your domain theyaar.com |
| [Neon](https://neon.tech) | Your PostgreSQL database (choose region **Singapore** — closest to India) |
| [Node.js 22 LTS](https://nodejs.org) | Only on your computer, to run the setup commands |

---

## 1 · Get the code onto your computer and GitHub

Download the project, unzip it into a folder called `yaarlink`, open a terminal in that folder, then:

```bash
npm install
git init
git add .
git commit -m "YaarLink launch"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/yaarlink.git
git push -u origin main
```

(`.gitignore` keeps secrets like `.env` and build folders off GitHub.)

## 2 · Create the database (Neon)

1. In Neon: **New Project** → region **AWS Asia Pacific (Singapore)**.
2. Click **Connect**, turn **Connection pooling ON**, copy the connection string. It looks like
   `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
3. Create the tables (run on your computer, keep the quotes):

```bash
npx drizzle-kit push --dialect=postgresql --schema=./backend/db/schema.ts --url="PASTE_NEON_URL"
```

You should see `[✓] Changes applied`.

## 3 · Deploy to Cloudflare (from your computer)

```bash
npx wrangler login                       # opens the browser, click Allow
npx wrangler secret put DATABASE_URL     # paste the Neon URL
npx wrangler secret put ADMIN_PASSWORD   # unique passphrase, at least 16 characters (for /admin)
npx wrangler secret put SESSION_SECRET   # paste fresh `openssl rand -hex 32` output (signs login cookies)
npx wrangler secret put ADMIN_SESSION_SECRET   # paste *different* `openssl rand -hex 32` output (signs the admin cookie)
npx wrangler secret put RESEND_API_KEY         # Resend API key for signup verification email
npx wrangler secret put EMAIL_FROM             # e.g. YaarLink <no-reply@theyaar.com> (domain verified in Resend)
# Optional: npx wrangler secret put ADMIN_TOTP_SECRET   # Base32 authenticator secret for admin MFA
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy
```

> If `secret put` says the Worker doesn't exist yet, run the last two commands first, then add the secrets and deploy again.

You'll get a link like `https://yaarlink.YOUR-NAME.workers.dev`. 🎉

**Tip — random secret:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Or: auto-deploy every time you push to GitHub

Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → pick `yaarlink`:
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

Then in the Worker → **Settings → Variables and Secrets**, add `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ADMIN_SESSION_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM` (type **Secret**). Generate the two signing secrets independently with `openssl rand -hex 32`; `ADMIN_SESSION_SECRET` must be different from `SESSION_SECRET`, and `ADMIN_PASSWORD` must be a unique passphrase of at least 16 characters. The server refuses to start when a required auth secret is missing, weak, copied from `.env.example`, or shared, and the relevant login routes also fail closed with HTTP 503. Signup fails closed with HTTP 503 until the two email settings are present, and the `EMAIL_FROM` domain must be verified in Resend. Optionally add `ADMIN_TOTP_SECRET` with a Base32 secret enrolled in your authenticator app to require a six-digit code at `/admin`; leave it unset for password-only login. Optionally add a distinct generated `BOT_CHALLENGE_SECRET` for public-form security challenges; otherwise the validated `SESSION_SECRET` is used. Do not enable the proxy-trust variables in `.env.example` unless the deployment's only ingress is that trusted proxy.

## 4 · Connect theyaar.com

1. Cloudflare → **Add a domain** → `theyaar.com` → Free plan.
2. At the place you bought the domain, replace the nameservers with the two Cloudflare shows you. (Takes minutes to a few hours.)
3. Workers & Pages → `yaarlink` → **Settings → Domains & Routes → Add → Custom domain** → `theyaar.com`. Add `www.theyaar.com` too.

HTTPS is automatic.

## 5 · Check everything works

- `https://www.theyaar.com/api/health` → `{"ok":true}` (if `false`, `DATABASE_URL` is wrong)
- Sign up as a brand → verify the emailed link → create a campaign → it appears on your dashboard with the budget 🔒
- Sign up as a creator (another email) → verify the emailed link → apply to the campaign → the brand sees it on their dashboard
- `https://www.theyaar.com/admin` → your `ADMIN_PASSWORD` → all data, budgets and contacts
- Contact page → WhatsApp / Call / Email / Instagram all open on your phone

Logs: Cloudflare → Workers & Pages → `yaarlink` → **Logs**.

---

## Things only you control

| What | Where |
|---|---|
| Phone, WhatsApp, email, Instagram, city, domain | `config/site.ts` |
| Admin password | `npx wrangler secret put ADMIN_PASSWORD` (or dashboard), no redeploy needed |
| All data | `/admin` on your site, or Neon → **Tables** |
| Hindi / Punjabi text | `frontend/i18n.tsx` |
| Categories, languages, formats | `shared/constants.ts` |
| Colours, fonts, animations | `app/globals.css` |

**Update the live site:** edit → `git add . && git commit -m "change" && git push` (auto-deploy), or run
`npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`.

**Changed `backend/db/schema.ts`?** Re-run the `drizzle-kit push` command from step 2 before deploying.

---

## Run on your own computer

```bash
cp .env.example .env     # fill in DATABASE_URL and generate fresh auth secrets; placeholders refuse to start
npm install
npm run dev              # http://localhost:3000
```

Test inside the real Cloudflare runtime: put the same values in `.dev.vars`, then
`npx opennextjs-cloudflare build && npx opennextjs-cloudflare preview`.

---

## How it's built (for future developers)

- **Login:** signed, httpOnly cookie (`backend/auth.ts`). Passwords hashed with PBKDF2 via Web Crypto (fast on Workers).
- **Privacy:** budgets, phone numbers and applications are never in public APIs. Brands see only their own
  campaigns + applications (`/api/me/dashboard`); the owner sees everything at `/admin`.
- **Database on Workers:** `backend/db/index.ts` opens a fresh connection per request on Cloudflare (required there) and a
  shared pool on normal Node servers.
- **Using Supabase instead of Neon:** use the *Transaction pooler* URL. Neon is recommended and tested.
