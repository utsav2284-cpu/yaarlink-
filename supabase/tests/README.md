# Preview DB rolled-back test harness

Tests A–D were executed on 2026-11-06 against the dedicated Preview project
`qwngmsedyepghskoagaj` via single statements of the form
`BEGIN; <synthetic fixtures + simulated JWT claims via set_config('request.jwt.claims',...)> <DO assertions>; ROLLBACK;`.
Nothing persists: the real bootstrap seat, audit log and all tables were verified unchanged after each run.

Results (all PASS, rolled back):
- TEST_A bootstrap: claim_first_owner happy path (profile active+owner, super_admin, session registry,
  audit `owner.claimed`), second claim → `bootstrap_locked`, AAL1 claim → `aal2_required`.
  Found+fixed: saga actor FK bug, append_audit digest schema bug.
- TEST_B creator/campaign lifecycles: approve→active+matching, duplicate→invalid_transition,
  reason_required, request-changes→resubmit→approve, reject, suspend→reactivate;
  publish→live, duplicate publish rejected, pause/resume/end, future start→scheduled, reject;
  decision rows, notifications (>=8), audit chain head matches last row. All assertions passed.
- TEST_C negative authz: AAL1 denied, unknown session denied, revoked session denied,
  missing TOTP factor denied, moderator approve/publish denied (review allowed).
- TEST_D recovery codes: 8 codes, SHA-256 hex hashes stored, rolled back.
  Found+fixed: extensions.sha256 → extensions.digest.

True parallel-session concurrency and live HTTP Supabase Auth flows (login/TOTP over REST)
remain NOT TESTED from the sandbox (no egress to *.supabase.co); row-lock + state-machine
guards are the verified mechanism.

## Current application API dependency inventory

- Browser `adminSupabase()` defaults to `preview`. The Control Center selects all
  columns of `preview.preview_creators` and `preview.preview_campaigns`, ordered
  by `created_at`. It calls `preview.review_creator(uuid,text,text)` and
  `preview.review_campaign(uuid,text,text)`. There are no direct PostgREST URL
  constructions or other table/view calls in the application.
- The Control Center calls `admin.register_my_session()` after AAL2. MFA calls
  `admin.generate_my_recovery_codes()`. Bootstrap requires the separately
  granted `admin.claim_first_owner(text)` RPC, although no bootstrap claim UI
  exists. The preview RLS policies call `admin.has_permission(text)` internally.
- Supabase Auth calls for login, sign-out, reset and MFA use the Auth API, not
  PostgREST. Email callback uses Supabase Auth session/OTP/code verification.
- No application PostgREST dependency on `audit`, `security`, or `ops` was found.
  Security-definer functions use internal schemas on the server.

## Manual Preview verification (no real first owner required)

Live REST/Auth tests from the sandbox fail to connect and are NOT TESTED. Use a
separate synthetic Preview admin provisioned by an authorized operator; never a
production user or real first-owner invitation. First confirm the intended HTTPS
browser origin. Set the Preview Auth Site URL and exact redirect allowlist to
that origin and `/admin/auth/callback` (no wildcard); invite emails must specify
that callback explicitly. Confirm platform API settings expose the intended
schemas. Do not enter tokens, keys or passwords in chat.

In the browser's network inspector, check that anon requests to Preview queue
and review RPC are denied; a synthetic AAL1 admin cannot read/act; after TOTP,
registration plus queue reads and permitted RPCs succeed; a moderator cannot
approve/publish; after revocation or TOTP removal requests fail. Check that a
queued approval makes its decision, notification and audit entry atomically.
Check schema rejection for audit/security/ops, and that direct PATCH of creator
or campaign rows is denied. Test from the actual external origin, including
reloading after a configuration change to check persistence.

For Auth, send test invite, verification, and recovery links to the synthetic
inbox using the exact callback. Verify session establishment and password setup
for invite/recovery, MFA after confirmation, and that expired/reused/tampered
links show an error. Check no external `next` parameter redirects off site. Test
with the browser that initiated PKCE, since its verifier is stored there.
Recovery-code redemption is not implemented; generated codes must not be relied
on for recovery. A local HTTP 200 or mocked test is not an email-flow test.

The bootstrap implementation now exposes only `admin.claim_invited_first_owner`
for the authenticated invitee; it validates a separately delivered 32-byte
bootstrap token, verified Auth email, live TOTP and a fresh TOTP AMR before
calling the internal `claim_first_owner`. A privileged trusted operator must
create the pre-existing invitation out of band; this repository does not yet
provide the controlled operator invitation-creation tool. The owner's claim UI
requires no SQL, but bootstrap is not operational until that operator procedure
and actual email flow are established and tested. `bootstrap_claim.sql` is a
transaction-rolled-back synthetic claim test.

Recovery-code generation was disabled: the prior SQL SHA-256 generator is not
compatible with the approved server-side peppered bcrypt/Argon2 design. Redemption,
rate limiting, security events and the approved assisted recovery process are not
implemented. Do not rely on old codes or use them for authorization.

## Recovery controls (Preview)

`admin_recovery_controls` and `admin_recovery_attempts` are RLS-enabled with no
runtime-role table grants. A pending recovery is part of the live
`admin.is_active_admin()` predicate, so permission checks and session
registration fail even for an existing AAL2 JWT. SQL tests exercised that
boundary and a synthetic single-use conditional update in rolled-back
transactions. `backend/admin-recovery-store.mjs` serializes work on the profile
row, records failure/event/audit rows, and revokes registry sessions atomically;
its automated tests use a mock connection, not a live Postgres integration.

The store is deliberately **not wired to a public route**. Before exposing it,
a trusted backend must verify the caller's Supabase Auth JWT, bind all claims to
the verified subject, use a narrowly scoped Preview-only database credential and
server-only pepper, and enforce an independently authorized assisted factor
reset and re-enrollment. The current implementation has no safe audited method
to clear the pending flag or prove replacement-factor enrollment. Do not treat
mock tests, a DB flag, or a recovery code as AAL2. The legacy SHA generator stays
disabled and no production recovery endpoint has been enabled.

### Restricted recovery runtime (not yet exposed)

Preview migrations `admin_preview_recovery_runtime` and `admin_preview_recovery_runtime_monotonic` add a NOLOGIN, non-BYPASSRLS role. Rolled-back synthetic SQL exercised cross-user isolation, rejection of recovery-state reversal, pending-state clearance, session un-revocation and invalid event names. The adapter now assumes this role and takes a per-user transaction advisory lock; its JavaScript tests are mocked, not a live concurrency test.

There is deliberately no provisioned runtime login, recovery route, or factor-reset/re-enrollment workflow. An unwired server-only identity verifier checks the exact token with the dedicated Preview Auth getUser endpoint, binds the resulting user ID to minimal JWT claims, and has mock tests only. An unwired configuration helper pins the direct Preview host, dedicated login and certificate-verified TLS; its connection has not been tested. A future trusted Preview-only server login must be granted SET capability for this role and kept in a secret store. The role's RLS uses transaction JWT claims supplied by that trusted server: it is **not** a defense against a compromised runtime credential or a caller allowed to set arbitrary claims. Verify tokens against Preview Auth and bind claims to the verified identity before calling the adapter; never expose this database credential or accept client-supplied actor flags. Do not enable redemption until an audited assisted factor-recovery process can safely resolve the pending state.

A rolled-back synthetic Preview SQL sequence also exercised the runtime role’s advisory lock, code regeneration selection, conditional use, pending-state upsert, session revocation and event logging. It was sequential SQL, not the JavaScript adapter over a real connection or a concurrency test.

Recovery generation and rotation now require a verified JWT TOTP AMR timestamp within ten minutes, in addition to an active profile, AAL2, current registered session and live verified TOTP factor. `recovery_fresh_totp.sql` is a rolled-back synthetic database test; malformed, stale and future evidence was also checked in Preview. The identity verifier preserves only validated token TOTP AMR entries for this database check. These checks do not by themselves establish a factor-recovery completion process, and the service remains unexposed.

The server-side generation composition now connects the fixed Preview Auth verifier, pinned connection configuration, and transaction store. It is not an HTTP route and is not connected to a UI. Tests use isolated verifier/store substitutes; no live database login exists. Generation checks live authorization before and after bcrypt hashing, before invalidating or writing codes. The second check narrows, but does not eliminate, races with independent Auth or session changes. Redemption remains unexposed until an audited password-reset and replacement-factor process can safely resolve recovery pending.
