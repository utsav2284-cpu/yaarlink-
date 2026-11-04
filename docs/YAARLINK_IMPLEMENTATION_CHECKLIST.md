# YaarLink Super Admin — Complete Implementation Checklist

Last updated: 2026-11-04
Branch: `arena/9b3c6e40-yaarlink` · Base: `e4c6a91` · Production: **unchanged**

This checklist is the build plan for the complete Super Admin Control Center
(13 Core Parts + Modules 14–45). It is derived from
`docs/YAARLINK_MASTER_PROGRESS.md`, which remains the evidence tracker.
A box is ticked only when the item is implemented **and** tested with real
database-backed behavior in a local/disposable environment. UI alone never
ticks a box.

**Production strategy (owner directive, 2026-11-04):** no partial production
releases. Everything is built, integrated, tested, and security-verified
locally/staging first, then launched in **one controlled production release**
after explicit owner approval. The earlier per-release gates (backup/PITR
verification, staging migration evidence, rollback rehearsal, owner-shown
results) all still apply to that single launch.

Status key: ✅ implemented+tested locally · 🔶 partial · 🔷 foundation only ·
⛔ blocked · ⬜ not started

---

## Foundation — Authentication & Identity (Phases 0–2B, Parts 10–11, Modules 24–26, 40–42)

- [x] ✅ Individual DB administrator accounts; no shared target account, no
      public admin registration (Phase 2A)
- [x] ✅ Restricted first-owner setup: hashed one-time 20-minute email token,
      second-owner refusal, owner-chosen password (Module 40)
- [x] ✅ Single official login `/admin/sign-in`; legacy shared-password
      module/routes deleted locally; retired env vars removed from local
      config (production values untouched, gated)
- [x] ✅ Mandatory MFA: TOTP (QR/manual, encrypted secret, replay counters),
      10 hashed one-time recovery codes, Passkeys (SimpleWebAuthn, hashed
      one-time challenges, counter/replay protection)
- [x] ✅ 10-minute pending sessions, 12-hour MFA-verified cap, 15-minute
      step-up, revocation/expiration, lockouts + rate limiting
- [x] ✅ Fixed 8-role / 54-permission RBAC in reviewed source; rank ceilings;
      last-active-Super-Admin protection (Part 10 — locally)
- [x] ✅ Test evidence: 67/67 unit, 100-check TOTP/recovery E2E, 88-check
      Passkey software-authenticator E2E, 66/66 real-Chromium unified-login
- [ ] 🔶 Owner's own local setup + first TOTP enrollment + dashboard entry
      (local DB rebuilt 2026-11-04 after sandbox reset; 0 admins)
- [ ] 🔶 Physical platform/roaming Passkey registration + sign-in evidence
- [ ] 🔶 Role-taxonomy reconciliation vs spec (Moderator, Support Admin,
      Finance Admin, Security Admin) — documented mismatch, no renames yet
- [ ] ⛔ Staging migration + account tests; recovery drill; backup/PITR gate

## Phase 3 — Core Dashboard (Part 1, Module 14)

- [ ] 🔶 Modular admin shell: consistent sidebar/topbar across sections,
      permission-driven navigation (server-enforced, not just hidden UI)
- [ ] 🔶 Overview with real counts/queues (pending verifications, open
      reports, new contacts/applications); unavailable metrics never shown
      as zero
- [ ] ⬜ Global search across creators/campaigns/users/contacts (permission
      and field-level filtered)
- [ ] ⬜ Task/queue widgets, saved views, dashboard customization
- [ ] 🔶 Split monolithic `/api/admin/data` + `/api/admin/moderation` into
      per-permission endpoints so non-Super-Admin roles work end-to-end

## Phase 4 — Live Marketplace (Parts 3, 4, 6, 7; Module 43)

- [ ] 🔶 Creator management: list (search/filter/sort/pagination), detail
      page, verification workflow with history/timeline, contact-field
      permissions, status actions with audit
- [ ] 🔶 Campaign management: list/detail, approve/publish/feature lifecycle,
      verification, expiry handling, applicant view
- [ ] 🔶 User/brand management: account detail, suspension/restriction state
      + history (needs backward-compatible migration), notes
- [ ] 🔶 Reports/moderation queue: detail, evidence, actions, escalation
- [ ] ⬜ Live updates (polling): manual refresh, stale indicators, retry;
      optimistic-concurrency/conflict protection on edits

## Phase 5 — Business Management (Modules 15–18)

- [ ] 🔷 Brand CRM: pipeline, ownership, follow-ups, notes, enquiry history
      (from real contacts/brands)
- [ ] 🔷 Private creator matching: admin-only shortlists, consent-aware
      sharing; never a public directory (Module 16)
- [ ] 🔶 Campaign execution: milestones, deliverables, approvals, issue
      workflow (Module 17)
- [ ] 🔷 Finance records (manual-first): quotes/invoices/payments as records
      only — no checkout, no card data; provider only if owner approves
      (Modules 18, 29)

## Phase 6 — Website Management (Parts 2, 5, 9; Module 19)

- [ ] 🔶 Website availability controls UI (online/maintenance/emergency)
      on top of the existing local foundation; scheduling; audit
- [ ] 🔷 Homepage/content CMS: draft → preview → revision history →
      publish with permissions and rollback (Part 5)
- [ ] 🔶 Settings management with validation + audit trail
- [ ] 🔶 Communications center: templates, admin notifications, delivery
      evidence, preferences (Part 9, Module 19)

## Phase 7 — Analytics & Operations (Parts 8, 12, 13; Modules 20, 23, 34)

- [ ] 🔷 Analytics/BI: defined metrics, time ranges, drill-downs,
      permissioned exports from real records (Part 8)
- [ ] 🔶 Audit log UI: search/filter/export over identity security events +
      domain audit; retention policy (Part 12, Module 36)
- [ ] 🔶 System health UI: service checks, DB status, job/queue state,
      error summaries — real signals only (Part 13, Module 34)
- [ ] 🔷 Privacy operations: data-request queue, export/delete evidence,
      retention automation (Module 20)
- [ ] 🔷 SOC foundations: security-event triage queue, alert rules on
      lockouts/MFA failures (Module 23)

## Phase 8 — Security & Reliability (Modules 21–39)

- [ ] ⛔ Backup/DR: verify hosted Supabase backup/PITR **or** create +
      restore-test a manual backup; document RPO/RTO (Modules 21, 35)
- [ ] 🔶 Bulk operations framework: preview → confirm → audited apply with
      per-item results and safe reversal (Module 22)
- [ ] 🔶 Fraud signals: duplicate/fake account detection aids for human
      review (Module 28)
- [ ] 🔶 Secure uploads: centralized validation, scanning hooks, quarantine
      state (Module 27)
- [ ] 🔶 API/network hardening review per endpoint as modular splits land
      (Module 30)
- [ ] 🔶 Domain/DNS/email security verification (SPF/DKIM/DMARC) —
      owner-side evidence (Module 31)
- [ ] 🔶 SDLC/supply chain: enable GitHub secret scanning + push protection
      (owner-side), dependency update cadence (Module 32)
- [ ] 🔶 Incident response: diagnose failed production redeploy
      `dpl_DsRgoApAhB7pR438VRwsiXWehakm` from runtime logs; runbooks,
      severity levels (Module 33)
- [ ] 🔶 Continuous security testing: scheduled scans, auth/RBAC regression
      suites in CI (Modules 37–39)

## Phase 9 — Local Offline Dashboard (Module 44)

- [ ] 🔷 Explicit mode banner (Local Development / Local Offline /
      Production Live), last-sync state
- [ ] ⬜ Offline read/search over locally cached non-sensitive data
- [ ] ⬜ Offline drafts/notes with conflict detection; **never** silent sync
      of sensitive actions; production credentials never in browser code

## Phase 10 — Public Website Optimization (Module 45)

- [ ] 🔶 Technical audit of the live public site; fix only verified issues
- [ ] 🔶 Technical SEO (metadata, sitemap, structured data where accurate)
- [ ] 🔶 Accessibility pass (keyboard, contrast, labels, EN/HI/PA)
- [ ] 🔶 Performance/Core Web Vitals measurement + fixes

## Phases 11–13 — Integration, Production Preparation, Launch

- [ ] 🔶 Whole-system integration tests: role × module matrix, browser E2E
      on desktop/mobile, public-user regression (signup/login/creator/
      business flows unchanged)
- [ ] ⬜ Staging environment: production-like config, migration rehearsal
      (`20261104` → `20261105` → `20261106` identity order), test accounts
- [ ] ⬜ Security review: OWASP web/auth/API checklist, negative tests per
      privileged operation
- [ ] ⬜ Backup restore test in isolation; rollback plan rehearsed
      (code revert keeps additive schema; env retirement reversed via
      secret manager)
- [ ] ⬜ Final production-readiness report (completed/pending modules, test
      results, security results, migration plan, backup status, rollback
      plan, known issues, recommendation)
- [ ] ⬜ **Explicit owner approval** → one controlled launch → post-launch
      verification (site, admin login + MFA, APIs, DB, creators, campaigns,
      monitoring, rollback availability)

---

### Cross-cutting rules for every item

Server-side authorization on every endpoint; field-level permissions for
contact/financial data; validation on all input; audit logging for sensitive
actions; loading/empty/error/success states; EN/HI/PA strings; responsive
desktop/tablet/mobile; synthetic data only in clearly labeled local
environments; unconfigured integrations labeled as pending, never faked.
