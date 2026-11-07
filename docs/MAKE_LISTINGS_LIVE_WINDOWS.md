# Make the first listings live — Windows runbook

Goal: claim the first Production admin seat, then approve the pending creator and
campaign so they appear on theyaar.com.

**This file is written for PowerShell 7 on Windows**, because that is the machine
the owner uses. For bash/zsh see [`MAKE_LISTINGS_LIVE.md`](./MAKE_LISTINGS_LIVE.md).

PowerShell differs from bash in four ways that break copy-pasted bash commands:

| bash | PowerShell |
|---|---|
| `export NAME=value` | `$env:NAME = 'value'` |
| `\` at end of line | `` ` `` (backtick) or keep the command on one line |
| `FP=abc` | `$FP = 'abc'` |
| `"$PWD/.local/..."` | `"$(Get-Location)/.local/..."` or just `.local/...` |

Anything that looks like a bare hash, PEM block or path is **not** a command.
Only the lines starting with `pwsh`, `node`, `openssl` or `$env:` should be run.

## Current verified state (production `dqhxgwzjwzvpqiilteld`)

- `owner_claimed_at IS NULL` — the seat is open; `first_admin_setup_available()` returns `true`.
- 0 auth users, 0 admin profiles, 0 admin invitations.
- `super_admin` holds all four review permissions.
- Auth `site_url` and `uri_allow_list` are the exact production callback, no wildcards.
- `0002_*` and `0003_*` operator migrations are **not applied**, so the
  `*-management.mjs` CLIs fail. Use the runbook below instead.

## Step 0 — Open the repository in PowerShell

Every command below runs from the **repository root** (the folder containing
`package.json`), not from `C:\WINDOWS\System32`.

```powershell
cd C:\Users\<you>\path\to\yaarlink-      # wherever you cloned it
Get-ChildItem package.json               # must exist, or you are in the wrong folder
```

Check Node:

```powershell
node --version                           # must be v22 or newer
```

## Step 1 — Generate the keypair (local, offline)

Do this on **your own machine**. The private key must never be sent anywhere.

```powershell
pwsh ./scripts/owner-windows.ps1 Keygen
```

It prints an RSA-3072 fingerprint. Files land in `.local\keys\` (gitignored).
Copy the fingerprint; you need it in Step 3.

Confirm it independently:

```powershell
pwsh ./scripts/owner-windows.ps1 Fingerprint
```

Both must print the same 64-character string. If they differ, stop.

> If you already generated a keypair elsewhere, use **that** fingerprint. A key
> generated in a different environment cannot decrypt ciphertext produced for this one.

## Step 2 — Local readiness check (contact-free)

```powershell
pwsh ./scripts/owner-windows.ps1 Check
```

Green ticks plus two ⏳ items is expected: the pooler URL and the service key
arrive in Steps 3 and 4. This check opens no network connection and prints no
key material.

## Step 3 — Create the bootstrap invitation

Needs the **production database password** (Supabase dashboard → Project Settings →
Database). Never paste it into chat or commit it.

**Use the Session pooler, not Direct.** The direct host
`db.dqhxgwzjwzvpqiilteld.supabase.co` publishes an IPv6 address only, and most
home connections in India are IPv4-only, where it fails with `ENETUNREACH`
before any password is checked.

```powershell
$env:ADMIN_PRODUCTION_OPERATOR_DATABASE_URL = 'postgresql://postgres.dqhxgwzjwzvpqiilteld:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
```

Rules for that string:

- Username is `postgres.<project-ref>` — the dot matters.
- Percent-encode `@ : / ? #` in the password: `p@ss` becomes `p%40ss`.
- Port **5432** only; 6543 is the transaction pooler and is rejected.

Dry run first:

```powershell
pwsh ./scripts/provision-production-owner.ps1 -DryRun -AuthorizationRef ISSUE-001
```

Then create it:

```powershell
pwsh ./scripts/provision-production-owner.ps1 -Execute -AuthorizationRef ISSUE-001
```

This writes `.local\keys\invitation.enc` — ciphertext only, never the token.

Optional: if a previous invitation was abandoned and has since **expired**, add
`-RetireExpiredInvitation`. It retires only rows whose `expires_at` has passed,
records `bootstrap.invitation_expired` in the audit log, and still refuses a live one.

## Step 4 — Send the Supabase Auth invitation

Needs a Supabase **management token** and a **service-role key** for this project.
Both legacy JWT (`eyJ…`) and the newer `sb_secret_…` shape are accepted.

```powershell
$env:SUPABASE_PRODUCTION_MANAGEMENT_TOKEN = '...'
$env:SUPABASE_PRODUCTION_SERVICE_ROLE_KEY = '...'
$env:PRODUCTION_VERIFIED_AUTH_CALLBACK    = 'https://www.theyaar.com/admin/auth/callback'

node scripts/invite-production-owner-auth.mjs --dry-run
node scripts/invite-production-owner-auth.mjs --execute
```

The callback published in Auth must stay exactly
`https://www.theyaar.com/admin/auth/callback`.

## Step 5 — Accept, enrol TOTP, claim

1. Open the invite email, accept it, set a password.
2. Confirm the email address.
3. Enrol an authenticator app. AAL2 is mandatory; `/admin` redirects to `/admin/mfa` otherwise.
4. Decrypt the token and read it:

```powershell
pwsh ./scripts/owner-windows.ps1 Decrypt -Ciphertext "C:\Users\<you>\path\to\yaarlink-\.local\keys\invitation.enc"
```

Paste the 64-character result into `https://www.theyaar.com/admin/setup`.

Claim also requires a TOTP code used within the last 10 minutes, so sign in
immediately before claiming. The invitation lives 24 hours — do Steps 3–5 the
same day.

## Step 6 — Approve the listings

Sign in at `https://www.theyaar.com/admin`. Do this on **production**, not a
preview URL: the preview build points its admin client at a different project
whose `public` schema is empty, so approvals there silently do nothing.

- Creators → `pending` → **Approve creator**
- Campaigns → `pending` → **Approve & publish campaign**

Verify:

```powershell
Invoke-RestMethod https://www.theyaar.com/api/creators
Invoke-RestMethod https://www.theyaar.com/api/campaigns
```

Both should return one record.

## Clean up when finished

```powershell
Remove-Item -Recurse -Force .\.local\keys
Remove-Item Env:\ADMIN_PRODUCTION_OPERATOR_DATABASE_URL
Remove-Item Env:\SUPABASE_PRODUCTION_SERVICE_ROLE_KEY
Remove-Item Env:\SUPABASE_PRODUCTION_MANAGEMENT_TOKEN
```

The private key is useless after the claim succeeds.

## Before approving, check these two records

- The pending campaign is titled `I WANT TO PROMOTE MY INCOMING IRONMAN SUIT`
  (business `STARK INDUSTRIES`, budget ₹1,00,00,000). Approving publishes it to the
  homepage "Fresh on YaarLink" section. Edit or delete it first if it is a test record.
- The pending creator links Instagram `/Utv/` but a profile URL of `/utsa__v9/`.
  Confirm which handle is real; `verified_followers` is stamped from the claimed count.
- The `incomplete` creator (`Ashish`) cannot be approved: the review RPC requires
  `status='pending'`, and the public card needs a category and a profile link.
  That person must sign in and finish their own profile.
