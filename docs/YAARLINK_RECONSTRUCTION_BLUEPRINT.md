# YaarLink Reconstruction Blueprint
## Unified creator marketplace + agency operating system

**Status:** Proposed implementation specification  
**Target:** Existing YaarLink application at `www.theyaar.com`  
**Base architecture:** Preserve the current Next.js, TypeScript, PostgreSQL, Drizzle ORM, Supabase and Vercel deployment  
**Implementation rule:** Add to the existing product in safe, tested increments. Do not create a disconnected replacement or a second production deployment.

---

## 1. Product direction

YaarLink should become one unified platform with two connected sides:

1. **Public creator marketplace** — brands, local businesses and creators discover each other, create campaigns and complete collaborations.
2. **Private agency operating system** — YaarLink's internal team manages leads, brand clients, creators, campaigns, digital-marketing projects, approvals, operations, finances and reporting.

The sides share core records and workflows, but not unrestricted access. A public brand must never see another brand's private records, YaarLink's agency notes or internal financial margins. Creators must only see their own private account data and the collaborations to which they are a party.

Keep the YaarLink name, domain, brand personality and existing English/Hindi/Punjabi experience. The product can become more capable without losing the current approachable tone for local businesses and first-time creators.

## 2. Current-state inventory

The public experience currently includes:

- Homepage and public campaign/creator listings.
- Brand campaign brief form.
- Creator profile onboarding.
- Campaign discovery and applications.
- Public creator profiles.
- English, Hindi and Punjabi interface localisation.
- User signup, email verification, login and account recovery.
- Brand/creator dashboard with campaign and application status workflows.
- Admin review functionality for creators and campaigns.
- Reporting and account-data rights routes.

The current public process still asks brands and creators to coordinate important work outside YaarLink. In particular, the public "How it works" content says chat, final fee negotiations, draft reviews, posting evidence, results and payment are handled manually/off-platform. The marketplace does not currently provide a full collaboration room, payment ledger or campaign analytics/attribution experience.

### Existing codebase — preserve and extend

- `app/`: Next.js App Router pages and API routes.
- `frontend/`: React page clients, components, session handling and i18n.
- `backend/`: authentication, validation, listing/application workflows, moderation, notifications, audit events and database access.
- `shared/`: common domain constants, roles, validation helpers and URL utilities.
- `config/`: canonical site origin, metadata and site configuration.
- `backend/db/schema.ts`: Drizzle schema.
- `supabase/` and `backend/db/drizzle/`: database migrations and RLS/security baseline.

The current application already uses Next.js 16, TypeScript, Tailwind, PostgreSQL, Drizzle ORM and Supabase, with Vercel as the documented production deployment. Keep the existing canonical Vercel project and domain configuration.

The current schema already contains users, pending signups, account tokens, sessions, brands, creators, campaigns, applications, notifications, contacts, reports, settings, admin audit logs, audit events, rate-limit buckets and authentication lockouts. Do not recreate these entities under new names or discard existing data.

### Admin separation

- Treat `/admin` as the privileged platform administration surface. Preserve its existing authentication, MFA/AAL2 checks, server-side authorisation and audit requirements.
- Treat `/admin-preview` as synthetic demonstration UI only. Never use synthetic preview data as production records or connect the preview environment to production data.
- The agency workspace is not the same thing as platform Super Admin. Give agency staff access only to the clients, creators, campaigns and finance records assigned to their agency role.

## 3. Target user experiences

### A. Public website

Retain and improve:

- Homepage and product explanation.
- Creator directory with search and filters.
- Public creator profile pages.
- Public campaign directory and campaign detail pages.
- Brand and creator onboarding.
- How-it-works, about, contact and legal/data-rights pages.
- English, Hindi and Punjabi support.

Improve presentation with a clear responsive design system, strong mobile layouts, accessible components, fast search, useful empty states, clear verification labels and honest product claims. Show only real, review-approved listings. Never insert fake testimonials, fake creator results or fabricated performance figures.

### B. Brand workspace

Add a structured brand workspace:

- Company profile and business verification.
- Company team and role management.
- Campaign brief creation, editing and submission for review.
- Campaign budget and private commercial fields.
- Creator discovery, filters and shortlist comparison.
- Transparent match explanations.
- Creator invitations and application review.
- Campaign collaboration room.
- Agreement and deliverable records.
- Content submission and approval/revision.
- Publication proof and performance reports.
- Invoices, payment status, receipts and support/dispute records.
- Exportable campaign history and reports.

Brand team members must only see their own organisation's permitted records.

### C. Creator workspace

Add a structured creator studio:

- Creator profile, bio, categories, content languages and location.
- Social profile links and authorised connections.
- Historical metric snapshots with source and measurement date.
- Rate cards, packages, deliverable types and availability.
- Public/private profile-field controls.
- Campaign discovery, saved opportunities and applications.
- Invitation inbox.
- Campaign-specific conversation and collaboration room.
- Agreements and deliverables.
- Content upload/submission and revision history.
- Publication proof and campaign results.
- Earnings, invoice/payment records and payout status.
- Account privacy, data export, deletion and support.

Creators must never be required to provide social-media passwords. Prefer official authorised integrations. Keep manual evidence upload available where a platform API is unavailable or access has not been granted.

### D. Internal Agency OS

Create a private agency workspace with:

1. Executive command centre — active clients, pipeline value, campaigns, deadlines, reviews and operational alerts.
2. Sales CRM — enquiries, discovery, audits, proposals, follow-ups, conversion and renewals.
3. Brand/client management — client contacts, service plans, account history and assignments.
4. Creator relationship management — onboarding, verification, performance history, availability and management agreements.
5. Campaign operations — briefs, matching, assignments, deliverables, approvals, schedules and closure.
6. Digital growth projects — SEO, social media management, content, paid-media coordination, email/WhatsApp marketing and reporting tasks.
7. Content calendar — scheduled posts, owners, drafts, approvals and publishing evidence.
8. Finance operations — quotations, invoice records, agency fees, expenses, amounts due, creator payable records and reconciliation.
9. Team and task management — assigned work, deadlines, workload and activity history.
10. Reports — client-level performance, campaign ROI where measurable, agency revenue and operational performance.
11. Support/moderation — reports, disputes, prohibited content and escalation queues.

Agency data must be organisation-scoped. Do not expose internal notes, agency margin or staff discussions to marketplace users.

### E. Platform administration

Expand the privileged admin area in a separate, carefully permissioned workstream:

- Platform overview.
- Creator review queue.
- Brand/business review queue.
- Campaign moderation.
- User and organisation management.
- Suspensions, appeals and reports.
- Support and dispute triage.
- Platform-level activity/audit history.
- System health and notification delivery status.
- Configuration and allowed-category rules.
- Admin role and permission management.

Use MFA for privileged staff, mandatory reason capture for sensitive moderation decisions and immutable audit records. Avoid creating broad "god mode" access for ordinary agency managers.

## 4. Core workflow: end-to-end collaboration

The primary user journey must work as one traceable process:

1. Brand creates or edits a campaign brief.
2. Campaign enters moderation/review.
3. An authorised reviewer approves, rejects or requests changes with a reason.
4. Approved campaign becomes publicly discoverable according to its visibility settings.
5. Creator search and matching identify eligible candidates.
6. Brand or authorised agency manager shortlists and invites creators.
7. Creator applies or accepts an invitation.
8. A collaboration record is created.
9. Both parties discuss requirements in a campaign-specific conversation.
10. They confirm scope, fees, dates, usage rights, revision limits and cancellation terms in an agreement record.
11. Creator completes required deliverables and submits content/proof.
12. Brand reviews, approves or requests revisions.
13. Creator records the published URL and evidence.
14. Metrics are collected via authorised integration or user-submitted evidence, with measurement source and date.
15. Campaign report is generated.
16. Invoice/payment status is reconciled and the collaboration is closed.
17. Both sides can leave structured feedback, subject to dispute and moderation rules.

Each stage needs an explicit state machine, permission check, audit event and notification. Do not allow client-side status edits to bypass server-side transition rules.

## 5. Creator intelligence and matching

Start with a transparent rules-based matching engine. Do not introduce an opaque AI score before reliable data exists.

Candidate factors:

- Category/niche fit.
- Content-format fit.
- Language fit.
- Audience geography and age suitability where lawfully supplied.
- Recent average views and engagement.
- Engagement quality and unusual pattern flags.
- Campaign budget/rate compatibility.
- Availability and deadline compatibility.
- Past delivery and collaboration history.
- Brand-safety and campaign-policy compatibility.

Every recommendation must show:
- A compatibility score or band.
- The factors contributing to it.
- The data source and date.
- Missing/unverified information.
- A human-review option.

Never equate follower count with influence. Never label a creator fraudulent on the basis of one automated indicator. Flags are prompts for human review, with correction/appeal workflows.

## 6. Data architecture and migration strategy

Keep the existing tables and extend them additively. Proposed new entities include:

- `organizations` and `organization_members` — agency/brand workspaces and membership.
- `organization_roles` or permission grants — organisation-scoped roles.
- `creator_social_accounts` — social profile metadata and authorised connection status.
- `creator_metric_snapshots` — time-series audience/performance values, source, collected-at and verification status.
- `creator_rate_cards` — offers, rates, currency and deliverable details.
- `campaign_invitations` — brand/agency invitations to creators.
- `collaborations` — accepted brand/creator engagements.
- `conversations`, `conversation_members`, `messages` — private campaign-scoped messaging.
- `agreements` and `agreement_versions` — accepted scope and terms.
- `deliverables`, `content_submissions`, `approval_events` — submission and revision workflow.
- `publication_proofs` — URLs, files and publication evidence.
- `campaign_metric_snapshots` and `attribution_links` — campaign performance records.
- `invoices`, `payment_events`, `creator_payouts`, `expenses` — financial tracking and reconciliation.
- `agency_clients`, `agency_projects`, `agency_tasks`, `content_calendar_items` — internal agency operations.
- `consents`, `notification_preferences` and any additional retention/deletion metadata required by the privacy design.

These are a proposed logical model, not permission to create duplicate or incompatible tables. Inspect the current schema and migration history first. Reuse existing `brands`, `creators`, `campaigns`, `applications`, `notifications`, `reports`, `audit_events` and related tables wherever they already represent the required concept.

### Database rules

- Every tenant-owned row must have an explicit organisation or owner scope.
- Add foreign keys, uniqueness constraints, useful indexes and timestamps.
- Keep public creator/brand profile fields separate from private contacts, verification evidence, internal notes and payment data.
- Store metric source, collection time, consent/authorisation state and confidence/verification status.
- Store files in private object storage with expiring access links; do not store sensitive documents in public buckets.
- Use additive, journalled migrations; never drop or rename production columns without a reviewed backfill/deprecation plan.
- Apply least-privilege runtime roles and row-level security to all tenant-owned data.
- Update migration tests and RLS tests alongside schema changes.

## 7. Authentication, roles and tenant boundaries

Preserve the current secure login, email verification, session handling, rate limiting, CSRF protection, password policy and CSP controls.

Support a user who may have more than one relationship to the platform (for example, both a brand and creator profile) without duplicating login identities. Keep role selection separate from record ownership and organisation membership.

Proposed role categories:

- Platform: Super Admin, Trust & Safety, Support.
- Agency: Owner, Agency Admin, Campaign Manager, Creator Manager, Marketing Executive, Finance, Viewer.
- Brand: Owner, Admin, Campaign Manager, Reviewer, Finance, Viewer.
- Creator: Owner of their own profile and collaborations.

Permissions must be checked on the server for every API and data operation. Do not rely on hidden navigation or disabled buttons as security.

## 8. Messaging, documents and payments

### Messaging
- One conversation per collaboration/campaign thread.
- Only approved participants can read or send.
- Attachments must be private and scanned/validated.
- Include read state, timestamps, moderation/reporting and notification preferences.
- Keep a record of material agreement changes outside free-form chat.

### Agreements
- Use versioned agreement records.
- Capture agreed fee, currency, deliverables, dates, revision count, usage/licensing scope, disclosure responsibility, cancellation/refund terms and acceptance evidence.
- Do not imply that an uploaded draft is legally enforceable without the required review and acceptance process.

### Financial records
For the first commercial release, implement records and reconciliation: quotes, invoices, payment references, creator payables, payment status, refunds/adjustments and expenses.

Do not build a wallet, custody or escrow system in the initial release. Any real payment-provider onboarding, custody, escrow or payout flows require qualified adult oversight and appropriate legal, tax and provider review before enabling live transactions.

## 9. Analytics and attribution

Build an honest reporting layer:

- Campaign objective and baseline.
- Deliverables and publishing status.
- Views/reach/engagement/clicks/conversions only where supported by authorised sources.
- Creator-reported or manually submitted evidence clearly labelled as such.
- UTM links or creator-specific links where lawful and technically supported.
- Coupon/code tracking where supported.
- Cost and performance calculations with stated methodology.
- Exportable brand report and internal agency report.

Never invent results, imply attribution certainty where it does not exist, or display unverified estimates as platform-verified metrics.

## 10. Safety, moderation and compliance

- Add an explicit prohibited/restricted campaign-category policy and review workflow.
- Check brand legitimacy and creator account ownership with proportionate verification.
- Provide report, takedown, appeal and dispute routes.
- Require appropriate advertising/sponsorship disclosure.
- Record content usage rights and permission scope.
- Protect user privacy and provide account export/deletion workflows.
- Follow applicable Indian and relevant international privacy, consumer, advertising and payment rules.
- Do not allow campaigns that violate law, platform policies or age restrictions.
- Include human review for high-impact moderation and automated quality flags.

## 11. Recommended delivery phases

### Phase 0 — Audit and baseline
- Run existing lint, typecheck, unit tests and database checks.
- Inspect the current production database schema/migration journal and RLS policies.
- Inventory every route, API, current dashboard action and permission rule.
- Confirm canonical Vercel project, Preview setup and safe staging database.
- Write a gap report and feature-to-existing-code map.

**Exit:** no production data changed; known architecture and risks documented.

### Phase 1 — Platform foundation
- Organisation and membership model.
- Explicit role/permission model.
- Updated brand and creator workspaces.
- Full production moderation workflows for brands, creators and campaigns.
- Agency command centre, CRM and tasks.
- Audit and notification integration.

**Exit:** internal operations work on real persisted records with correct permissions.

### Phase 2 — Collaboration marketplace
- Creator discovery and explainable matching.
- Shortlisting and invitations.
- Collaboration records and private messaging.
- Deliverables, content submissions and approvals.
- Agreement/version records.

**Exit:** a real brand-creator collaboration can be completed inside YaarLink.

### Phase 3 — Measurement and finance records
- Creator metric history.
- Publication evidence.
- Campaign reports and attribution links.
- Invoice, expense and payout tracking.
- Exports and reconciliation.

**Exit:** campaign outcomes and money owed/received are traceable, without building custody/escrow.

### Phase 4 — Intelligence and scale
- AI brief assistant and report drafting with human review.
- Advanced matching after sufficient good-quality data exists.
- Automation, multilingual expansion and internationalisation.
- Advanced analytics and operational forecasting.

**Exit:** features are based on measured product usage and validated data.

## 12. Route and navigation proposal

Preserve current public routes where possible.

- `/` — public homepage.
- `/campaigns` and `/campaigns/[id]` — public campaigns.
- `/creators` and `/creators/[id]` — public creator discovery/profile.
- `/brands`, `/signup`, `/login` — onboarding.
- `/dashboard` — brand/creator workspace with a clear workspace switcher.
- `/agency` — private agency operations workspace.
- `/admin` — privileged platform administration.
- `/messages` — participant-only conversations.
- `/campaigns/[id]/workspace` — collaboration workspace.
- `/settings` — profile, security and privacy settings.

Exact route names can adapt to the existing route structure. Avoid breaking existing links, SEO metadata, canonical URLs or return-to-auth flows.

## 13. Quality gates and acceptance tests

A feature is not complete because the page renders. It must work end to end.

Minimum tests:

1. Brand A cannot read or modify Brand B's records.
2. Creator A cannot read Creator B's private metrics, contact details or files.
3. A brand sees only applications for its own campaigns.
4. A creator sees only their own applications and collaborations.
5. Agency staff are limited to assigned agency organisations and permissions.
6. Finance permissions are not implied by campaign-management permissions.
7. Public creator profiles contain only explicitly public fields.
8. A campaign cannot go public before required review.
9. An expired/paused/rejected campaign cannot accept new applications.
10. Only collaboration participants can access messages, agreements, deliverables and files.
11. Agreement acceptance and scope changes create version/audit records.
12. Content rejection requires a reason and creates a revision event.
13. Payment-provider callbacks are idempotent; duplicate events do not duplicate financial entries.
14. An unverified/manual metric is never labelled as platform-verified.
15. Sensitive admin/moderation actions require the appropriate elevated session and create audit events.
16. Data export/deletion requests follow documented privacy and retention rules.
17. Existing signup, login, email verification, campaign creation and creator application tests continue passing.

For every phase, run lint, TypeScript checks, unit/integration tests, database/RLS tests and browser end-to-end tests. Test migrations against a disposable staging database before any production rollout.

## 14. Non-negotiable implementation rules

- Do not replace the current application with a static demo.
- Do not introduce a second production Vercel project.
- Do not point Preview environments at the production database by default.
- Do not expose secrets, service keys or database credentials to browser code.
- Do not bypass or weaken current authentication, CSP, CSRF, rate limiting, RLS or audit controls.
- Do not erase or silently rewrite existing production data.
- Do not mark features complete until persistence, authorisation, validation, failure states and tests work.
- Do not enable live payment custody/escrow in the initial scope.
- Maintain the YaarLink brand and the accessible English/Hindi/Punjabi experience.

**Definition of success:** a brand can discover a creator, start a collaboration, agree terms, exchange content, approve deliverables, record publication evidence and review honest performance results in YaarLink, while the YaarLink team manages its own agency services and platform operations through a separate private workspace.
