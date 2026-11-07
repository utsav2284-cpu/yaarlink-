# Preview first-owner operator procedure

This procedure is for a trusted Supabase project operator, not an application
administrator. It does not create an Auth user or send an email. **Do not run
`--execute` for the real owner without explicit owner approval.** Never put
passwords, connection URLs, bootstrap tokens or token hashes in chat, shell
history, Git, application logs or issue trackers.

1. Independently confirm project `qwngmsedyepghskoagaj`, verify the intended
   email out-of-band, and record a non-secret authorization reference. Identify
   a private directory on the operator's machine, outside the repository and
   web-served paths, with access restricted to that operator.
2. Supply `ADMIN_PREVIEW_OPERATOR_DATABASE_URL` from the operator's secure
   environment or secret manager, without echoing it or entering it as a command
   argument. The CLI accepts only a direct TLS-verified connection to
   `db.qwngmsedyepghskoagaj.supabase.co`, database `postgres`, user `postgres`;
   poolers and connection-string options are intentionally rejected. Only a
   privileged project operator can possess this database credential. No service
   role key is accepted by the CLI. The database must be reachable from the
   operator's machine.
3. With the runtime email and non-secret reference substituted, check without
   writing anything:

   `node scripts/provision-preview-owner.mjs --dry-run --email 'operator-verified@example.invalid' --authorization-ref 'CHANGE-123'`

4. Only after explicit approval, rerun with `--execute` instead of `--dry-run`
   and add `--recipient-public-key /absolute/path/owner-public.pem`,
   `--recipient-key-sha256 <independently-verified-64-lowercase-hex-fingerprint>`, and
   `--token-file /absolute/private/path/encrypted-bootstrap-token`. The CLI checks the
   SHA-256 of the public key SPKI DER against the verified fingerprint before creating the invitation. Use the
   trusted recipient’s RSA public key (at least 2048 bits); verify the key
   fingerprint out-of-band. The output must not exist; it is created with mode
   0600 and contains RSA-OAEP-SHA256 ciphertext, never plaintext. The token is
   never printed; only its SHA-256 hash is inserted, and a
   non-secret creation audit event is recorded in the same transaction. The
   invitation expires in 24 hours. A claimed seat or any pending bootstrap
   invitation, even an expired one, blocks new provisioning. Resolve such
   states through separately approved operator review; do not silently reset.
5. Only after the CLI reports success, deliver the encrypted token file to its verified key holder via the
   organization's approved confidential channel. The recipient must decrypt
   it privately with the matching RSA private key using OAEP and SHA-256, then
   enter the 64-character token into `/admin/setup`; never print or paste it
   into logs or chat. Handle and securely dispose of the encrypted file according
   to the organization's policy. If the CLI reports
   failure or an uncertain commit, **do not deliver the token**: inspect the
   Preview invitation state before any retry.
6. After separate authorization, the trusted operator must also send a
   Supabase Auth invitation for exactly the same email, with the exact verified
   `/admin/auth/callback` URL. The recipient accepts, sets a password, verifies
   email, enrolls TOTP, then uses `/admin/setup` and the separate token. No
   general signup endpoint is created. Live invite-email delivery has not been
   verified from the sandbox.

## Browser verification

Confirm the actual Preview browser origin first. In Preview Supabase Auth URL
Configuration set the Site URL to that exact origin and allow the exact callback
`<verified-origin>/admin/auth/callback` (and any separately verified required
reset URL); do not use wildcards. Verify the CSP permits only the dedicated
Preview Supabase origin. Do not use a Production domain or credentials.

Use isolated synthetic test identities and records, never the real owner seat.
After signing in, open `/admin/diagnostics` to check the actual API responses;
its direct-write probe uses contradictory ID filters and cannot match a row.
Interpret a network/configuration error as **NOT TESTED**, not a security pass.
The displayed counts contain no row contents or tokens. Run with synthetic AAL1 and AAL2 sessions and inspect the network panel for status and error codes; the diagnostic makes a separate anonymous request itself.
In a separately approved disposable synthetic fixture, exercise review RPCs
with authorized and unauthorized roles, then revoke the session and confirm
subsequent reads and RPCs are denied. Check `audit`, `security` and `ops` are
not exposed via PostgREST. Do not post tokens, credentials or record contents.

Test actual synthetic invite, confirmation and reset emails separately: verify
links return to the exact origin, establish the right session, reject expired
or reused links, and never redirect to a supplied external destination. No such
email, browser, or live PostgREST test has been completed by this script.

The authenticated admin browser client is pinned to
`https://qwngmsedyepghskoagaj.supabase.co`. If `NEXT_PUBLIC_SUPABASE_URL` is
set to a different value, admin access fails closed instead of contacting that
project. Configure the deployment's public URL and publishable key for the
dedicated Preview project; do not copy Production configuration into Preview.
This does not establish the browser's own external origin or configure Auth
redirects and email delivery.

## Windows owner key and separate email steps

Run `pwsh -File scripts/create-preview-owner-rsa.ps1` on the owner's Windows
computer (PowerShell 7.2+). It creates a new ACL-restricted directory in
Documents, an RSA-3072 private key that never leaves the device, and an SPKI
public key. Transfer **only** `owner-public.pem` to the trusted operator.
Verify the displayed SHA-256 fingerprint independently through a separate
trusted channel; the operator must pass that exact lowercase fingerprint to
the provisioning CLI. Never send the private key, database credentials or
passwords through chat. The owner must maintain a secure backup of the private
key; losing it makes the encrypted token unreadable.

On the trusted operator machine, supply `ADMIN_PREVIEW_OPERATOR_DATABASE_URL`
from an approved secret manager in the process environment, not command line or
chat. Set the public key path and fingerprint flags above. Run dry-run first;
if it passes, execute once. Optionally add `--send-encrypted-email` on the
execution command after setting **Preview-only** `PREVIEW_BOOTSTRAP_RESEND_API_KEY`
and `PREVIEW_BOOTSTRAP_EMAIL_FROM` in the environment. This sends only the
newly generated ciphertext attachment to the authorized owner. Provider
acceptance is not proof of delivery: verify delivery through the provider or
with the recipient. On an uncertain result, do not retry blindly. Alternatively
deliver the ciphertext using an independently approved secure channel.

The Auth invitation is separate. Configure custom SMTP in the dedicated
Preview Supabase project's Auth SMTP settings: provider SMTP host, port,
username, password, and a verified sender address/domain. Supply the password
through the Supabase dashboard or approved secret manager, never chat. Verify
actual delivery with a synthetic recipient before the owner's invitation.
Independently verify the browser origin and configure Auth Site URL and the
exact `/admin/auth/callback` allowlist (no wildcard); this project currently
only has localhost callbacks. Then, on the trusted operator machine, set
`SUPABASE_PREVIEW_MANAGEMENT_TOKEN`, `SUPABASE_PREVIEW_SERVICE_ROLE_KEY`
(a legacy Preview-only service-role JWT), `PREVIEW_VERIFIED_AUTH_CALLBACK`,
and `ADMIN_PREVIEW_OPERATOR_DATABASE_URL` via the secret manager. Run
`node scripts/invite-preview-owner-auth.mjs --dry-run` followed by
`--execute` only after a protected bootstrap invitation exists and all
prerequisites have been independently verified. The script checks Preview
TLS, state, exact callback and custom SMTP and uses `inviteUserByEmail` for
the authorized address. It reports API acceptance only, not delivery. If a
request outcome is uncertain, inspect Auth and provider state before retrying.
This workflow has not been tested against live Auth or a real mail provider.
