# YaarLink on Your Own Laptop — Owner Setup Guide (Windows)

This guide runs the **real** YaarLink application, with the full Super Admin
sign-in + MFA, directly on your Windows laptop. This is also the Part 3
"Emergency Local Dashboard": after the first-time downloads, everything runs
offline — no Arena preview, no cloud, no hosting needed.

Important facts before you start:

- This is a **local copy** with its **own separate local database**. It never
  touches the production website (theyaar.com) or production data, and
  nothing syncs or overwrites production — ever.
- Your Super Admin account from the Arena sandbox does **not** transfer. You
  will create a **fresh local owner account** in Step 12 (you choose the
  email and password; nobody else ever sees them).
- The app listens **only on your own machine** (`http://127.0.0.1:3000`).
  Other devices on your Wi‑Fi and the internet **cannot** reach it. Sign-in
  cookies work normally and securely here (the Arena embedded preview
  physically cannot return cookies — that limitation does not exist on your
  laptop).
- The first time you run Node.js or Docker, Windows Firewall may ask whether
  to allow network access. Choose **Private network** only, or simply
  **Cancel** — using the app at `127.0.0.1` on this laptop works either way.
  Never allow **Public** access.
- First time takes roughly 30–45 minutes, mostly waiting for downloads.
  After that, daily startup takes under a minute.
- You will open **three PowerShell windows** and keep them open while using
  the app. That is normal.

---

## Step 1 — Install Node.js (version 22 LTS)

1. Go to <https://nodejs.org> and download the **LTS** Windows installer.
2. Run it, keep all default options, finish.
3. Open a **new** PowerShell window and check:

```powershell
node -v
npm -v
```

You should see `v22.x.x` and `10.9.x` or higher.

## Step 2 — Install Git

1. Go to <https://git-scm.com/download/win>, download and install with
   default options.
2. In PowerShell check: `git --version`

## Step 3 — Install Docker (Engine + Compose v2) for the local database

YaarLink only uses standard `docker compose` commands — no paid Docker
features. On Windows, the simplest way to get Docker Engine + Compose v2 is
**Docker Desktop**:

1. Go to <https://www.docker.com/products/docker-desktop>, install it.
2. Start **Docker Desktop** and wait until it says it is running (the whale
   icon becomes steady). It may offer to enable WSL 2 or ask for a restart —
   allow it.
3. In PowerShell check: `docker --version` and `docker compose version`

> Prefer not to use Docker at all? Skip Steps 3 and 6 and use
> **Appendix A — Native PostgreSQL (no Docker)** at the end of this guide
> instead. Everything else stays the same.

## Step 4 — Download the YaarLink project

In PowerShell:

```powershell
cd $HOME
git clone -b arena/9b3c6e40-yaarlink https://github.com/utsav2284-cpu/yaarlink-.git yaarlink-local
cd yaarlink-local
```

Keep this window open — call it **Window 1**.

## Step 5 — Create your local settings file

```powershell
copy .env.local.example .env.local
```

Now generate three private secrets. Run this command **three times**; each
time it prints a different random line:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open the settings file:

```powershell
notepad .env.local
```

Replace only these three values with your three generated lines (one each):

- `SESSION_SECRET=...`
- `ADMIN_SESSION_SECRET=...`
- `ADMIN_MFA_ENCRYPTION_SECRET=...` (this one is at the end of a comment
  block; it currently ends with `=` and nothing after it)

Leave **everything else exactly as it is**, including
`APP_URL=http://127.0.0.1:3000`. Do **not** uncomment
`ADMIN_COOKIE_SAME_SITE` — on your own laptop the secure default is correct.
Save and close Notepad. Never share `.env.local` with anyone.

## Step 6 — Start the local database (Docker)

```powershell
npm run local:db:up
docker compose ps
```

Wait until the `db` service shows **healthy** (first run downloads
PostgreSQL, about 1–2 minutes). The database listens on `127.0.0.1` only.

*(Appendix A users: skip this step — your PostgreSQL runs as a Windows
service.)*

## Step 7 — Install the application packages

```powershell
npm ci
```

This takes several minutes the first time.

## Step 8 — Create all database tables

```powershell
npm run local:bootstrap
```

Success looks like a final line beginning with
`Database bootstrap verified: ... tables`. You may also see a sentence
starting *"If yaarlink_app was newly created..."* — with this setup it is
already handled for you; ignore that sentence.

## Step 9 — Build the application

```powershell
npm run build
```

## Step 10 — Start the local helper services (Window 2)

Open a **second** PowerShell window:

```powershell
cd $HOME\yaarlink-local
npm run local:services
```

Leave it running. This catches outgoing test emails (like your owner setup
link) into a local file instead of sending real email.

## Step 11 — Start the application (Window 1)

Back in Window 1:

```powershell
npm run start -- -p 3000 -H 127.0.0.1
```

Wait for `✓ Ready`, then open <http://127.0.0.1:3000> in Chrome — the
YaarLink website should load. Always use exactly `127.0.0.1:3000` in the
browser address bar (not `localhost`), so the address matches your settings
file exactly.

## Step 12 — Create YOUR Super Admin account (Window 3)

Open a **third** PowerShell window:

```powershell
cd $HOME\yaarlink-local
npm run admin:bootstrap-owner -- --email=YOUR-OWN-EMAIL
```

Use your real email address. You should see:
`Owner setup email sent to YOUR-OWN-EMAIL. It expires in 20 minutes.`

The setup "email" was captured locally. Open it:

```powershell
notepad .local\email-outbox.jsonl
```

Find the **newest** line (at the bottom) and copy the link that starts with
`http://127.0.0.1:3000/admin/setup#token=...`. Open that link in Chrome
within **20 minutes** and choose your password (use a password manager if
you have one).

- Treat this link like a password: never share it or screenshot it.
- If it expires, wait one minute and run the command again with
  `--resend` added:
  `npm run admin:bootstrap-owner -- --email=YOUR-OWN-EMAIL --resend`

## Step 13 — Sign in and complete MFA

1. Open <http://127.0.0.1:3000/admin/sign-in>
2. Sign in with your email and the password you just chose.
3. You land on **Admin account & security** — and this time it stays.
4. In the MFA section, re-enter your password to reveal the **QR code**.
5. Scan it with an authenticator app (Google Authenticator / Microsoft
   Authenticator), enter the 6-digit code.
6. **Save the 10 recovery codes somewhere private** (password manager or
   paper in a safe place). Tick the confirmation to finish.
7. Open the dashboard: <http://127.0.0.1:3000/admin>

## Step 14 — Verify the full cycle

1. Sign out.
2. Sign in again with email + password.
3. You are asked for an MFA code — enter it from your authenticator app.
4. Dashboard opens. Done — you now fully own local Super Admin access.

Please confirm completion of Steps 13–14 in the project chat (no screenshots
of QR codes, recovery codes, or links — just say it worked, or paste the
exact error text if something stopped).

---

## Daily use

1. Start Docker Desktop (wait until running). *(Appendix A: nothing to
   start — PostgreSQL runs as a Windows service.)*
2. Window 1: `cd $HOME\yaarlink-local` then `npm run local:db:up` (Docker
   only; quick after the first time)
3. Window 2: `npm run local:services` (needed whenever a flow sends email —
   invites, password resets; harmless to always run)
4. Window 1: `npm run start -- -p 3000 -H 127.0.0.1`
5. Use <http://127.0.0.1:3000/admin> in Chrome.

To stop: press `Ctrl+C` in the app and services windows. To stop the Docker
database: `npm run local:db:down` (your data is kept).
**Never run `docker compose down -v`** — that deletes your local database.

## Getting updates later

When told that new work has been published to the branch:

```powershell
cd $HOME\yaarlink-local
git pull
npm ci
npm run local:bootstrap
npm run build
```

Then restart the app (Step 11). The bootstrap command is safe to re-run.

## Optional: back up your local database

Docker:

```powershell
docker compose exec db pg_dump -U postgres -f /tmp/yaarlink-local-backup.sql yaarlink_local
docker compose cp db:/tmp/yaarlink-local-backup.sql .\yaarlink-local-backup.sql
```

Keep that file private (it contains your local data). Never upload it
anywhere public.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `'node' is not recognized` | Close and reopen PowerShell after installing Node. If still failing, reinstall Node 22 LTS. |
| Docker: *"error during connect"* / daemon not running | Start Docker Desktop and wait until it finishes starting, then retry. |
| `local:db:up` fails: *port 5432 is already allocated* | You have another PostgreSQL. In `docker-compose.yml` change `"127.0.0.1:5432:5432"` to `"127.0.0.1:55432:5432"`, and in `.env.local` change `5432` to `55432` in **both** `DATABASE_URL` lines. Then re-run Step 6. |
| Setup link says expired/invalid | Links last 20 minutes. Re-run Step 12 with `--resend` and open the **newest** link quickly. Both Window 2 (services) and Window 1 (app) must be running. |
| Sign-in shows *"Your sign-in could not be confirmed"* on the laptop | Make sure the address bar says exactly `http://127.0.0.1:3000`, and allow cookies for `127.0.0.1` in Chrome (Settings → Privacy → Cookies), or use a fresh Chrome profile. |
| `npm ci` or build errors about Node version | Run `node -v` — it must be v22 or higher. Install the current 22 LTS from nodejs.org. |
| Page at 127.0.0.1:3000 doesn't load | Check Window 1 shows `✓ Ready`; Docker users: `docker compose ps` shows `db` healthy; Appendix A users: the `postgresql-x64-17` Windows service is running. |
| Windows Firewall popups for Node/Docker | Choose **Private network** only or **Cancel**. Local use at `127.0.0.1` works regardless. Never allow Public. |

## Safety notes

- The database passwords inside `docker-compose.yml` are disposable
  local-only values. They are safe **only** because the database and the app
  listen on `127.0.0.1` (this laptop only). Never reuse them — or anything
  from `.env.local` — on Vercel/production.
- Local and production stay completely separate. Nothing here syncs,
  uploads, or overwrites production, ever.
- Recovery codes and your password are yours alone. Nobody from YaarLink
  support (or this assistant) will ever ask for them.

---

## Appendix A — Native PostgreSQL (no Docker)

Use this instead of Steps 3 and 6 if you don't want Docker.

1. Install **PostgreSQL 17 for Windows** from
   <https://www.postgresql.org/download/windows/>. During setup:
   - Remember the password you set for the `postgres` superuser. Prefer
     **letters and numbers only** (special characters would need URL
     encoding in Step 5 below).
   - Keep port **5432**.
2. After Step 4 (project downloaded), create the database and the app role.
   In PowerShell, from the `yaarlink-local` folder (adjust `17` if your
   installed folder differs):

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE yaarlink_local;"
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d yaarlink_local -f scripts\local-postgres-init.sql
   ```

   Enter your `postgres` password when asked.
3. In Step 5 (`.env.local`), additionally change **only the password part**
   of `BOOTSTRAP_DATABASE_URL` to the `postgres` password you chose:

   ```text
   BOOTSTRAP_DATABASE_URL=postgresql://postgres:YOUR-POSTGRES-PASSWORD@127.0.0.1:5432/yaarlink_local
   ```

   Leave `DATABASE_URL` exactly as in the example file.
4. Continue from Step 7. Day to day, PostgreSQL runs automatically as the
   Windows service `postgresql-x64-17`; there is nothing to start or stop.
5. Local backup (optional):

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -f yaarlink-local-backup.sql yaarlink_local
   ```
