# YAARLINK — COMPLETE MASTER RECONSTRUCTION & PRODUCT SPECIFICATION
## Single source of truth for the existing platform, YaarLink 2.0 vision, detailed features and implementation

**Canonical document:** `docs/YAARLINK_COMPLETE_MASTER_RECONSTRUCTION.md`  
**Repository:** `utsav2284-cpu/yaarlink-`  
**Canonical branch:** `main`  
**Production context previously confirmed:** Vercel deployment connected  
**Purpose:** Consolidate the full YaarLink reconstruction blueprint and the YaarLink 2.0 master product blueprint into one durable reference.

> **Read this first:** This is a product and engineering specification, not proof that every described feature is implemented. Existing code, partially evidenced workflows, proposed features and production-verified functionality must remain clearly distinguished. Never mark a feature live until it passes the required browser, API, database, permission and deployment checks.

## How this document is organised

1. The complete YaarLink 2.0 master blueprint is included first. It contains the product strategy, current code baseline, user experiences, marketplace, Creator Studio, Brand Workspace, UGC Studio, affiliate marketplace, creator community, AI, Agency OS, YaarLink Control, monetisation, notifications, integrations, data model, security, competitor research, roadmap and acceptance criteria.
2. The complete earlier reconstruction blueprint is preserved in Appendix C, verbatim, so no original requirement or implementation rule is lost.
3. Where the two source documents overlap, treat the main consolidated sections as the current product direction. Appendix C is retained as the original source record; it is not a second competing specification.
4. If a requirement changes, update this canonical document and record the reason, status, implementation PR/commit and test evidence.

## Product-wide rules

- Extend the existing YaarLink application. Do not create a disconnected replacement, duplicate production deployment or parallel identity/database system.
- Preserve existing users, data, routes, SEO, working flows, authentication, database history and the connected Vercel project.
- Inspect current code and schema before implementing. Reuse existing entities and services; migrations should be additive and reviewed.
- Distinguish Marketplace, Creator Studio, Brand Workspace, UGC Studio, Agency OS and YaarLink Control by role and tenant boundaries.
- Agency staff must never inherit platform Super Admin permissions. Brands must not see other brands' data. Creators must not see other creators' private data.
- Build shared identity, organisation membership, permissions, notifications, audit, collaboration, files, financial records and analytics as reusable platform services.
- Security, privacy, accessibility, moderation, reliability and observability are acceptance requirements, not optional polish.
- Use human review for consequential moderation, commercial commitments and AI-generated external content.
- Do not create wallet, escrow or stored-value custody in the initial scope. Any live payment/payout product needs qualified legal, tax, provider and operational review.
- Do not claim social metrics, conversions, ROI, testimonials, reviews or production status without evidence.

---

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


---

# 21. Additional recommended capabilities to make YaarLink more complete

**Status:** New proposals for product consideration. None of the following should be treated as implemented until verified in code and production. These additions extend the two source documents; they do not replace any original requirement.

## 21.1 Guided onboarding and activation
- Separate onboarding paths for creators, brands and agency staff.
- Save-and-resume onboarding with clear progress and validation.
- Role-specific checklists showing the next useful action.
- Profile completeness guidance without forcing unnecessary personal information.
- Brand campaign brief templates by objective and industry.
- Sample/demo content clearly labelled as examples, never mixed with real marketplace data.
- First-value milestones: creator publishes an approved profile; brand completes verification and publishes an approved campaign; agency creates a client and project.
- Track onboarding drop-off using privacy-conscious product analytics.

## 21.2 Help centre and customer support operations
- Public searchable help centre, FAQs, policy pages and getting-started guides.
- In-product support request form with category, urgency and related campaign/order.
- Support ticket lifecycle: open, assigned, waiting for user, escalated, resolved and closed.
- Internal-only notes separated from user-visible replies.
- Attachments stored privately and access-controlled.
- Service-level targets, assignment queues and escalation rules.
- Dispute evidence timeline with decision reason and appeal route.
- User-visible status and notification history.
- Support analytics: response time, resolution time, backlog and repeat issues.

## 21.3 Trust centre and quality operations
- Transparent verification explanations for creators, brands and businesses.
- Public explanation of what a verification badge does and does not mean.
- Report listing/profile/message/content controls.
- Moderation case queue with severity, category, evidence, assigned reviewer and decision.
- Appeal and reinstatement workflow.
- Repeat-abuse and duplicate-account review using proportionate signals and human judgment.
- Policy version history and acknowledgement where appropriate.
- Separate operational flags from public labels; never publicly accuse a person based on an unverified automated signal.

## 21.4 Marketplace quality and supply-demand management
- Category and niche taxonomy with controlled vocabulary and synonyms.
- Duplicate listing detection and stale campaign expiry.
- Profile quality checks for missing fields, broken social links and outdated metrics.
- Campaign quality checklist before submission.
- Search relevance monitoring and zero-result analysis.
- Waitlists or saved searches for creators when suitable campaigns are unavailable.
- Brand demand insights by category and location using aggregated, privacy-safe data.
- Human-curated collections only when selection criteria are transparent and not misleading.

## 21.5 Growth, referrals and partner operations
- Referral links for approved brand and creator invitations.
- Referral attribution with clear eligibility, expiry and anti-abuse controls.
- Partner/agency onboarding and partner profile pages.
- Referral reward records only after the legal, tax and financial model is approved.
- Campaign case studies based on verified, permissioned outcomes.
- Landing-page and SEO content management with review workflow.
- Email preference centre and consent-aware lifecycle messaging.
- Growth experiments behind feature flags, with holdout and rollback controls.
- Do not use dark patterns, misleading urgency or unsolicited bulk messaging.

## 21.6 Content and asset management
- Shared asset library scoped to an organisation, campaign or collaboration.
- Asset metadata: owner, source, upload date, version, usage rights, expiry and permitted channels.
- Brand asset kits: logos, colours, product references and approved claims.
- Creative brief templates and reusable deliverable checklists.
- Expiring usage-rights reminders and content takedown workflow.
- Secure file previews, upload validation, malware scanning where available and download audit events.
- Clear retention and deletion rules for raw drafts and final assets.

## 21.7 Subscription and entitlement management
- Plan catalogue, feature entitlements and usage limits.
- Trial, upgrade, downgrade, cancellation and renewal states.
- Seat and organisation limits.
- Usage metering for campaigns, seats, exports or other clearly defined features.
- Billing history, tax invoice references and failed-payment handling.
- Grace periods and access downgrade rules.
- Admin-controlled promotional codes with audit trail.
- Never gate access to a user's own data or make cancellation intentionally difficult.
- Publish plan limits and fees before purchase; do not hard-code plan checks only in the UI.

## 21.8 Platform integration and developer operations
- Central integration registry showing connected provider, scopes, owner, status and last successful sync.
- OAuth consent and revocation flow where supported.
- Webhook endpoint registry with signature verification, replay protection and idempotency.
- Retry queue and dead-letter handling for failed provider events.
- API versioning and documented rate limits if public APIs are introduced.
- Secrets stored only server-side and rotated under an operational policy.
- Provider outage status and graceful fallback to manual evidence where appropriate.
- Never request third-party account passwords or scrape restricted data.

## 21.9 Product analytics and experimentation
- Event taxonomy for signup, verification, profile completion, campaign creation, applications and completed collaborations.
- Funnel reports by role and acquisition source, with privacy safeguards.
- Cohort retention and activation reporting.
- Search quality, campaign fill rate, time-to-first-response and collaboration completion metrics.
- Data dictionary defining each KPI, formula, time window and source.
- Separate internal analytics from client-facing campaign performance.
- Feature flags, staged rollout, experiment owner, success metric and rollback condition.
- Avoid collecting unnecessary sensitive or personally identifying analytics data.

## 21.10 Reliability, operations and release management
- Health checks for database, email, storage, background jobs and external integrations.
- Structured logs with request IDs and sensitive-data redaction.
- Error monitoring, latency and availability dashboards.
- Backup schedule, restore drills and documented recovery objectives.
- Staging environment isolated from production data and credentials.
- Feature flags for risky releases and emergency kill switches.
- Database migration preflight, backup, rollback and post-deploy verification.
- Deployment checklist and release notes.
- Incident runbooks for account compromise, data exposure, payment-provider outage, email outage and failed migration.
- Accessibility, responsive design, performance budgets and browser compatibility checks in release gates.

## 21.11 Accessibility, localisation and inclusive UX
- Keyboard navigation and visible focus states.
- Semantic labels, accessible forms and screen-reader feedback.
- Sufficient contrast and reduced-motion support.
- Responsive layouts for mobile, tablet and desktop.
- Consistent English, Hindi and Punjabi terminology across all key workflows.
- Locale-aware date, time, currency and number formatting.
- Clear error messages and recovery guidance.
- Plain-language explanations for verification, usage rights, fees and collaboration states.
- Test critical flows with assistive technology and real mobile browsers.

## 21.12 Data governance and privacy operations
- Data inventory mapping each field to purpose, owner, sensitivity and retention.
- Consent ledger for social connections, marketing communications and analytics where applicable.
- Access/export/deletion request tracking with identity verification and completion evidence.
- Retention schedules for inactive accounts, verification evidence, messages and uploaded assets.
- Legal hold and dispute exceptions documented with restricted access.
- Data correction workflow for inaccurate creator metrics and profile information.
- Privacy-safe aggregation for internal reporting.
- Periodic access reviews for agency, support, finance and platform admin roles.

## 21.13 Recommended product KPIs
Define each KPI with a formula, owner, source and reporting period before displaying it:
- Creator activation rate: new creators who complete required profile steps.
- Brand activation rate: new brands that complete verification and publish an approved campaign.
- Campaign fill rate: campaigns with at least one accepted collaboration divided by eligible published campaigns.
- Time to first qualified application.
- Application-to-collaboration conversion.
- Collaboration completion rate.
- On-time deliverable rate.
- Revision rate and approval turnaround time.
- Repeat brand rate and creator repeat-collaboration rate.
- UGC order completion and dispute rate.
- Support first-response and resolution time.
- Marketplace liquidity by category and geography.
- Platform reliability and notification delivery success.
Do not optimise a KPI in a way that encourages low-quality applications, unsafe content, misleading metrics or unfair treatment.

## 21.14 Prioritisation of these additions
- **Foundation / early:** onboarding checklists, support tickets, policy/help centre, taxonomy, asset permissions, event definitions, accessibility and operational monitoring.
- **After core collaboration:** trust centre, marketplace quality tools, content asset library, data governance workflows and useful KPI dashboards.
- **Growth stage:** referrals, partner operations, subscription entitlements, product experiments and developer integrations.
- **Scale stage:** advanced cohort analytics, automated quality assistance and deeper integrations after data quality and governance are proven.

---

# Appendix C — Original reconstruction blueprint (preserved in full)

The following is the complete original reconstruction blueprint as it existed on branch `rebuild/yaarlink-unified-platform-blueprint`. It is retained in full to preserve every original requirement, workflow, route proposal, database rule, security rule, acceptance test and implementation constraint. The consolidated sections above are the primary current reference; this appendix is the source archive.

---

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

