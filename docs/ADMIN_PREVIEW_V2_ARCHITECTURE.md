# YaarLink Admin Preview v2 — Architecture Proposal

**Status:** Prepared for review; no project or resources created.  
**Date:** 2026-11-05  
**Scope:** Isolated, non-production Admin Preview environment and the implementation gates needed before setup. This document is design only.

## 1. Decision summary

Create a new, independent Supabase project named **`yaarlink-admin-preview-v2`**, preferably in Mumbai (`ap-south-1`) if Supabase offers that region for the selected organization and plan. The project is to have its own PostgreSQL database, Supabase Auth tenant, API endpoint, and project keys. It must have its own Preview-only application configuration and synthetic test data. It must not connect to Production or inherit Production database credentials.

The proposed environment boundary is:

```text
Admin Preview browser
        │ same-origin HTTPS; no database credentials
        ▼
Admin Preview server (separate Preview deployment/configuration)
        │ project-specific Supabase URL + least-privilege server credentials
        ▼
Supabase project: yaarlink-admin-preview-v2
  ├── independent Postgres database
  ├── independent Supabase Auth
  ├── independent API endpoint and keys
  └── synthetic-only records

Production Supabase and Production Vercel configuration: no connection from this design
```

No production URL, database credential, service-role key, signing secret, Auth tenant, or direct database route is to be configured in this Preview environment. The previous Preview project's current absence from the project listing does not establish its prior database association or imply that any historic deployment is disconnected.

## 2. Isolation and data boundaries

### Supabase project

- One newly created project, with its own Postgres cluster/database, Auth tenant, REST/API endpoint, project URL, and keys. Confirm this isolation in the creation flow and in a post-creation read-only inventory.
- Region: request Mumbai (`ap-south-1`) first. Availability, exact displayed region identifier, and plan eligibility must be confirmed at setup time; do not silently fall back to another region. If unavailable, stop and request a region decision.
- Do not create a database branch of Production, restore a Production backup into this project, or point the Preview app at a Production hostname.
- Project credentials belong only in a Preview-scoped secret store/configuration. Never place a service-role or database password in browser code, public build variables, source control, logs, or client-visible error responses.

### Synthetic-only data

- Seed deterministic fictional users, brands, creators, campaigns, applications, and moderation cases. Use reserved/example email addresses and synthetic assets.
- Do not copy, sample, hash, or transform Production marketplace records into this project. Do not use real user contact details or real authentication factors.
- Add a pre-release test that rejects known Production host/project identifiers in Preview server configuration. Do not log the full connection URL during tests.
- Provide separate synthetic test identities and resettable fixtures; no shared Production accounts.

### Preview-only application configuration

- A future Admin Preview deployment should use only its own Preview-scoped `SUPABASE_URL`, publishable/anon key, server-side secret key (only if the selected architecture truly requires it), session/signing material, and `APP_URL`.
- Verify each variable's exact target and branch scope before writing it. Do not inherit or copy Production variables. No Vercel variable is changed as part of this proposal.
- Browser requests should use same-origin application routes. The browser receives only a public/publishable key; all privileged work remains on the server.

## 3. Production isolation and possible future marketplace data

The Admin Preview has **no direct Production database connection**. Do not put Production credentials, connection URLs, keys, or JWT signing secrets in the new Supabase project or Preview deployment. Do not create a Production-linked database foreign data wrapper, replica, branch, or shared Auth tenant.

If future Admin workflows require Production marketplace information, use a separately reviewed **Production-owned, server-side API**:

1. Expose named, allowlisted operations (for example, a narrowly scoped search or a single-record review), not arbitrary SQL, PostgREST access, or a generic database proxy.
2. Authenticate the Preview server as a distinct workload identity using short-lived, audience-bound credentials; validate the caller and requested action server-side. Keep any Production API credential exclusively in the Production service's secret store. No Production Supabase service-role key is disclosed to Preview.
3. Authorize every operation using individual Admin identity, current role, MFA assurance, resource scope, and purpose. Prefer read-only operations; require explicit approval and stronger controls for any future write operation.
4. Minimize and redact returned fields. Enforce request limits, rate limits, timeouts, and abuse monitoring. Never return credentials, secrets, or unnecessary personal data.
5. Write append-only audit events on both sides, correlated by request ID, recording actor, action, target, purpose, decision, timestamp, and outcome without copying sensitive payloads into the log.
6. Add threat modeling, privacy review, security testing, and explicit approval before implementing this integration. It is not part of the initial Preview architecture.

## 4. Fresh Admin security design

The previous Admin authentication implementation is not to be reused. This section specifies desired controls, not code or schema.

### Identity lifecycle and first owner

- **Invite-only:** public Admin registration is disabled. An existing authorized owner/operator initiates invitations to an approved address; invitations are single-use, short-lived, and auditable. Invites do not grant roles based on user-supplied claims.
- **First owner:** use a controlled, one-time bootstrap procedure after the project and application are configured. The organization owner verifies the initial person's identity out of band, sends a time-limited invitation through a trusted operator channel, and grants the first-owner role using a reviewed, auditable server-side operation. The bootstrap capability is disabled immediately after success and cannot be re-enabled by a public route. No permanent setup password or public “first user becomes owner” endpoint.
- Store each administrator as a distinct Supabase Auth identity with a stable user ID; prohibit shared administrator accounts. Invitation, acceptance, role grant, suspension, and removal each create audit events.
- Define an emergency owner recovery procedure with two-person approval where practical. Never bypass MFA through a publicly reachable recovery endpoint.

### Authentication, MFA, passkeys, and recovery

- Use the new project's Auth tenant. Disable public sign-up and configure allowed redirect URLs to the Preview application's exact HTTPS origin(s) only.
- Require MFA for all Admin routes and APIs. Server-side authorization must validate the authenticated identity and the required MFA assurance level on every protected operation; hiding UI controls is not authorization.
- TOTP is the baseline second factor if supported by the selected Auth configuration. Passkeys are optional, subject to a separate compatibility and security review. If implemented, use a maintained, reviewed WebAuthn implementation with strict origin/RP-ID checks, short-lived one-use challenges, and replay protection; do not import the old Admin passkey code.
- Issue recovery codes as high-entropy, one-time values. Show them once, store only salted hashes, rate-limit attempts, and invalidate a code after use. Recovery and factor reset require identity re-verification and an audit event; recovery must not lower MFA requirements for the account.
- Keep access-token lifetimes appropriately short. For session revocation, disable/suspend the identity, revoke its refresh sessions using the Auth administrative interface from the server, and invalidate application sessions. Because already-issued JWTs may remain usable until expiry unless checked/revoked by the chosen design, privileged requests must also check active account/role state (or an equivalent revocation mechanism). Test revocation end to end.

### Authorization and RLS

- Maintain explicit roles and permissions (for example, owner, administrator, moderator, read-only auditor) with least privilege. Keep role assignment server-controlled; never trust a role supplied by the browser or editable user metadata.
- Deny by default at both API and database layers. Every route checks identity, active status, role, resource scope, MFA, and operation-specific permission.
- Enable RLS on every table exposed through the Supabase API. Revoke broad/default grants as appropriate, write policies for each role and operation, and verify anonymous, ordinary-user, and wrong-role denial. Do not rely on RLS as a substitute for server authorization or vice versa.
- Keep service-role/secret keys server-only. If used, wrap privileged operations in a small reviewed server module and do not let a service-role client bypass per-operation authorization. Prefer user-scoped access where possible.
- Add automated policy tests for anonymous access, role escalation, cross-record access, suspended users, insufficient MFA, and session revocation.

### Append-only audit logs

- Record authentication/invitation/factor/recovery events and every privileged read or mutation. Include actor ID, role snapshot, action, resource identifier, request/correlation ID, timestamp, reason/approval where applicable, and outcome.
- Exclude passwords, tokens, connection strings, recovery codes, MFA seeds, full payment/contact payloads, and unnecessary personal data.
- The application role may insert audit records but must not update or delete them. Protect the table with restrictive grants and database enforcement; separately export logs to encrypted, off-project storage with retention and tamper-evidence. Alert on audit-write failures rather than silently dropping events.
- Document that project owners with infrastructure-level access can ultimately alter project data; database append-only controls do not replace independent off-project audit retention.

## 5. Backup, recovery, and continuity requirements

| Control | Required design |
|---|---|
| Automated database backup | Daily encrypted logical backup at minimum, plus a pre-change snapshot before every schema migration or risky configuration change. Use provider backups/PITR as an additional recovery layer, not the sole off-project copy. |
| Point-in-time recovery | Target at least **7 days** of PITR as the baseline; prefer **14 days** if available and affordable. Confirm the selected Supabase plan/add-on, actual retention, restore workflow, and recovery-point granularity before setup. If the required window is unavailable, document the gap and obtain an explicit risk decision. |
| Off-project copy | Copy backups to a separate storage account/project, encrypted in transit and at rest with access separated from Supabase project administration. Use managed/KMS-backed encryption where available; rotate and escrow keys safely. Enable object versioning/immutability or equivalent protection and test that the backup operator cannot silently erase all copies. |
| Restore tests | At least quarterly and after material backup/restore changes, restore into an isolated recovery project, verify schema, synthetic fixture integrity, RLS, Auth behavior, and Admin login/MFA; record measured RPO/RTO and delete the test environment only through its own approved process. Never restore test data into Production. |
| Database recovery | Declare incident, freeze risky writes, select a timestamp/snapshot, restore to a separate recovery project, validate migrations and RLS, rotate affected credentials, then cut over only after review and approval. Keep the original project untouched until recovery is accepted. |
| Auth recovery | Treat Auth users/factors and project-level Auth configuration as a separate recovery concern. Confirm what the provider's backup/PITR actually includes. Version non-secret settings as reviewed configuration; escrow provider credentials and SMTP/webhook secrets separately in a secret manager. Do not export passwords or MFA seeds into ordinary backups. If factors cannot be safely restored, use verified re-invitation and MFA re-enrollment, notify users, revoke old sessions, and audit the recovery. |
| Project configuration recovery | Maintain a versioned, non-secret configuration manifest for region, Auth URLs, redirect allowlists, signup/MFA settings, RLS expectations, and project feature settings. Store secrets separately, encrypted, with dual-control access. Reapply and verify configuration through a reviewed runbook; do not assume a database restore recreates project settings or API keys. |

Choose explicit service objectives before implementation: suggested initial targets are **RPO ≤ 24 hours** for the daily off-project backup (PITR provides the finer recovery window) and **RTO ≤ 1 business day** for this non-production environment. Adjust after cost and operational review.

## 6. Plan, cost, and region considerations

No current price or region-availability quote is asserted here. The connected project inventory does not establish the plan eligibility or current price for a new project; confirm these in Supabase's account/project creation flow immediately before approval.

Budget for a second independent project and its recurring compute/storage, database backups and PITR retention, egress, log retention/monitoring, off-project encrypted storage, key management, and restore-test projects/operations. The project may incur baseline compute cost even with synthetic-only light usage. A Pro/team plan or a separately priced PITR option may be required for the recovery window; verify the actual plan terms, included backup retention, compute sizing, pause behavior, and any add-on costs rather than assuming a free-tier capability. Also account for separate Preview deployment and secret-management costs if applicable.

Mumbai (`ap-south-1`) is the preference, not a guaranteed selection. Confirm that the exact region is offered to this organization for the chosen plan and project type. If not, stop for a user-selected fallback; do not choose a region automatically. Region choice should consider administrator latency, data-residency expectations, service availability, and recovery-region strategy.

## 7. Setup prerequisites and acceptance gates

Before any project creation is approved:

1. Approve this architecture, region (or explicit fallback), plan, budget, RPO/RTO, and PITR retention.
2. Confirm the new project name is available and the requested region/plan are offered. Verify a separate project will provision an independent Postgres and Auth tenant.
3. Select the off-project encrypted backup location, key ownership/rotation process, retention, and restore-test operator.
4. Name the initial owner(s), verify invitation and recovery channels, agree role definitions, MFA baseline, and emergency access procedure.
5. Define the Preview application origin(s), secret-store owner, and test plan to prove no Production credential or hostname is present.
6. Confirm synthetic data fixtures and ensure the environment has no Production data import path.

After a separately approved creation (not authorized by this document), acceptance checks must verify: project ref/region/status; independent Auth and API endpoint; Preview-only secret scopes; no Production endpoint/credential; disabled public Admin registration; required MFA; tested RLS denials; invite and revocation lifecycle; audit immutability/export; synthetic-only records; backup/PITR configuration; and a successful isolated restore drill.

## 8. Implementation sequence (future work; not started)

1. Approve plan, region, cost, backup location, and recovery objectives.
2. Create the new Supabase project only after explicit user approval; record its ref and region without exposing keys.
3. Establish Preview-only secret/configuration boundaries and synthetic fixture strategy.
4. Design and review schema, RLS, roles, audit behavior, identity lifecycle, MFA, recovery, and revocation before any migrations or Admin code.
5. Implement the new Admin system as a separate approved work item; do not reuse the legacy authentication code.
6. Configure only the approved Preview deployment and validate isolation, security controls, and error redaction.
7. Enable backups/PITR/off-project copies; perform and document a restore test before relying on the environment.
8. Complete security review and operational handoff. Keep Production isolated throughout.

## 9. Explicit non-actions and approval boundary

This document does **not** create a Supabase project, database table, migration, key, secret, Vercel variable, deployment, or Admin implementation. It does not deploy, merge, delete, or modify existing deployments and does not change Production settings. **Explicit user approval is required before creating `yaarlink-admin-preview-v2`.**

## 10. Phase 4 finalization review

Reviewed 2026-11-05 before any approval request:

- [x] **No legacy dependency:** the design depends only on the new Supabase project, a maintained/reviewed WebAuthn choice if passkeys are adopted, and a new server-side implementation. The old Admin authentication implementation is excluded (§4, §8 step 5).
- [x] **Production excluded initially:** no Production credentials, database access, branch, replica, backup restore, foreign data wrapper, or shared Auth tenant is part of initial setup (§§1–3); any future Production data path requires separate design, threat model, and approval (§3 step 6).
- [x] **Security controls specified:** invite-only/first-owner lifecycle, mandatory MFA, optional passkeys, recovery codes, and session revocation (§4); roles, RBAC, and database-level RLS with denial tests (§4); insert-only, off-project-exported audit logs (§4).
- [x] **Backup and recovery specified:** daily encrypted backups, ≥7-day PITR baseline (14 preferred), encrypted off-project copies, quarterly restore tests, and separate database/Auth/configuration recovery procedures (§5).
- [x] **Cost/region gates retained:** plan, cost, PITR eligibility, and Mumbai availability must be confirmed before creation; no silent region fallback (§§6–7).
