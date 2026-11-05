# YaarLink Admin Preview v2 — Phase 7.7 Final Global Security Review

**Date:** 2026-11-05 · **Branch:** `arena/9b3c6e40-yaarlink` · **Design project:** `qwngmsedyepghskoagaj` (`ap-south-1`, PostgreSQL 17)  
**Scope of this review:** the corrected design in `docs/ADMIN_PREVIEW_V2_DATABASE_DESIGN.md` (Phase 7.7 pass). Statuses use the mandated vocabulary and distinguish *designed* from *implemented/tested*. No Critical or High **design** blocker remains; implementation correctness is **NOT TESTED** until the migration milestone's runtime checks run.

## Fourteen-area review

| # | Area | Design status | Basis / remaining work |
|---|---|---|---|
| 1 | Authentication & authorization consistency | **PASS (design)** | One unified predicate (§20.11); §8.1 bootstrap exception is the only deviation and is scoped to §20.1A. Runtime enforcement NOT TESTED |
| 2 | Ownership bootstrap & transfer | **PASS (design)** | §20.1A bootstrap predicate, authenticated-RPC-only `claim_first_owner`, saga evidence binding, state-aware invariants; concurrency/retry specified. Runtime NOT TESTED |
| 3 | Invitation lifecycle | **PASS (design)** | Atomic consumption, unique indexes, email binding, immutability triggers, same-table CHECKs + deferred cross-table triggers (§§4.3, 20.10) |
| 4 | RBAC & permission enforcement | **PASS (design)** | 30 assignable + 1 non-assignable permissions; `is_current` lifecycle (now formally columned, §5.1); live reads in `has_permission` |
| 5 | MFA & live factor verification | **PASS (design)** | Live `auth.mfa_factors` inspection with fail-closed Auth-API fallback (§20.11); factor lifecycle §20.7; no invented webhook |
| 6 | Session registration, revocation, expiry | **PASS (design)** | Registry-in-RLS (`session_is_current`), documented sign-out scopes only, revocation ≠ suspension (corrected capability matrix, §20.5) |
| 7 | Suspension & deactivation | **PASS (design)** | DB-transaction enforcement at commit; Auth cleanup reported completed/pending/unavailable (§20.12(6)) |
| 8 | Audit immutability & hash chain | **PASS (design)** | Single canonical formula (§20.4); test vector independently recomputed in Phase 7.7: 443-byte input → `06e5994cb5616437ea5196920ed84c34c33db64636f1a3c3817c9896cf08f187` **reproduced**. Detect-vs-prevent boundary honest |
| 9 | Identity-operation saga & recovery | **PASS (design)** | `identity_operations` fully integrated (§4.5); both failure directions, reconciliation, no fictitious atomicity (§20.12) |
| 10 | RLS & SECURITY DEFINER functions | **PASS (design)** | Default-deny, column grants + views model (§20.6), definer lockdown + explicit grants for `append_audit`/`claim_first_owner` (§13) |
| 11 | Foreign keys, indexes, constraints | **PASS (design)** | Consolidated FK inventory (§25): every FK has an explicit `ON DELETE` with reason; no defaults relied upon |
| 12 | Migration ordering | **PASS (design)** | Fail-closed stubs (Step 1) → tables+policies → real helper bodies (Step 6); same-transaction RLS rule; no permissive window (§13) |
| 13 | Concurrency & race conditions | **PASS (design)** | Singleton-lock + conditional-update bootstrap; partial unique live assignment/invite indexes; advisory-lock audit chain; race tests specified (§20.9) |
| 14 | Failure recovery & rollback | **PASS (design)** | Transactional migrations (failure rolls back to prior safe state); saga retry/reconciliation; audit-checkpoint recovery (Phase 4 §5 alignment) |

## Issue-by-issue closure (Phase 7.7)

| ID | Issue | Correction | Sections | Closed (design) |
|---|---|---|---|---|
| 7.7-1 | All-sessions revocation conflated with suspension | Revocation never changes `status`; suspension is separate and also revokes all sessions; both audited | §§5.2, 6.3, 20.5 | Yes |
| 7.7-2 | Bootstrap execution role/JWT ambiguity | Authenticated-RPC-only claim; invitee-JWT vs service-role saga operations enumerated; saga evidence binding; pending saga authorizes nothing | §20.1A | Yes |
| 7.7-3 | Function grants unspecified | Explicit `append_audit` (service_role) and `claim_first_owner` (authenticated) grants at Step 6; anon/PUBLIC execute = review failure | §13 | Yes |
| 7.7-4 | No consolidated FK inventory | §25 inventory for all five schemas with explicit `ON DELETE` + reasons | §25 | Yes |
| 7.7-5 | Invalid Mermaid dotted ER relationship | Replaced by an ERD comment; only valid entity relationships remain | ERD | Yes |
| 7.7-6 | IP canonicalization under-specified | IPv4 dotted-quad / IPv6 RFC 5952 via PostgreSQL `inet`; hash and test vector unchanged after re-verification | §20.4 | Yes |
| 7.7-7 | Ambiguous composite event notation | `factor_removed` / `mfa_failure` as separate formal event types | §20.7 | Yes |

## Remaining implementation blockers (not design blockers)

1. Site URL + redirect allowlist unset (Phase 6 open item) — blocks invitations and live Auth-flow tests. **BLOCKED on the approved Admin Preview origin.**
2. Password policy strengthening requires a dashboard configuration step. **NOT TESTED / pending Phase 8 configuration.**
3. No first Super Admin exists; bootstrap is implemented as a function but cannot be exercised end-to-end until items 1–2 and the Admin auth UI exist. **NOT TESTED.**
4. MFA/AAL2 enforcement exists as database design; runtime behaviour is verified only after migrations + tests run in the implementation milestone. **NOT TESTED at design-review time.**

## Verdict

Phase 7.7 design review: **PASS** — no known Critical or High design blocker remains. Implementation and runtime verification proceed in the following milestone against project `qwngmsedyepghskoagaj` only.
