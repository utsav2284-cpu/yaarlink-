# YaarLink Admin Preview v2 — Phase 6 Auth Hardening Record

**Date:** 2026-11-05  
**Project:** `yaarlink-admin-preview-v2` · **Ref:** `qwngmsedyepghskoagaj` · **Region:** `ap-south-1` · **Plan:** Free  
**Production project `dqhxgwzjwzvpqiilteld`:** not read for modification and not changed.

## 1. Authentication settings changed (this project only)

Applied via Supabase Auth configuration on `qwngmsedyepghskoagaj`:

| Setting | Before | After |
|---|---|---|
| Public signup (`disable_signup`) | `false` | **`true`** — public registration disabled |
| Email provider | enabled | enabled (unchanged) |
| Phone provider | disabled | disabled (unchanged) |
| Email autoconfirm (`mailer_autoconfirm`) | `false` | `false` (unchanged; email verification required) |
| Access-token lifetime (`jwt_exp`) | 3600s | 3600s (unchanged) |
| Refresh-token rotation | enabled | enabled; reuse interval 10s (unchanged values, explicitly set) |

Verified after the change by re-reading the Auth configuration: `disable_signup: true`, email enabled, phone disabled, autoconfirm off.

## 2. Public signup status

**Disabled.** With `disable_signup: true`, the public Auth signup endpoint rejects self-registration. Anonymous (unauthenticated) users also cannot obtain accounts because the only remaining creation paths are operator-controlled (dashboard / service-role Admin API / invite), none of which are exposed publicly. No anonymous sign-in provider is enabled (`external_anonymous_users_enabled: false`).

## 3. Invitation configuration

- Invite-only is achieved by `disable_signup: true` plus operator-issued invitations (Supabase `inviteUserByEmail` via a future server-side, service-role-only process, or the Supabase dashboard by a project owner).
- Invited users set their own password through the invite link; invitations never grant Admin roles by themselves — role assignment remains a separate, server-controlled, audited step (see `docs/ADMIN_PREVIEW_V2_ARCHITECTURE.md` §4).
- No invitation has been sent and no user account has been created in this phase.
- **Blocked item:** invite/redirect links require a confirmed Site URL and redirect allowlist (§5). Invitations must not be issued until those are set from a verified Preview origin.

## 4. MFA / TOTP configuration

Configuration read from the project:

- TOTP enrollment: **enabled** (`mfa_totp_enroll_enabled: true`)
- TOTP verification: **enabled** (`mfa_totp_verify_enabled: true`)
- Phone MFA: disabled; WebAuthn MFA: disabled; passkeys: **disabled** (`passkey_enabled: false`) — left off pending separate review, as approved.
- `mfa_allow_low_aal: false`; max enrolled factors 10.

**What config alone does not do:** enabling TOTP makes MFA *available*; it does not make it *mandatory*. Mandatory MFA requires application-level enforcement: after sign-in, the future Admin app must check the session's Authenticator Assurance Level, require `aal2` (verified TOTP factor) before granting any privileged route/API access, force enrollment when no verified factor exists, and enforce the same AAL2 check in RLS policies/server authorization for privileged operations. That enforcement is future application work (Phase 8+), and no Dashboard code exists yet.

## 5. Site URL and redirect configuration

**Not changed — intentionally.** The repository was inspected for Preview callback URLs:

- The active codebase contains no Supabase Auth integration and no Admin callback route (the Admin Dashboard was removed in `3edcd8b`; the site's own login uses `APP_URL`-based links, and `config/site.ts` points at Production `https://www.theyaar.com`).
- The only Preview deployments that exist are legacy whole-site deployments whose Admin code was removed; none is the future Admin Preview origin.

Per instructions not to guess URLs or include Production URLs, `site_url` remains the Supabase default `http://localhost:3000` and `uri_allow_list` remains empty. **Before any invitation is sent**, the future Admin Preview origin must be approved and then set exactly (Site URL + `/auth/callback`-style redirect paths as implemented). Until then, do not issue invites.

Also noted for the next configuration pass (not settable via the available connector): password policy currently `password_min_length: 6` with no required-character rules and leaked-password (HIBP) check disabled — strengthen to ≥12 characters with HIBP check in the Supabase dashboard or a later approved configuration step; built-in Auth rate limits are present (e.g. verify/OTP/token-refresh/anonymous limits) and were left at defaults pending app-level review.

## 6. First Super Admin (first-owner) setup design — not executed

1. Prerequisite: §5 Site URL/redirects set from the approved Preview origin; `disable_signup` remains `true`.
2. The organization owner verifies the first owner's identity out of band (known email + independent channel confirmation).
3. A project owner issues a single Supabase invitation to that exact email from the dashboard (or, later, a reviewed server-side invite endpoint using the service-role key held server-only). The invite is single-use and time-limited; the link/token is never logged, committed, or shared in chat.
4. The invitee sets their own password (no shared `ADMIN_PASSWORD`, no hardcoded credentials), then immediately enrolls TOTP; the future app must refuse privileged access until AAL2 is reached.
5. Only after AAL2 is verified does a reviewed, audited server-side operation grant the `owner` role for that specific Auth user ID (role stored server-controlled, never in editable user metadata).
6. **Lock-out of further claims:** ownership can only be granted by an existing owner through the same audited operation; there is no public setup route, no "first user becomes owner" logic, and `disable_signup` stays on permanently. A one-time bootstrap flag (checked server-side against "an owner already exists") permanently disables the bootstrap path once the first owner exists.
7. Emergency recovery: a second owner or documented two-person recovery via the Supabase organization owner, followed by session revocation and audit review.

No first administrator account was created in this phase.

## 7. Security test results

| # | Test | Method | Result |
|---|---|---|---|
| 1 | Anonymous signup rejected | Config re-read (`disable_signup: true`) | **Pass (configuration)** |
| 1b | Anonymous signup rejected (live HTTP) | Attempted `POST /auth/v1/signup` from the sandbox with an invalid test key | **Not performed** — sandbox has no outbound route to `*.supabase.co` (TLS connect failed, no account created). Re-test from an approved network in the next phase. |
| 2 | Unauthorized account creation | No public signup path; anonymous provider disabled; no invite issued | **Pass (configuration)**; live re-test pending with 1b |
| 3 | Invited-user authentication | Requires Site URL/redirects (§5) and an issued invite | **Not yet testable** — by design no invite issued |
| 4 | TOTP enrollment available | Config read: `mfa_totp_enroll_enabled: true` | **Pass (configuration)** |
| 5 | MFA verification works | Config read: `mfa_totp_verify_enabled: true`, `mfa_allow_low_aal: false` | **Pass (configuration)**; live enrollment/verification needs a test user + app or API client — deferred |
| 6 | Privileged access requires AAL2 | No Admin app, tables, or policies exist yet | **Not yet implementable** — application-level requirement documented in §4 |

No test accounts were created; no passwords, keys, or tokens were exposed.

## 8. Remaining application-level work

- Set Site URL + redirect allowlist once the Admin Preview origin is approved; then re-run live tests 1b, 3, 5.
- Strengthen password policy (≥12 chars, HIBP) via dashboard/later config step.
- Build (future phases): invite-issuing server endpoint, first-owner bootstrap with permanent lockout, AAL2 enforcement middleware, RBAC roles, RLS policies, append-only audit logs, recovery codes, session revocation tests, synthetic seed data.
- Configure Preview-scoped Vercel variables for the future Admin deployment (separate approval; none modified here).

## 9. Production confirmation

No calls modified Production Supabase (`dqhxgwzjwzvpqiilteld`), Production Vercel variables, or any deployment. No Admin tables, migrations, deployments, merges, paid features, or plan upgrades were made. The only change was Auth configuration on the Preview project `qwngmsedyepghskoagaj`.
