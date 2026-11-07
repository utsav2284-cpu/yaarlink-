# Make the first listings live — operator runbook

Goal: claim the first Production admin seat, then approve the pending creator and
campaign so they appear on theyaar.com.

Read this entirely before running anything. Steps 3 and 4 need credentials that
must never be pasted into chat, an issue, a commit, or shell history shared with
others.

## Current verified state (production `dqhxgwzjwzvpqiilteld`)

- `owner_claimed_at IS NULL` — the seat is still open, `first_admin_setup_available()` returns `true`.
- 0 auth users, 0 admin profiles, 0 admin invitations.
- `super_admin` holds all four review permissions.
- Auth `site_url` and `uri_allow_list` are the exact production callback (no wildcards).
- `0002_management_owner_operator.sql` and `0003_..._auth_reservation.sql` are **not applied**,
  so `*-management.mjs` CLIs will fail. Use the paths below instead.

## Step 1 — Owner keypair (local, offline)

```bash
node scripts/owner-key.mjs generate
```

Writes `owner-private.pem` / `owner-public.pem` under `.local/keys/` (gitignored, mode 0600)
and prints the public-key SHA-256 fingerprint. Confirm it independently:

```bash
openssl pkey -pubin -in .local/keys/owner-public.pem -outform DER | openssl dgst -sha256 -hex
```

The private key never leaves the machine. Delete the whole `.local/keys/` directory after
the claim succeeds.

## Step 2 — Confirm the authorised recipient

The owner email is pinned in source:

```bash
grep AUTHORIZED_OWNER scripts/lib/production-bootstrap.mjs
```

It must be a mailbox you control, because claim requires the signed-in Auth user's
email to match the invitation exactly. If it differs, change it in a reviewed commit
**before** Step 3.

## Step 3 — Create the bootstrap invitation (needs the production DB password)

```bash
export ADMIN_PRODUCTION_OPERATOR_DATABASE_URL='postgresql://postgres:PASSWORD@db.dqhxgwzjwzvpqiilteld.supabase.co:5432/postgres'
FP=$(openssl pkey -pubin -in .local/keys/owner-public.pem -outform DER | openssl dgst -sha256 -hex | sed 's/.*= //')

node scripts/provision-production-owner.mjs --dry-run \
  --authorization-ref 'ISSUE-001' \
  --recipient-public-key "$PWD/.local/keys/owner-public.pem" \
  --recipient-key-sha256 "$FP"

node scripts/provision-production-owner.mjs --execute \
  --authorization-ref 'ISSUE-001' \
  --recipient-public-key "$PWD/.local/keys/owner-public.pem" \
  --recipient-key-sha256 "$FP" \
  --token-file "$PWD/.local/keys/invitation.enc"
```

If a previous invitation was left pending and has since expired, add
`--retire-expired-invitation`. That retires **only** rows whose `expires_at` has passed,
records `bootstrap.invitation_expired` in the audit log, and still refuses a live one.

## Step 4 — Send the Supabase Auth invitation

Requires a Supabase **management token** and a **service-role key** for this project.
Both service-key shapes are accepted (legacy JWT and `sb_secret_…`); the project binding
is proven by an authenticated `listUsers` probe against the pinned project URL.

```bash
export SUPABASE_PRODUCTION_MANAGEMENT_TOKEN='...'
export SUPABASE_PRODUCTION_SERVICE_ROLE_KEY='...'
export PRODUCTION_VERIFIED_AUTH_CALLBACK='https://www.theyaar.com/admin/auth/callback'

node scripts/invite-production-owner-auth.mjs --dry-run
node scripts/invite-production-owner-auth.mjs --execute
```

Dry run validates the live Auth configuration first. The callback published in Auth must
stay exactly `https://www.theyaar.com/admin/auth/callback`.

## Step 5 — Accept, enrol TOTP, claim

1. Open the invite email, accept, and set a password.
2. Confirm the email address.
3. Enrol an authenticator app. AAL2 is mandatory; `/admin` redirects to `/admin/mfa` otherwise.
4. Decrypt the token and enter it at `/admin/setup`:

```bash
node scripts/owner-key.mjs decrypt --ciphertext .local/keys/invitation.enc
```

Claim additionally requires a TOTP code used within the last 10 minutes, so sign in
immediately before claiming. Do steps 3–5 in one sitting: the invitation lasts 24 hours.

## Step 6 — Approve the listings

Sign in at `https://www.theyaar.com/admin` (production build only — the preview
deployment points its admin client at a different project whose `public` schema is empty).

- Creators → `pending` → **Approve creator**
- Campaigns → `pending` → **Approve & publish campaign**

Verify:

```bash
curl -s https://www.theyaar.com/api/creators
curl -s https://www.theyaar.com/api/campaigns
```

Both should now return one record.

## Before approving, check these two records

- The pending campaign is titled `I WANT TO PROMOTE MY INCOMING IRONMAN SUIT`
  (business `STARK INDUSTRIES`, budget ₹1,00,00,000). Approving publishes it to the
  homepage "Fresh on YaarLink" section. Edit or delete it first if it is a test record.
- The pending creator links Instagram `/Utv/` but a profile URL of `/utsa__v9/`.
  Confirm which handle is real; `verified_followers` is stamped from the claimed count.
- The `incomplete` creator (`Ashish`) cannot be approved. The review RPC requires
  `status='pending'`, and the public card needs a category and a profile link. That
  person must sign in and finish their own profile.
