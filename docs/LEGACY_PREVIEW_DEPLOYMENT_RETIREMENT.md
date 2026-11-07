# Legacy Preview Deployment — Route Verification & Safe Retirement Report

**Status:** Report and procedure only. No deployment was deleted, disabled, or modified.  
**Date:** 2026-11-05  
**Branch:** `arena/9b3c6e40-yaarlink`  
**Vercel project:** `prj_nXvPZ5A39vGdVOykIb8PlfCn9Ih3` (yaarlink)

## 1. Current position

Ten READY deployments associated with `arena/9b3c6e40-yaarlink` were enumerated in Phase 3. Each is a whole-site deployment with a unique Vercel URL. Their commits pre-date the legacy Admin cleanup commit `3edcd8bba6b24cc6c0ec3a949eee0c25415cb9d7`, so legacy Admin code was present in the source snapshots at build time.

Two facts remain **unverified** and must not be assumed:

1. **Live route exposure** — no successful request to the legacy Admin routes of these deployment URLs has yet been recorded. READY state and commit contents do not prove a route is reachable.
2. **Database target per deployment** — which database each deployment connected to is unverified. Preview `DATABASE_URL` for the active branch was stored as sensitive and returned `value: null`, `decrypted: false` from the connector, so neither the host nor whether it matches a prior Preview ref could be confirmed. Older deployments may or may not have used the same variables; no deployment may be described as disconnected from a database until checked.

Therefore no deployment in this report is yet classified as safe to retire.

## 2. READY deployment inventory

| # | Deployment ID | Commit | URL | Created (UTC) | Vercel target |
|---|---|---|---|---|---|
| 1 | `dpl_A6BSMbQEhedjaWvq1KJpGTc2uhJi` | `06e7760` | `yaarlink-oiu4gdava-utsav-936a.vercel.app` | 2026-11-05 13:23:51 | `null` |
| 2 | `dpl_FEzkw6wi97i4ai5Z9EuBWvERwk7d` | `232c88b` | `yaarlink-jfq5k8shw-utsav-936a.vercel.app` | 2026-11-05 13:08:53 | `staging` |
| 3 | `dpl_C1pizEQk1nQBwmBukJnUV8hUaynq` | `232c88b` | `yaarlink-nyqfhzrc0-utsav-936a.vercel.app` | 2026-11-05 13:08:31 | `null` |
| 4 | `dpl_6omjo1yoVuEGZ8LdczK2i582epv8` | `3830220` | `yaarlink-ioypfdcfq-utsav-936a.vercel.app` | 2026-11-05 12:59:46 | `staging` |
| 5 | `dpl_Gqi9SSmQLjmA4P4H39Fn9s9exyu3` | `3830220` | `yaarlink-nl8mrcq5k-utsav-936a.vercel.app` | 2026-11-05 12:37:43 | `null` |
| 6 | `dpl_DGAdxzCC871XxpFcwRfVMBiNyzyU` | `ba81214` | `yaarlink-3i2sqw0y5-utsav-936a.vercel.app` | 2026-11-05 12:22:01 | `null` |
| 7 | `dpl_Bbc5kCVtW1yCX1BQPiTBKqVMDdH5` | `f0855fb` | `yaarlink-h1jb6eshf-utsav-936a.vercel.app` | 2026-11-05 12:08:41 | `null` |
| 8 | `dpl_CKgVk7LpqgYCU6UPn2Zz7YQ23sY9` | `652da5d` | `yaarlink-f4jugl9pl-utsav-936a.vercel.app` | 2026-11-05 11:46:05 | `null` |
| 9 | `dpl_94QgyHBTM2Y8oPMeHwniZNUtgYVR` | `546f888` | `yaarlink-45v10onaf-utsav-936a.vercel.app` | 2026-11-05 11:23:24 | `null` |
| 10 | `dpl_8tSjZBRnzGGy6QibumTYRGE9igTw` | `9e60f94` | `yaarlink-dujz40z1i-utsav-936a.vercel.app` | 2026-11-04 05:51:41 | `null` |

Keep the newest deployment (#1, `dpl_A6BSMbQEhedjaWvq1KJpGTc2uhJi`) as a rollback/reference point until an authorized successor Admin Preview is verified.

## 3. How to verify old Admin routes (read-only, no authentication)

For each deployment URL, issue anonymous `GET`/`HEAD` requests only — never submit login, setup, reset, MFA, TOTP, recovery, or passkey forms, and never attempt a bypass. Record status code, redirect target, and content type. Routes to probe:

- Pages: `/admin`, `/admin/sign-in`, `/admin/setup`, `/admin/forgot-password`, `/admin/reset-password`, `/admin/security`, `/admin/preview-runtime-check`
- APIs: `/api/admin`, plus identity/MFA/TOTP/recovery/passkey subroutes present in the pre-cleanup snapshot at `c34c32e9a60f53392fe554bf15117518a2b9bcfb`

Classification per route:

| Response | Classification |
|---|---|
| `404` | Route absent in that build |
| `200` with login/setup HTML | Route exposed (reachable surface; note whether it renders real or synthetic content) |
| `401` / `403` | Route present but gated — still record as exposed surface |
| `3xx` to a login page on the same deployment | Route present behind redirect |
| `5xx` | Route present but erroring; investigate logs before any retirement decision |
| Timeout / unreachable | Unverified — retry from another network before classifying |

Method constraints:

- Run from an environment with outbound access to `*.vercel.app`; the sandbox used in Phases 3–4 did not have that access, which is why live exposure is still unverified.
- One `list_deployment_files` attempt (`dpl_A6BSMbQEhedjaWvq1KJpGTc2uhJi`) returned 404 "File tree not found", so file-tree inspection is not a reliable substitute.
- Do not send bodies, credentials, cookies, or `Authorization` headers. Treat any private data encountered as an incident; stop probing that deployment and report.
- Repeat the probe for every deployment; identical commits (e.g. #2/#3, #4/#5) can still behave differently if their build-time variables differed.

## 4. Safe retirement sequence (for later, explicit approval required)

Per deployment, in order:

1. **Confirm no live dependency or rollback loss.** Check Vercel aliases/domains pointing at the deployment, recent traffic, and whether anyone uses the URL (shared links, webhooks, QA references). Confirm deployment #1 (or a verified successor) remains available as the rollback/reference deployment before deleting anything. A deployment serving an alias must not be retired first.
2. **Record final evidence.** Save the Phase 3 inventory row, the §3 route classifications, git commit, and build target. Note the database-target result as verified or explicitly unverified.
3. **Resolve database uncertainty.** Before deleting a deployment that might be wired to a live database, verify which database its configuration targets using an authorized, secrets-safe method. If the database target cannot be verified, retire the deployment only after confirming the referenced database itself is decommissioned or credential-rotated, so a stale URL cannot be revived against live data.
4. **Prefer protect-then-delete.** Where Vercel deployment-protection is available for the project, enable/tighten it first, observe an agreed window (suggested ≥ 7 days) for breakage reports, then delete.
5. **Retire oldest first.** Suggested order: #10 → #2, preserving #1 (newest) until the replacement Admin Preview is verified. Delete one at a time with the named Vercel deletion capability for that exact deployment ID, then re-check project domains, aliases, and the promoted Production deployment `dpl_DsRgoApAhB7pR438VRwsiXWehakm`.
6. **Stop conditions.** Halt retirement if any deployment serves a production alias, a route exposes real (non-synthetic) data, its database target is a live Production database, or deletion would remove the only rollback reference.

## 5. Non-actions in this phase

No deployment was deleted, disabled, redeployed, or modified; no Vercel variable was changed; no Production setting, domain, or DNS record was touched. This report prepares the retirement process only. **Explicit approval is required before any deployment is retired.**
