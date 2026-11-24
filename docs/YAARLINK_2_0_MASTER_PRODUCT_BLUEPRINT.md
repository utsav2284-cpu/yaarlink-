# YaarLink 2.0 — Master Product Blueprint
## Consolidated reconstruction, current-state inventory, feature specification and delivery plan

**Document type:** Canonical product and implementation specification  
**Repository:** `utsav2284-cpu/yaarlink-`  
**Canonical branch for this document:** `main`  
**Existing reconstruction source:** `docs/YAARLINK_RECONSTRUCTION_BLUEPRINT.md` on `rebuild/yaarlink-unified-platform-blueprint`  
**Deployment context previously confirmed by the owner:** Vercel  
**Product target:** Evolve the existing YaarLink application; do not create a disconnected replacement.

> **Important status rule:** This document is a product specification, not an implementation report. A feature marked "found in main" means its route, component, API, schema or supporting code was found in the repository. It does not prove that the feature is complete, end-to-end tested or currently working in production. Production status must be confirmed through browser, API, database and deployment tests.

---

# 0. Executive decision

YaarLink should become a unified creator-economy and digital-growth ecosystem with four connected product pillars:

1. **YaarLink Marketplace** — brands and creators discover one another, publish campaigns and complete collaborations.
2. **YaarLink UGC Studio** — brands buy content-production services from creators and specialist freelancers, whether or not they have a large audience.
3. **YaarLink Agency OS** — YaarLink's private internal operating system for leads, clients, creator relationships, campaigns, digital-marketing projects, teams, finance records and reporting.
4. **YaarLink Control** — privileged platform administration, moderation, security, support, governance and operational monitoring.

Shared services connect these products: identity, organisation membership, roles, discovery, messaging, agreements, deliverables, notifications, audit events, financial records and analytics.

**Positioning:** YaarLink is not merely a place to list influencers. It is a connected platform for creator discovery, brand collaborations, UGC production and digital-growth operations.

## 0.1 Product principles

- Extend the existing Next.js application and preserve its identity, routes, data and working functionality.
- Keep one canonical production deployment and domain; the owner previously stated that hosting is connected to Vercel.
- Preserve the existing database and migration history. Prefer additive, reviewed migrations.
- Separate public marketplace access, brand workspaces, creator workspaces, private agency operations and platform administration.
- Never treat a demo screen, mock record or preview dataset as production functionality.
- Make trust, privacy, permission checks, moderation and auditability part of each feature.
- Start with explainable, measurable workflows. Add AI only where reliable data and human review exist.
- Launch in phases. Do not build every proposed feature before validating the core collaboration workflow.

## 0.2 Status labels used in this document

| Label | Meaning |
|---|---|
| **Found in main** | Related code, route, component, API or schema was found on the inspected `main` branch. Runtime behaviour is not implied. |
| **Partially evidenced** | Some supporting code exists, but the complete user workflow is not confirmed. |
| **In reconstruction source** | Described in the earlier reconstruction blueprint, but not verified as implemented in application code. |
| **New proposal** | Added during the product-planning conversation; not confirmed implemented. |
| **Needs verification** | Requires live browser, API, database, security or deployment testing. |
| **Later / deferred** | Deliberately not part of the first usable release. |

---

# 1. Existing product baseline — preserve this work

The inspected repository is `utsav2284-cpu/yaarlink-`. The following inventory is based on repository structure and source files, not a live production test.

## 1.1 Public website and marketplace

| Existing area | Evidence/status | Required next action |
|---|---|---|
| Homepage and public information pages | Found in main | Browser-test, improve copy, responsive layouts, accessibility and conversion paths. |
| About, Contact and How It Works | Found in main | Keep current identity; update descriptions so they match actual product capabilities. |
| Creator directory and public creator profiles | Found in main | Test search, privacy filtering, profile completeness and real listing visibility. |
| Campaign directory and campaign detail pages | Found in main | Test visibility rules, campaign states, eligibility and application entry points. |
| Brand campaign creation flow | Found in main | Verify validation, drafts, moderation and persisted updates. |
| Creator onboarding/profile flow | Found in main | Verify required fields, profile privacy and verification status. |
| English, Hindi and Punjabi localisation foundations | Found in main | Audit completeness, missing strings and language switching. |

## 1.2 Accounts, authentication and security foundations

| Existing area | Evidence/status | Required next action |
|---|---|---|
| Signup and login | Found in main | End-to-end test normal and failure paths. |
| Email verification | Found in main | Test expiry, resend, replay and account-state transitions. |
| Password/account recovery | Found in main | Test tokens, expiry, rate limits and email delivery. |
| Session handling | Found in main | Review secure cookie settings, expiry, revocation and session listing. |
| Email-change flow | Found in main | Test confirmation and audit behaviour. |
| MFA/AAL2 admin gate | Found in main admin code | Verify privileged routes and APIs enforce elevated auth server-side. |
| Rate limiting and bot challenge foundations | Found in main | Test limits, bypass resistance and monitoring. |
| CSP and security-related controls | Found in main | Run security review; do not weaken current headers or controls. |
| Audit events and admin audit logs | Found in main schema/code | Verify sensitive actions consistently write immutable, useful records. |
| Data rights and account deletion routes | Found in main | Verify actual export/deletion workflows, retention and confirmation. |

## 1.3 Existing campaign and application workflow

The repository contains campaign and application pages/APIs, campaign lifecycle and moderation code, and a dashboard client. The earlier reconstruction source also documents brand campaign briefs, creator applications, quotes and proposed timelines.

**Found in main / partially evidenced:**
- Campaign creation and listing.
- Campaign details.
- Creator applications.
- Application status workflow foundations.
- Brand and creator dashboards.
- Creator/campaign moderation endpoints and admin review surfaces.

**Must be verified before claiming complete:**
- All allowed state transitions.
- Whether every action persists and refreshes correctly.
- Whether campaign owners can access only their own records.
- Whether paused, rejected, closed or expired campaigns block new applications.
- Whether rejected applications and moderation decisions have clear reasons.
- Whether notifications are sent for each relevant state change.

## 1.4 Existing admin surfaces — do not confuse them

### `/admin`
The inspected main branch includes a privileged admin surface with MFA/AAL2-related gating and creator/campaign review functionality. Preserve its security model and extend it carefully.

### `/admin-preview`
The inspected preview surface is a demonstration/preview area with synthetic sample data. Do not represent it as a live production Super Admin system. Do not connect synthetic preview data to the production database.

### Agency OS
The private agency workspace proposed in this document is **not** the same as platform Super Admin. Agency staff must only access assigned agency records. They must not receive platform-wide moderation or security privileges by default.

## 1.5 Existing database baseline

The inspected `backend/db/schema.ts` contains these core tables:

- `users`
- `pending_signups`
- `account_tokens`
- `user_sessions`
- `brands`
- `creators`
- `campaigns`
- `applications`
- `notifications`
- `contacts`
- `reports`
- `settings`
- `admin_audit_logs`
- `audit_events`
- `rate_limit_buckets`
- `auth_failure_lockouts`

These are the current schema inventory observed during repository inspection. Re-check the current schema and migration journal before each implementation phase. Do not recreate existing entities under different names.

## 1.6 Existing technical architecture to preserve

The repository includes:
- Next.js App Router application under `app/`.
- React page clients and shared UI under `frontend/`.
- Backend business logic, validation, authentication, moderation and database access under `backend/`.
- Shared types, roles and domain helpers under `shared/`.
- Configuration under `config/`.
- Drizzle schema and migrations.
- Supabase-related configuration and security/migration foundations.
- Vercel deployment documentation and configuration.

The earlier reconstruction document identifies the current architecture as Next.js, TypeScript, PostgreSQL, Drizzle ORM, Supabase and Vercel. Verify exact dependency versions and production configuration from the current repository before implementation.

---

# 2. Final information architecture and navigation

Use a single coherent brand and account system, but distinct role-based workspaces.

## 2.1 Public website navigation

Recommended top-level navigation:

- Home
- Discover Creators
- Campaigns
- UGC Studio
- For Brands
- For Creators
- How It Works
- About
- Contact
- Sign In / Join

Public pages:
- `/` — homepage.
- `/creators` — creator discovery.
- `/creators/[id]` — public creator profile.
- `/campaigns` — approved public campaign listings.
- `/campaigns/[id]` — campaign details.
- `/ugc` — UGC service discovery.
- `/brands` — brand solution/landing page.
- `/how-it-works`, `/about`, `/contact`.
- Legal, privacy, data-rights and policy pages.

Preserve current routes where possible. Exact route names must be reconciled with the existing app router before implementation.

## 2.2 Authenticated workspaces

- Creator workspace: overview, profile, social accounts, opportunities, applications, invitations, collaborations, content, analytics, earnings records, reviews, community and settings.
- Brand workspace: overview, company profile, verification, creator discovery, shortlists, campaigns, applications, invitations, collaborations, content approvals, analytics, invoices/payment records, team and settings.
- Agency OS: private agency operations.
- YaarLink Control: privileged platform administration.

A user may have multiple legitimate roles (for example, brand and creator). Support workspace switching without duplicating login identities. Switching workspace must never change the underlying access permissions or ownership checks.

---

# 3. YaarLink Marketplace — final feature specification

## 3.1 Creator discovery

**Existing foundation:** creator directory and public creator profile routes/components.

**Enhancements:**
- Search by name, category/niche, location, language and supported social platform.
- Filter by content format, audience geography where available, budget/rate band, availability and verification state.
- Sort by relevance, recently active, profile completeness or supported performance metrics.
- Save creators to brand-specific shortlists.
- Compare creator profiles using consistent fields.
- Display why a creator matches a campaign.
- Clearly label missing, self-reported, stale and platform-verified data.
- Respect public/private profile settings.

**Acceptance criteria:**
- Search and filters combine correctly.
- Results contain only approved, discoverable profiles.
- Private fields never appear in public API responses.
- Empty, loading, error and no-match states are designed.
- Search is paginated and indexed appropriately.

## 3.2 Creator profile and portfolio

**Existing foundation:** creator onboarding and public profile routes.

**Enhancements:**
- Display name, bio, location, languages, niches and content formats.
- Public social profile links.
- Portfolio gallery with private/unlisted controls.
- Service categories and UGC capabilities.
- Optional rate card and package details.
- Availability information.
- Collaboration history where both policy and privacy allow.
- Verified review summaries.
- Profile completeness indicator.
- Profile preview before publication.

**Acceptance criteria:** creator controls which fields are public; private contact, verification evidence, financial and internal notes never appear in public profile responses.

## 3.3 Brand and business profiles

**Existing foundation:** brand pages/profile data.

**Enhancements:**
- Legal/display business name and public description.
- Website and approved business contact information.
- Industry, location and service areas.
- Business verification state and evidence handling.
- Organisation/team membership.
- Public profile visibility settings.
- Campaign history where appropriate.
- Brand reputation based on verified interactions.

Verification evidence must be private and accessible only to authorised reviewers.

## 3.4 Campaign marketplace

**Existing foundation:** campaign creation, listings, details and application APIs.

**Enhancements:**
- Campaign objective and brief.
- Product/service category and target audience.
- Content formats and deliverables.
- Language and geography requirements.
- Budget range and compensation model.
- Application deadline and campaign timeline.
- Eligibility and disclosure requirements.
- Usage/licensing rights summary.
- Moderation status and public visibility.
- Pause, close, edit and republish actions subject to state rules.
- Saved campaigns for creators.
- Campaign updates and revision history.

**Campaign lifecycle proposal:**
`draft → submitted_for_review → changes_requested / approved / rejected → published → paused / closed / expired`.

Exact state names must be aligned with existing enums and migrations; do not introduce duplicate or contradictory states.

**Acceptance criteria:**
- A campaign cannot be publicly discoverable before required review.
- Only authorised owners/managers can edit it.
- Rejected/paused/closed/expired campaigns cannot accept new applications.
- Moderation actions record actor, timestamp and reason.
- Budget visibility follows campaign privacy settings.

## 3.5 Applications, shortlists and invitations

**Existing foundation:** creator applications and application-management workflows.

**Enhancements:**
- Application message and proposal.
- Proposed quote and timeline, where supported by existing data model.
- Brand review queue.
- Shortlist and compare.
- Direct creator invitations.
- Invitation accept/decline/expiry.
- Withdraw application.
- Rejection reason and status history.
- Notifications for relevant transitions.

**Acceptance criteria:** creators see only their own applications; brands see applications only for their own campaigns; status changes are validated on the server.

## 3.6 Collaboration management — the central workflow

This is the highest-value marketplace expansion. It turns a listing/application website into a platform where work can be completed and tracked.

End-to-end lifecycle:
1. Brand creates campaign.
2. Campaign is reviewed and published.
3. Brand discovers, shortlists or invites creators.
4. Creator applies or accepts invitation.
5. Brand selects creator.
6. A collaboration record is created.
7. Participants confirm scope, fees, deliverables, timeline, usage rights and revision limits.
8. A collaboration-specific conversation is opened.
9. Creator submits drafts and deliverables.
10. Brand approves or requests revisions with reasons.
11. Creator submits publication URL/evidence.
12. Metrics are recorded from authorised sources or clearly labelled manual submissions.
13. Report is generated.
14. Invoice/payment records are reconciled.
15. Collaboration is closed and verified feedback may be submitted.

Each transition must have:
- Server-side permission check.
- Valid prior state and allowed next state.
- Actor and timestamp.
- Audit event.
- Notification event.
- Failure/retry handling.

## 3.7 Messaging and collaboration rooms

**In reconstruction source:** campaign-specific collaboration rooms and private messaging.

Features:
- Conversation per collaboration.
- Participant membership.
- Text messages and timestamps.
- Read state.
- Private attachments.
- Notification preferences.
- Report/block/escalation controls.
- Message retention policy.
- Important agreement terms stored as structured records, not only chat messages.

**Acceptance criteria:** only current authorised participants can read or send; attachment access uses private storage and short-lived access URLs; membership changes are audited.

## 3.8 Agreements and terms

**In reconstruction source:** agreements and agreement versioning.

Store:
- Parties and collaboration reference.
- Deliverables and formats.
- Fee, currency and payment milestones.
- Due dates and timeline.
- Revision count/limits.
- Usage rights, duration and territory.
- Disclosure responsibility.
- Cancellation/refund terms.
- Acceptance records and version history.

Use clear acceptance evidence and version history. Do not describe an uploaded draft as legally enforceable without appropriate review and acceptance. Provide a review process for legal terms.

## 3.9 Deliverables, content submission and approvals

**In reconstruction source:** deliverables, submissions, approval events and publication proof.

Features:
- Deliverable checklist.
- Draft uploads/links.
- Submission timestamp and version.
- Brand review.
- Approve/reject/request revision.
- Mandatory reason for revision.
- Revision history.
- Final asset reference.
- Usage-rights record.
- Published URL and evidence.
- Completion state.

**Acceptance criteria:** submissions are private to collaboration participants and authorised staff; approval changes are auditable; deadlines and reminders use server-side timestamps.

## 3.10 Campaign analytics and reporting

**In reconstruction source:** campaign metric snapshots and attribution links.

Features:
- Campaign objective and baseline.
- Deliverable status.
- Views/reach/engagement/clicks/conversions only when supported.
- Creator-submitted evidence labelled as self-reported.
- Official authorised API metrics labelled with source and collection time.
- UTM or campaign-specific links where supported.
- Coupon/code tracking where supported.
- Cost and performance calculations with stated methodology.
- Exportable brand report and separate internal agency report.

Never invent reach, engagement, conversion, ROI or attribution. Never present manually submitted values as platform-verified.

---

# 4. Creator Studio — complete creator workspace

## 4.1 Overview
- Profile status and completeness.
- Application and invitation counts.
- Active collaborations.
- Upcoming deliverables.
- Notifications and recent activity.
- New campaign recommendations.

## 4.2 Profile and verification
- Profile editor and preview.
- Niche, language, location and formats.
- Public/private field controls.
- Verification status and resubmission.
- Social account links.
- Secure official connection flow where supported.

Never request social-media passwords. Use official OAuth/API authorisation where available.

## 4.3 Opportunities
- Campaign discovery and filters.
- Saved campaigns.
- Applications and proposal history.
- Invitations and response deadlines.
- Application status tracker.
- Clear rejection/withdrawal states.

## 4.4 Portfolio and creator storefront
- Work samples and portfolio categories.
- UGC service listings.
- Rate cards and packages.
- Starting rates/currency.
- Availability and delivery time.
- Service request/contact flow.
- Reviews tied to verified completed work.

## 4.5 Collaboration workspace
- Conversation.
- Agreement and accepted scope.
- Deliverable checklist.
- Draft upload/submission.
- Revision feedback.
- Approval status.
- Publication proof.
- Campaign performance summary.

## 4.6 Earnings and records
- Invoice records.
- Amount due/paid status.
- Payment references.
- Creator payable/payout status.
- Downloadable statements where supported.
- Support/dispute links.

This initial scope is recordkeeping and reconciliation, not a stored-value wallet or escrow product.

## 4.7 Creator community and learning
- Professional networking.
- Collaboration requests.
- Find co-creators.
- Moderated discussions and announcements.
- Learning resources and platform guides.
- Safe, moderated creator challenges.
- Report and block controls.

Community is a later expansion; it must not delay core collaboration delivery.

## 4.8 Settings
- Profile visibility.
- Notification preferences.
- Security and sessions.
- Account export/deletion.
- Connected apps and consent.
- Support and appeals.

---

# 5. Brand Workspace — complete business experience

## 5.1 Overview
- Active campaigns.
- Applications awaiting review.
- Shortlists and invitations.
- Active collaborations.
- Upcoming approvals and deadlines.
- Campaign performance snapshots.
- Notifications and support alerts.

## 5.2 Business verification and team
- Business profile.
- Verification workflow and private evidence.
- Organisation members.
- Role-based access.
- Invitation and removal of team members.
- Ownership transfer with safeguards.

## 5.3 Creator discovery
- Search and filters.
- Creator profile and portfolio.
- Social account metrics with source/date.
- Shortlist and compare.
- Explainable matching.
- Invite creator.
- Export permitted shortlist data.

## 5.4 Campaign management
- Create/edit campaign.
- Save draft.
- Submit for moderation.
- Review changes requested.
- Publish approved campaign.
- Pause, close or republish.
- Review applications.
- Select creators and create collaborations.
- Track deliverables and campaign outcomes.

## 5.5 Collaboration and content
- Private collaboration room.
- Agreement review/acceptance.
- Deliverable schedule.
- Draft and final content review.
- Revision requests.
- Publication proof.
- Performance report.

## 5.6 Brand finance and reporting
- Quotes and invoice records.
- Payment status and references.
- Refund/adjustment records.
- Campaign expenditure.
- Creator payable status where visible to authorised parties.
- Reports and exports.
- Subscription plan and billing history.

## 5.7 Brand support
- Support tickets.
- Dispute records.
- Evidence attachments.
- Escalation and resolution history.

---

# 6. YaarLink UGC Studio — second marketplace

**Status:** New proposal. Not confirmed implemented.

Purpose: let businesses buy content-production services from creators and specialists regardless of follower count.

## 6.1 Service categories
- UGC videos and product demonstrations.
- Short-form reel production.
- Product photography.
- Video editing.
- Graphic design and social creatives.
- Voiceover and narration.
- Content packages.
- Ad creative production.
- Other policy-compliant content services.

## 6.2 Seller/creator features
- Service storefront.
- Service description and portfolio.
- Packages and pricing.
- Deliverable formats.
- Delivery time and revision limits.
- Availability.
- Client request/quote.
- Order dashboard.
- Draft and final submission.
- Revision and approval history.
- Completed-order records.
- Verified reviews.

## 6.3 Buyer/brand features
- Search by service, category, price and delivery time.
- View portfolios and packages.
- Request quote or place an order.
- Submit brief and references.
- Track production and deadlines.
- Review drafts and request revisions.
- Approve final delivery.
- Record payment status.
- Review completed service.

## 6.4 UGC order lifecycle
`draft_request → quote_requested → quote_sent → accepted → in_progress → submitted → revision_requested / approved → completed / cancelled / disputed`.

Align names with actual implementation. Every transition needs permission, audit and notification.

## 6.5 UGC safeguards
- Content policy and prohibited categories.
- Rights/usage scope.
- Consent for people shown in content.
- Private file storage.
- Copyright and takedown process.
- Clear cancellation/refund terms.
- Human moderation and appeal.

---

# 7. Affiliate marketplace — proposed later product

**Status:** New proposal; later phase.

Features:
- Brand creates an affiliate campaign.
- Commission basis and eligibility are explicit.
- Tracking links and coupon codes.
- Click and conversion records from supported sources.
- Fraud/duplicate event review.
- Commission statement and reconciliation.
- Creator dashboard for eligible conversions.
- Brand dashboard for campaign performance.
- Clear attribution window and calculation methodology.

Do not display unverified conversions as confirmed sales. Provider callbacks must be authenticated and idempotent. Any live financial payout flow requires appropriate legal, tax, provider and adult business oversight.

---

# 8. Creator Community — proposed later product

**Status:** New proposal.

Features:
- Creator professional profiles.
- Networking and co-creator discovery.
- Collaboration invitations.
- Moderated topic discussions.
- Announcements and learning resources.
- Events/workshops listings where appropriate.
- Reporting, blocking and moderation tools.
- Spam and abuse prevention.
- Privacy controls.

Do not build a generic social feed as a priority ahead of collaboration, messaging and trust.

---

# 9. Creator Intelligence and AI

**Status:** Mostly new proposal, with some matching/metric ideas already in the reconstruction source.

## 9.1 Creator intelligence data
- Social profile metadata.
- Authorised connection state.
- Historical follower snapshots.
- Average views where available.
- Engagement history.
- Audience geography/demographics only where lawfully and reliably available.
- Content categories and formats.
- Profile verification state.
- Completed collaboration history.
- Data source, measurement date and verification label.

## 9.2 Explainable matching
Start with deterministic rules and weighted ranking:
- Niche fit.
- Content format.
- Language.
- Location/geography when relevant.
- Audience suitability where lawfully available.
- Engagement/performance history.
- Budget compatibility.
- Availability.
- Past delivery record.
- Campaign-policy compatibility.

Show why a creator matches, what data is missing and when metrics were last updated. Do not treat a score as a definitive judgment of a person's trustworthiness or quality. Provide human review and correction/appeal.

## 9.3 AI campaign assistant
- Convert a brand brief into a draft campaign.
- Suggest objectives, audience, deliverables and timelines.
- Draft creator requirements.
- Suggest content ideas.
- Generate a campaign checklist.

A brand user must review and approve all generated content before publication.

## 9.4 AI reporting assistant
- Summarise verified campaign data.
- Draft client reports.
- Explain metric changes.
- Identify missing measurement data.
- Suggest next questions or tests.

Do not invent metrics, conclusions or ROI.

## 9.5 AI agency assistant
- Draft proposals and client updates.
- Summarise tasks and meetings.
- Prepare content-calendar drafts.
- Summarise campaign status.
- Draft operational reports.

Human approval is required before external communication or consequential action.

---

# 10. YaarLink Agency OS — private internal business operating system

**Status:** Core concept in reconstruction source; detailed modules expanded here.

Agency OS is a private workspace for YaarLink's own agency team. It is not a public brand dashboard and not platform Super Admin.

## 10.1 Executive Command Centre
Widgets:
- Leads and pipeline.
- Active clients.
- Revenue recorded and outstanding invoices.
- Active projects/campaigns.
- Creator assignments.
- Upcoming deadlines.
- Tasks overdue.
- Client approvals pending.
- Team workload.
- Operational alerts.

Every metric must be computed from persisted records and display its period/definition.

## 10.2 Sales CRM
- Lead capture and source.
- Business/contact details.
- Lead owner.
- Pipeline stage.
- Priority and next action.
- Follow-up date and reminders.
- Meetings and notes.
- Audit/proposal records.
- Conversion/lost reason.
- Renewal opportunities.

Proposed pipeline: new → contacted → qualified → proposal → negotiation → won/lost.

## 10.3 Brand/client management
- Client organisation and contacts.
- Services and scope.
- Contract/proposal references.
- Account manager.
- Goals and KPIs.
- Campaign history.
- Meetings and internal notes.
- Invoices/expenses.
- Client reports.
- Renewal status.

## 10.4 Creator Relationship Management (Creator CRM)
- Creator onboarding and profile link.
- Verification state.
- Niches, location, languages and formats.
- Rates and availability.
- Portfolio and work history.
- Past delivery performance.
- Assigned campaigns.
- Private internal notes with restricted access.
- Contact and consent preferences.

Internal notes must never be exposed to the creator or brand unless explicitly converted into an appropriate shared message/record.

## 10.5 Campaign operations
- Brief intake.
- Campaign plan.
- Creator shortlist and assignment.
- Deliverable schedule.
- Draft review.
- Client approvals.
- Publishing checklist.
- Budget records.
- Completion report.
- Lessons learned.

## 10.6 Digital marketing project management
Project/service types:
- Social media management.
- SEO and website audits.
- Content marketing.
- Paid advertising coordination.
- Email marketing.
- WhatsApp Business campaign coordination.
- Website projects.
- Branding and creative production.
- Influencer campaigns.
- UGC production.

Each project includes scope, owner, tasks, milestones, assets, approvals, deadlines and reports. Channel-specific activity must follow platform policies, consent and applicable law.

## 10.7 Content calendar
- Client and brand.
- Channel/platform.
- Content format.
- Draft/copy/asset.
- Owner.
- Planned and scheduled date.
- Approval status.
- Published URL.
- Performance notes.

## 10.8 Team and task management
- Staff accounts.
- Department/team.
- Roles and permissions.
- Task owner and assignee.
- Priority and due date.
- Status and dependencies.
- Comments and attachments.
- Workload.
- Approval steps.
- Activity history.

## 10.9 Finance and business operations
- Quotations.
- Client invoice records.
- Agency revenue records.
- Expenses.
- Creator payable records.
- Payment references/status.
- Refund/adjustment records.
- Outstanding balances.
- Reconciliation.
- Period reports.

Initial scope is bookkeeping/records and reconciliation. Do not build stored-value wallet, custody or escrow in the initial release.

## 10.10 Client reporting
- Project/campaign progress.
- Deliverables completed.
- Publishing status.
- Supported metrics.
- Cost and performance methodology.
- Risks and next steps.
- Exportable client report.

Agency margin and internal notes are private and must not appear in client reports unless deliberately approved as part of a client-facing scope.

---

# 11. YaarLink Control — Super Admin and platform operations

**Status:** Existing admin foundations found in main; full command centre is a proposal.

## 11.1 Preserve existing admin
- Preserve `/admin` privileged authentication and MFA/AAL2 gate.
- Preserve server-side authorisation and audit events.
- Preserve creator/campaign review functionality.
- Do not turn `/admin-preview` synthetic data into production records.

## 11.2 Final admin navigation
1. Overview.
2. User management.
3. Creator management.
4. Brand/business management.
5. Campaign moderation.
6. Collaboration monitoring.
7. UGC service/order moderation.
8. Payments and finance records.
9. Reports, disputes and appeals.
10. Subscription/billing records.
11. Creator intelligence and data quality.
12. Analytics.
13. Notification delivery monitoring.
14. Support centre.
15. Admin roles and permissions.
16. Security centre.
17. Audit logs.
18. Platform settings.
19. System health and observability.

## 11.3 Admin capabilities
- Search and inspect records according to role.
- Verify, approve, reject, suspend and reinstate with documented reason.
- Review appeals.
- Moderate campaigns and UGC listings.
- Investigate reports and disputes.
- View payment event records and reconciliation status.
- Manage allowed categories and configuration.
- Inspect notification failures.
- Inspect security events and sessions.
- Review audit logs.
- Monitor service/database/email/storage health.

## 11.4 Admin role model
- Super Admin/Owner: platform-wide authority.
- Platform Admin: approved platform operations.
- Trust & Safety: verification and moderation.
- Support: support tickets and dispute triage.
- Finance Admin: financial records and reconciliation.
- Analyst: read-only analytics.

No role receives broad access by convenience. Sensitive operations require reason capture, elevated authentication where appropriate and immutable audit records.

---

# 12. Monetisation model — proposals, not current functionality

Potential revenue streams:
1. Brand subscription plans.
2. Transparent marketplace service fees.
3. UGC marketplace service fees.
4. Managed digital-marketing service packages.
5. Agency retainers/projects.
6. Affiliate campaign service fees.
7. Enterprise plans.
8. Optional creator premium tools.

Possible brand plan structure:
- Free: basic account and limited discovery.
- Starter: campaign tools and basic creator discovery.
- Growth: advanced filters, shortlists and reporting.
- Business: team access and campaign operations.
- Agency: multi-client workflows.
- Enterprise: custom permissions, integrations and support.

These are packaging ideas, not established prices. Keep basic creator participation accessible. Show all fees, taxes, cancellation and refund terms clearly before commitment.

---

# 13. Notification system — cross-platform

Events to support:
- Campaign submitted, approved, rejected or changes requested.
- New application.
- Application shortlisted, hired, rejected or withdrawn.
- Invitation received, accepted, declined or expired.
- New collaboration message.
- Agreement ready, accepted or changed.
- Deliverable submitted.
- Revision requested.
- Deliverable approved.
- Deadline approaching or overdue.
- Publication proof submitted.
- Report ready.
- Invoice/payment status changed.
- Support ticket or dispute update.
- Verification status changed.
- Account/security event.

Channels:
- In-app notifications.
- Transactional email.
- Optional approved communication integrations later.

Use user preferences, consent, rate limits, delivery logs and retry handling. Do not send sensitive data in notification previews.

---

# 14. Integrations

Prioritised integration plan:

| Integration | Purpose | Priority / notes |
|---|---|---|
| Transactional email provider | Verification, recovery and notifications | Verify current provider and delivery health first. |
| Private object storage | Agreements, content and evidence | High; enforce private access and file validation. |
| Payment provider | Payment collection and records | High after legal/provider review; no wallet/escrow initially. |
| Official Meta/Instagram APIs | Authorised social account data | High where permissions and eligibility allow. |
| YouTube APIs | Authorised channel metrics | High where available. |
| Calendar integration | Meetings and deadlines | Later. |
| Google Analytics | Website analytics | Later. |
| WhatsApp Business Platform | Opt-in business communication | Later; follow consent and policy. |
| Error monitoring | Application reliability | High. |
| CRM/report exports | Business reporting | Later. |

Never ask a user for social-network passwords. Never scrape private or restricted data. Clearly distinguish API-verified, manually supplied and unavailable metrics.

---

# 15. Data model expansion — logical entities to assess

The following are candidate logical entities, not a command to create one table per bullet. Inspect existing schema, foreign keys, migration history and reuse existing tables before deciding.

## 15.1 Organisations and permissions
- `organizations`
- `organization_members`
- `organization_roles` or permission grants
- Role/permission definitions and membership audit records

## 15.2 Creator intelligence
- `creator_social_accounts`
- `creator_metric_snapshots`
- `creator_rate_cards`
- `creator_service_packages`
- `creator_availability`

## 15.3 Marketplace workflow
- `campaign_invitations`
- `creator_shortlists` / shortlist items
- `collaborations`
- `conversations`
- `conversation_members`
- `messages`
- `agreements`
- `agreement_versions`
- `deliverables`
- `content_submissions`
- `approval_events`
- `publication_proofs`
- `campaign_metric_snapshots`
- `attribution_links`

## 15.4 Financial records
- `invoices`
- `payment_events`
- `creator_payouts`
- `expenses`
- `refund_adjustments`
- `reconciliation_records`

## 15.5 UGC
- `ugc_services`
- `ugc_orders`
- `ugc_order_deliverables`
- `ugc_order_events`
- `ugc_reviews` (or reuse a shared verified review model)

## 15.6 Affiliate
- `affiliate_campaigns`
- `tracking_links`
- `conversion_events`
- `commission_records`

## 15.7 Agency OS
- `agency_clients`
- `agency_leads`
- `agency_client_contacts`
- `agency_projects`
- `agency_tasks`
- `agency_task_events`
- `content_calendar_items`
- `agency_service_catalog`
- `client_reports`

## 15.8 Trust, support and subscriptions
- `reviews`
- `review_responses`
- `support_tickets`
- `support_messages`
- `dispute_records`
- `subscription_plans`
- `subscriptions`
- `billing_records`
- `notification_preferences`
- `notification_delivery_events`
- consent and retention metadata as required by privacy design.

## 15.9 Database rules
- Explicit tenant/owner scope on every tenant-owned row.
- Foreign keys, uniqueness constraints, indexes and timestamps.
- Public profile data separated from private verification, contact, finance and internal notes.
- Metric source, timestamp, authorisation and verification status stored.
- Private storage for files and short-lived access URLs.
- Additive migrations with reviewed backfill/deprecation plans.
- RLS and least-privilege roles for tenant-owned data.
- Automated migration, isolation and RLS tests.
- No production schema mutation without backup, staging test and rollback plan.

---

# 16. Security, privacy, trust and safety

Non-negotiable requirements:
- Server-side authorisation on every protected API and record operation.
- Organisation/tenant isolation.
- RLS for tenant-owned database rows.
- Least-privilege service/database roles.
- No secrets or service keys in browser bundles.
- Secure session, CSRF, CSP, rate-limit and bot protections.
- Private file storage with type/size validation and malware scanning where available.
- MFA for privileged staff.
- Audit trail for moderation, role, financial and security changes.
- Report, takedown, appeal and dispute workflows.
- Clear consent for connected social accounts and analytics.
- Data export/deletion and documented retention.
- Appropriate advertising/sponsorship disclosures.
- Copyright and usage-rights handling.
- Age-appropriate participation safeguards and compliance with applicable laws and provider rules.
- Human review for high-impact moderation and automated quality flags.

Do not build payment custody/escrow or enable real payout flows until provider, legal, tax and operational requirements have been reviewed with appropriate qualified adult oversight.

---

# 17. Competitor-inspired research backlog

The owner supplied the following names as comparison/inspiration targets: PeerPop, puntar.in, socixmedia.in, social.mediastarz, metarise.ao, smopanel, adscrey, doosshnow, agencglobal, smm_iuspockdeck_creator_hub, wish2viral, collabryindia, influenze.ai, collebrity, plus YaarLink's own product.

**Research status:** These names were supplied by the owner. This document does not claim that every site, brand, product feature or current offering has been independently verified. Do not copy a competitor's branding or assume a feature exists based only on a name.

Use competitor research to evaluate categories:
- Creator discovery and networking.
- Influencer campaign marketplace.
- UGC content production.
- Social media/marketing services.
- Creator analytics and audience intelligence.
- Campaign workflow and reporting.
- Agency operations.
- Affiliate and referral systems.
- Trust, reviews and verification.

For each competitor, a later research record should capture:
1. Verified official URL and current product identity.
2. Primary customer and business model.
3. Creator onboarding and discovery experience.
4. Brand campaign workflow.
5. UGC/service marketplace, if any.
6. Analytics and verification claims.
7. Payment/fee model, if publicly documented.
8. Trust, privacy and support controls.
9. Strengths and user complaints from credible sources.
10. YaarLink opportunity: adopt, improve, differentiate or ignore.

Do not add features simply because a competitor advertises them. Prioritise verified customer needs, product quality and YaarLink's ability to deliver reliably.

---

# 18. Delivery roadmap and implementation tasks

## Phase 0 — Audit and baseline (first)

Tasks:
1. Confirm canonical GitHub branch, Vercel project and production domain.
2. Map every public page, authenticated page, admin page and API route.
3. Map each page action to its API and database records.
4. Inspect schema, migration journal, indexes, foreign keys and RLS.
5. Identify existing code, partial code, demo-only code and missing workflows.
6. Run lint, TypeScript, unit and integration tests.
7. Browser-test signup, login, verification, creator profile, campaign creation, application and admin review.
8. Test role/ownership boundaries.
9. Confirm production and preview environments use separate databases.
10. Confirm backup and recovery process.
11. Produce a route-by-route and feature-by-feature gap report.

Exit criteria:
- No production data changed by the audit.
- Every current feature classified as working, partially working, broken, demo-only or unknown.
- Security and data risks documented.
- A safe staging workflow exists.

## Phase 1 — Marketplace foundation and workspaces

Tasks:
1. Improve public navigation and responsive layouts.
2. Complete brand and creator profile editing.
3. Complete verification workflow and reviewer queue.
4. Improve creator discovery, filters and profile privacy.
5. Complete campaign draft/review/publish/pause/close lifecycle.
6. Complete application and invitation state handling.
7. Add workspace navigation and organisation membership only after schema review.
8. Build production-grade Super Admin modules incrementally.
9. Implement permission matrix and server-side checks.
10. Add automated tests for all critical actions.

Exit criteria:
- Real records persist correctly.
- A brand cannot access another brand's records.
- A creator cannot access another creator's private records.
- Admin actions are audited.
- Existing authentication and campaign flows continue to work.

## Phase 2 — Collaboration engine

Tasks:
1. Add shortlist and invitation workflow.
2. Add collaboration record and lifecycle.
3. Add private collaboration conversation.
4. Add agreement and version acceptance.
5. Add deliverable checklist and submission records.
6. Add content approval and revision reasons.
7. Add publication proof.
8. Add event-driven notifications.
9. Add dispute/support linkage.
10. Add end-to-end tests for a full collaboration.

Exit criteria:
- A brand and creator can complete a collaboration without moving essential workflow state to spreadsheets or external chat.
- Only collaboration participants and authorised staff can access private collaboration data.

## Phase 3 — Analytics and financial records

Tasks:
1. Add authorised social connection options where supported.
2. Add metric snapshots with source and measurement time.
3. Add publication evidence.
4. Add campaign reports and attribution links.
5. Add invoice/payment event and reconciliation records.
6. Add creator payable records and expense records.
7. Add exportable reports.
8. Test idempotent provider events if payment integration is enabled.

Exit criteria:
- Reports distinguish verified, authorised, self-reported and unavailable data.
- Financial records reconcile and are auditable.
- No wallet/escrow custody is introduced in this phase.

## Phase 4 — UGC Studio and marketplace expansion

Tasks:
1. Add UGC service catalogue and seller storefront.
2. Add packages and quote requests.
3. Add order lifecycle.
4. Add private draft/final asset delivery.
5. Add approval/revision workflow.
6. Add usage-rights and consent records.
7. Add verified service reviews.
8. Add UGC moderation and support.

Exit criteria:
- Buyer can request/order a service and seller can deliver it through a traceable workflow.
- Files and private data are access-controlled.

## Phase 5 — Agency OS

Tasks:
1. Organisation and agency team model.
2. Executive command centre.
3. Sales CRM.
4. Client/brand records.
5. Creator CRM.
6. Project and campaign operations.
7. Digital marketing project types.
8. Content calendar.
9. Team and task management.
10. Finance records.
11. Client reporting.
12. Agency-specific permission tests.

Exit criteria:
- Agency staff can manage assigned clients/projects without platform-wide privileges.
- Internal notes and margins remain private.
- Reports are based on persisted records.

## Phase 6 — Intelligence and growth

Tasks:
1. Build explainable rules-based creator matching.
2. Add data quality and freshness labels.
3. Add AI campaign brief drafting.
4. Add AI reporting drafts.
5. Add affiliate tracking only after attribution design.
6. Add creator community with moderation.
7. Add subscription packaging and billing records.
8. Add advanced analytics after reliable usage data exists.
9. Validate product demand before adding more modules.

Exit criteria:
- AI outputs are reviewable and grounded in real data.
- Matching factors are explainable.
- Growth features do not weaken privacy or platform safety.

---

# 19. Quality gates and acceptance tests

A screen is not complete because it renders. Each feature must pass functional, security and failure-state tests.

Minimum acceptance tests:
1. Brand A cannot read or modify Brand B records.
2. Creator A cannot read Creator B private metrics, contact details or files.
3. A brand sees only applications for its campaigns.
4. A creator sees only their applications and collaborations.
5. Agency staff are restricted to assigned agency records.
6. Finance access is not implied by campaign-management access.
7. Public profiles expose only explicitly public fields.
8. Unapproved campaigns are not public.
9. Paused/rejected/closed/expired campaigns cannot accept new applications.
10. Only collaboration participants can access messages, agreements, deliverables and files.
11. Agreement acceptance and scope changes create version/audit records.
12. Content revision requests require a reason and create an event.
13. Provider callbacks are authenticated and idempotent.
14. Manual metrics are never labelled platform-verified.
15. Sensitive admin actions require appropriate elevated session and audit records.
16. Export/deletion requests follow documented privacy and retention rules.
17. Existing signup, login, email verification, campaign creation and application tests continue passing.
18. Notification failures are retried/logged without duplicate user-visible events.
19. Uploads reject disallowed types/sizes and cannot be fetched by unauthorised users.
20. Workspace switching never grants new permissions.

For every phase run:
- Lint.
- TypeScript checks.
- Unit tests.
- Integration tests.
- Database migration tests.
- RLS/tenant isolation tests.
- Browser end-to-end tests.
- Accessibility and responsive checks.
- Security review for changed APIs and permissions.

---

# 20. Definition of done

YaarLink 2.0 is not "done" when every menu item exists. The core product is ready when:

- A real brand can discover a creator.
- A brand can publish an approved campaign.
- A creator can apply or receive an invitation.
- Both parties can confirm scope and terms.
- They can message in a private collaboration room.
- A creator can submit deliverables.
- A brand can approve or request revisions.
- Publication evidence can be recorded.
- Honest campaign results can be reviewed.
- Invoice/payment records can be reconciled.
- Support and disputes have a documented process.
- Agency staff can operate separate client projects.
- Super Admin can moderate and govern the platform securely.
- Tenant isolation and critical workflows pass automated tests.
- Existing users and production data remain intact.

**Final product vision:** one connected YaarLink ecosystem with four distinct experiences — Marketplace, UGC Studio, Agency OS and YaarLink Control — supported by shared identity, collaboration, trust, analytics and secure infrastructure.

---

# Appendix A — feature status summary

| Feature group | Current assessment |
|---|---|
| Public website and marketplace pages | Found in main; production behaviour needs verification |
| Creator profiles and discovery | Found in main; enhancements proposed |
| Brand profiles and campaigns | Found in main; lifecycle needs end-to-end verification |
| Applications and dashboard | Found in main; complete workflow needs testing |
| Authentication and account security | Supporting code found in main; security tests required |
| Admin creator/campaign review | Found in main; expand carefully |
| Admin preview | Demo/preview only; not a production control centre |
| Full collaboration room and messaging | In reconstruction source; not confirmed implemented |
| Agreements and versioning | In reconstruction source; not confirmed implemented |
| Deliverables and content approvals | In reconstruction source; not confirmed implemented |
| Publication proof and analytics | In reconstruction source; not confirmed implemented |
| Financial ledger/reconciliation | In reconstruction source; not confirmed implemented |
| Agency OS | In reconstruction source; full implementation not confirmed |
| UGC Studio | New proposal |
| Creator Community | New proposal |
| Affiliate marketplace | New proposal |
| AI creator intelligence and assistants | New proposal/long-term |
| Subscription plans | New proposal |
| Expanded Super Admin | Existing foundation plus new proposal |
| Integrations | Must be verified individually |

# Appendix B — source documents and repository references

- Earlier reconstruction source: `docs/YAARLINK_RECONSTRUCTION_BLUEPRINT.md` on branch `rebuild/yaarlink-unified-platform-blueprint`.
- Current project structure: `docs/STRUCTURE.md`.
- Admin preview architecture/security/database documents: `docs/ADMIN_PREVIEW_V2_*.md`.
- Backup and recovery: `docs/BACKUP_AND_RECOVERY.md`.
- Deployment guidance: `docs/DEPLOY_PUBLIC.md`.
- Local development: `docs/LOCAL_OFFLINE_DEVELOPMENT.md`.
- Listing publication workflow: `docs/MAKE_LISTINGS_LIVE.md`.
- Observability: `docs/OBSERVABILITY.md`.
- Current schema: `backend/db/schema.ts`.
- Privileged admin route: `app/admin/page.tsx`.
- Admin preview route: `app/admin-preview/page.tsx`.

**Maintenance rule:** update this master document whenever a feature is implemented, changed, deferred or removed. Link each status change to the implementation PR/commit and test evidence. Never mark a feature "live" solely because its design or route exists.
