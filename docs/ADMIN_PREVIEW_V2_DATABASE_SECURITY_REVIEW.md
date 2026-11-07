# YaarLink Admin Preview v2 — Phase 7.1 Database Design Security Review

**Date:** 2026-11-05 · **Branch:** `arena/9b3c6e40-yaarlink`  
**Reviewed:** `docs/ADMIN_PREVIEW_V2_DATABASE_DESIGN.md` at Phase 7 commit `41ecb54efa30fef4bd0dd55351634fc3ebb16803`  
**Review type:** documentation/architecture review only. No database was connected to, no SQL was executed, no Auth setting was changed, no account or invitation was created.

Corrections from this review have been applied to the design document (see its §18). Issue IDs below state whether each fix is a documentation correction (applied) and/or a **pre-implementation requirement** that Phase 8 migration drafts must demonstrably satisfy before execution.

---

## 1. Overall security assessment

The Phase 7 design has a sound foundation: a separate Supabase project/Auth tenant, invite-only identity, deny-by-default RLS, AAL2 as a JWT-visible requirement, server-side authorization in addition to RLS, hash-only recovery codes, an append-only audit intent, synthetic-only Preview data, and explicit unresolved issues. It correctly refuses to reuse the legacy Admin implementation and never treats frontend checks as authorization.

However, the review found that several protections were described at the application layer where the same access is also reachable directly through Supabase/PostgREST APIs. The most important gaps were: session revocation not being consulted by RLS, default `EXECUTE` grants and in-function authorization not being specified for `SECURITY DEFINER` functions, a bootstrap race window, audit integrity depending on revokes/triggers that privileged roles can circumvent, and silent RLS denials being assumed to be logged. These are correctable at design level — none requires abandoning the architecture — but they must be implemented exactly as corrected before the schema is trusted.

**Designed vs implemented reminder:** at the time of this review, only Phase 6 configuration is implemented (public signup disabled; TOTP enroll/verify capability enabled; passkeys disabled). Everything in the Phase 7 document — tables, helpers, RLS, bootstrap, recovery codes, step-up, mandatory AAL2 — is **designed, not implemented**.

## 2. Critical vulnerabilities (in the design as originally written)

| ID | Severity | Affected | Problem | Recommended correction | Fix before implementation? |
|---|---|---|---|---|---|
| C-1 | **Critical** | `admin_session_registry`, all privileged RLS policies (§§6.3, 8.2, 10) | Revocation was enforced by server middleware. A revoked/suspended-session JWT used **directly against PostgREST** bypasses middleware; the original policies checked profile status and AAL but never consulted the session registry, so an unexpired token could retain privileged reads until expiry (up to 3600s). | Add `admin.session_is_current()` (definer helper reading the JWT `session_id` claim, requiring a registry row with `revoked_at IS NULL`) to every privileged policy; deny requests whose session is absent from the registry. Never cache authorization decisions server-side beyond one request. **Applied: design §8.2.** | **Yes** |
| C-2 | **Critical** | All `SECURITY DEFINER` helpers, esp. `claim_first_owner`, `grant_role`, `revoke_role`, `has_permission` (§8.4) | Supabase/Postgres grants `EXECUTE` on new functions to `PUBLIC` by default in many configurations. The design said "search_path locked" but did not require revoking default grants, an empty `search_path`, fully-qualified references, or in-function authorization. A reachable definer function that trusts reachability becomes a privilege-escalation endpoint callable by any authenticated (or anonymous) user with modified request parameters. | `REVOKE EXECUTE FROM PUBLIC`; narrowest-role grants; `search_path=''` + fully-qualified names; every privileged function re-checks `auth.uid()`, active profile, AAL2, session currency, and its specific permission internally; mutations + audit in one transaction; live (uncached) role reads; last-owner guard on grant/revoke. **Applied: design §8.4.** | **Yes** |
| C-3 | **Critical** | `admin_bootstrap_state`, `admin_profiles.is_owner`, `claim_first_owner()` (§4.2) | The original text said the claim "atomically sets the owner" but specified no mechanism. A check-then-act implementation (`IF owner_claimed_at IS NULL THEN …`) lets two simultaneous first-owner requests both pass the check and create two owners / two `super_admin` grants. | Singleton row lock (`SELECT … FOR UPDATE`) + one atomic conditional `UPDATE … WHERE owner_claimed_at IS NULL RETURNING …`; zero rows ⇒ fail. Require super-admin-grade invitation provenance; concurrency-test with parallel claims in Phase 8. **Applied: design §4.2.** | **Yes** |
| C-4 | **High–Critical** | `audit.audit_log` (§7.1) | "REVOKE UPDATE/DELETE + trigger" does not bind the table owner, the migration role, or superusers, all of which can disable triggers or alter the table; the service role also bypasses RLS (though not explicit revokes, its misuse via compromised server code was unaddressed). As written, "append-only" was an application-role property, not an integrity guarantee. Cascading paths were also not fully excluded. | Role separation (migration owner ≠ runtime), hash-chained rows (`prev_hash`/`row_hash`) with the chain head exported off-project and verified quarterly/on restore, no FK referencing `audit_log`, actor FK `SET NULL` + denormalized actor ID, redaction allowlists. State honestly that owner-level tampering is *detectable*, not *preventable*. **Applied: design §7.1.** | **Yes** |

## 3. High-priority issues

| ID | Severity | Affected | Problem | Correction | Before impl.? |
|---|---|---|---|---|---|
| H-1 | High | Direct-API authorization (§§8.1–8.2, 10) | RLS denials are **silent**: a denied PostgREST request writes no audit row. The design implied failed checks are logged (§7), which is only true for server-mediated requests. Attack probing via direct API would be invisible in `audit_log`. | Server writes `denied` rows for requests it mediates; direct-API monitoring via Auth/PostgREST logs in Phase 9; document the blind spot. **Applied: §§7.1, 18.10.** | Yes (design); Phase 9 (tooling) |
| H-2 | High | `admin_recovery_codes` (§6.2) | Hash algorithm, pepper, consumption atomicity, attempt lockout, and post-recovery privilege were unspecified; a naive implementation (fast hash, check-then-mark-used, code = instant AAL2) is brute-forceable and raceable. Recovery codes also do not exist natively in Supabase Auth — an app bug here is an MFA bypass. | argon2id/bcrypt in server code + secret-store pepper; atomic consume; per-admin attempt lockout + security event; code use ⇒ password reset + TOTP re-verification + revoke all sessions; never AAL2-equivalent alone. **Applied: §6.2.** | Yes |
| H-3 | High | `admin_step_up_events` (§6.4) | Check-then-consume race; step-up not explicitly bound to one action; could be minted from a stale AAL2 session. | Atomic consume, per-`action_key` binding, ≤10 min expiry, fresh TOTP at issuance. **Applied: §6.4.** | Yes |
| H-4 | High | Invitations / role grant (§§4.3, 5) | `intended_role_key` at invite time could be abused if acceptance auto-grants it — a lower-privileged inviter (or a tampered invite record) could mint a `super_admin`. Owner-via-dashboard path also bypassed the invitations table, leaving bootstrap state inconsistent. | Acceptance never self-grants beyond what the *inviter's* permissions allowed; `super_admin` intended role requires an owner granter and is re-checked at acceptance/claim; dashboard-created first owner must write matching invitation + audit records. **Applied: §§4.2, 18.3.** | Yes |
| H-5 | High | MFA factor lifecycle (§6.1) | `admin_mfa_status` cache can drift from `auth.mfa_factors`; removing the last TOTP factor mid-session was unaddressed — the session's `aal2` claim persists while no factor exists. Max 10 enrolled factors is excessive. | Cache is never an authorization input (JWT `aal` + live checks govern); last-factor removal forces session revocation + re-enrollment; reduce max factors in Phase 8 config pass. **Applied: §18.12.** | Yes |
| H-6 | High | `login_attempts` (§6.5) | Attackers can authenticate directly against Supabase Auth; those failures never touch the future app, so the telemetry table gives false confidence. | Auth hooks/log drains in Phase 9; treat Auth rate limits as primary control; monitor the blind spot. **Applied: §18.10.** | Design yes; tooling Phase 9 |
| H-7 | High | Session/logout semantics (§§6.3, 8.3) | "Logout" and "global revocation" were named but the exact flow (registry mark + Auth session deletion + refresh-token behaviour) and the fact that already-issued access tokens remain cryptographically valid were only implicit. | Exact flow in §8 of this report; registry-in-RLS (C-1) is what makes an unexpired token useless after revocation; refresh rotation + reuse interval already on (Phase 6) limits refresh-token replay. **Applied via C-1 + §8 below.** | Yes |

## 4. Medium- and low-priority improvements

| ID | Severity | Affected | Issue & correction | Before impl.? |
|---|---|---|---|---|
| M-1 | Medium | `preview.preview_reports` (§9) | Polymorphic `subject_id uuid` has no FK integrity; orphaned/wrong-subject reports possible. → Three typed nullable FKs + exactly-one CHECK. **Applied.** | Yes |
| M-2 | Medium | All FKs (§§3–9) | `ON DELETE` behaviour was stated for identity/audit but left implicit elsewhere (e.g. `moderation_actions`, Module F). Implicit defaults hide cascade risk. → Every FK states an explicit action; `CASCADE` prohibited on identity/audit/security/moderation. **Applied: §18.8.** | Yes |
| M-3 | Medium | Synthetic-data guard (§9) | `CHECK (is_synthetic)` prevents nothing — any real record can be inserted with the flag set. → Reframed as labelling; real controls enumerated (project separation, no Production path/credentials, server-mediated writes, config scanning, UI labelling). **Applied: §9.** | Yes (understanding) |
| M-4 | Medium | Token lifetime (§§6, 8.3) | Project `jwt_exp` = 3600s is long for an Admin surface. → Evaluate 900s in Phase 8/9; live checks (C-1) are the primary mitigation either way. **Applied: §18.11.** | Phase 8/9 decision |
| M-5 | Medium | `audit_log.before/after_state` (§7.1) | Free-form JSON diffs will eventually capture personal data. → Per-resource redaction allowlist. **Applied.** | Yes |
| M-6 | Medium | Privacy/CRM data (§9) | `privacy_requests.requester_email`, `crm_contacts.email` invite real PII into Preview. → Synthetic values only, minimum retention. **Applied: §18.14.** | Yes |
| M-7 | Low | Roles matrix (§5.2) | CRM cell `✅(read)/—` was ambiguous. → Split into `crm.read` / `crm.manage` rows (Support: read only). **Applied.** | Done |
| M-8 | Low | `admin_mfa_status.has_verified_totp` (§6.1) | "GENERATED …" was not valid as sketched (source lives in `auth.mfa_factors`). → Plain maintained column. **Applied.** | Done |
| M-9 | Low | Naming (§9) | Redundant schema-prefixed table names (`preview.preview_reports`) and mixed conventions. → One convention to be fixed in migration drafts. **Noted: §18.13.** | Phase 8 drafting |
| M-10 | Low | Indexes (§11) | Missing: `admin_invitations(accepted_auth_user_id)`, `audit_log(request_id)`, `admin_recovery_codes(auth_user_id, used_at)`, `security_alerts(event_id)`. **Added: §18.13.** | Phase 8 drafting |
| M-11 | Low | `admin_profiles.email_snapshot` (§4.1) | Snapshot can drift from Auth email; must never become an authz input (design already states this — keep the warning in migration comments). | No |

## 5. A–F question findings (condensed)

**A. RLS & permission bypass.** Ordinary admins cannot bypass RBAC via direct Supabase calls **provided** C-1/C-2 corrections are implemented: policies require active profile + AAL2 + live permission reads + current session, client writes are revoked on identity/security tables, and request-parameter tampering is ineffective because authorization derives from `auth.uid()`/JWT claims and server-checked resource scope — never from client-supplied IDs or roles. AAL1 sessions are blocked from all privileged policies (own-profile read excepted). Suspension and permission revocation are immediate because helpers read live tables per request — **as long as** no server/JWT caching of roles is introduced (now explicitly prohibited). Residual risk: service-role misuse in future server code; mitigated by scoped server wrapper + per-operation checks + audit (Phase 4 §4).

**B. Session revocation.** Corrected flow in §8 below. The key insight of this review: revocation is only real for direct-API traffic once the registry is consulted inside RLS (C-1). Session IDs are treated as non-secret identifiers (the JWT `session_id` claim), never as credentials; registry rows store no tokens.

**C. Audit integrity.** Application roles cannot UPDATE/DELETE (revokes + trigger). Owners/superusers/migration roles *can* defeat in-database controls — hence hash-chaining + off-project export make tampering **detectable**; this is now stated honestly (C-4). No FK cascade can remove audit rows. Sensitive actions are logged atomically with the action by definer functions/server; failed checks are logged for server-mediated traffic, with the direct-API blind spot explicitly accepted and monitored (H-1). Export: periodic encrypted export to independent storage including the hash-chain head (Phase 4 §5 alignment).

**D. Production isolation.** **Verified at design level:** the design contains no Production host, ref (other than naming Production as excluded), credential, FDW, linked server, replica, view, or import path. Isolation does not rest on `is_synthetic` (M-3). Synthetic records are additionally fenced by example-domain guidance, server-mediated seed-only writes, config scanning for Production identifiers, and future UI labelling. Any future Production integration requires the separately authorized, narrowly scoped Production-owned API from Phase 4 §3 — a table connection is prohibited by the design.

**E. First Super Admin.** With C-3 applied, two simultaneous bootstrap requests cannot both succeed (singleton conditional update). Identity verification is out-of-band (Phase 6 §6), the invite is single-use/time-limited with hash-only storage, public registration stays disabled, bootstrap permanently locks in the same transaction, and unauthorized promotion is blocked by owner-only `super_admin` grant rules + the last-owner guard. Remaining dependency: the dashboard-bypass bookkeeping rule (H-4) must be in the operator runbook.

**F. MFA & recovery.** TOTP capability is **implemented** (Phase 6); mandatory AAL2, step-up, recovery codes, and factor-lifecycle handling are **designed only**. Passkeys remain disabled by decision (Phase 6), not by omission — the design's WebAuthn notes are future-only. MFA bypass paths reviewed: recovery codes (H-2 hardened), factor removal (H-5), stale AAL2 sessions (step-up freshness, H-3; session currency, C-1), and AAL1 direct-API access (blocked by policies). No bypass path remains *as designed*, subject to Phase 8/9 implementation tests.

## 6. Database design quality (per schema)

- **`admin`:** relationships sound (profile PK = Auth user ID enforces 1:1). Corrections: bootstrap race (C-3), invitation provenance (H-4), MFA cache semantics (M-8/H-5), index additions (M-10). No sensitive secrets stored — recovery hashes and invite token hashes only, with algorithms now specified.
- **`audit`:** single-table append-only design is appropriate; integrity model corrected (C-4). Retention (≥24 months + off-project archive) is reasonable.
- **`security`:** events/alerts split is correct (alerts are the only mutable security table, transitions audited). Telemetry blind spot documented (H-6).
- **`preview`:** Module F tables are fit for synthetic dashboard development; typed report FKs (M-1), explicit cascades (M-2), PII minimization (M-6) applied. `analytics_daily_rollups` FK to campaigns must be declared (or the column documented as a non-FK aggregate key) in migration drafts.
- **`ops`:** site-config and backup-register tables are appropriately minimal; `ops_backup_records.location_label` must never contain credentials or signed URLs (already stated; keep as a migration-draft checklist item).

General: naming convention to be unified (M-9); every table has RLS in the matrix with no orphan tables; no table grants `anon` anything; retention periods are stated per table and are consistent with Phase 4 §5.

## 7. Corrected RLS policy recommendations (normative for Phase 8)

1. Every privileged policy = `admin.is_active_admin() AND admin.has_aal2() AND admin.session_is_current() AND admin.has_permission('<key>')` (helpers read live state; `has_permission` itself re-checks the first three — defence in depth, not redundancy to be optimized away).
2. No policy may reference client-supplied values for identity, role, or ownership; resource-scope checks compare row ownership columns to `auth.uid()` only.
3. `REVOKE ALL` on every new table from `anon` and `authenticated`, then grant back exactly the operations in the §10 matrix; a table must never exist without RLS enabled (design §13 step 5 — retained).
4. Definer helpers: `REVOKE EXECUTE FROM PUBLIC`, empty `search_path`, fully-qualified bodies (C-2).
5. Direct-PostgREST test cases (§9 of the design, expanded) are mandatory acceptance tests, including revoked-session and AAL1 token replay.

## 8. Corrected session-revocation flow (normative)

1. **Login:** Auth issues tokens → server verifies profile active → on AAL2, insert/update `admin_session_registry` with the JWT's `session_id`, IP, user agent.
2. **Every privileged request (app or direct API):** JWT validated by PostgREST/RLS → helpers check active profile, `aal='aal2'`, `session_is_current()` (registry row exists, `revoked_at IS NULL`), live permission. Server-mediated requests repeat the same checks in middleware (same helpers, no caching).
3. **Individual logout:** server marks the registry row revoked **and** calls the Supabase server-side sign-out/session deletion for that session; the refresh token dies with the Auth session, and the still-unexpired access token immediately fails `session_is_current()` everywhere.
4. **Global revocation (suspend/deactivate/role-strip/factor-removal/recovery-code use):** set profile status and/or revoke all registry rows for the admin **and** delete all Auth sessions server-side; next request on any path is denied even with an unexpired JWT.
5. **Refresh rotation:** enabled with a 10s reuse interval (Phase 6); a revoked session cannot refresh because its Auth session is deleted, and a stolen access token alone is bounded by `jwt_exp` and useless once revoked per step 2.

## 9. Implementation-readiness

All Critical/High findings are correctable in documentation and have been corrected in the design (§18). Nothing in this review requires re-architecting, connecting to Production, changing Auth configuration, or creating anything. Phase 8 must still: reflect every **[pre-implementation]** item in migration drafts, add the concurrency/revocation/direct-API tests, resolve Site URL/redirect and password-policy items from Phase 6, and return for approval before executing SQL.

This review made no database, Auth, Vercel, deployment, or Production change. Documentation commits: design corrections and this report are committed separately on `arena/9b3c6e40-yaarlink`.

READY AFTER DOCUMENTATION CORRECTIONS
