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
