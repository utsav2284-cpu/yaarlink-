# Production admin database installation

- Project: `dqhxgwzjwzvpqiilteld` (Yaarlink).
- Migration: `production_admin_marketplace_setup`, version `20261106063943`.
- Applied SQL source: `0001_admin_marketplace.sql` at commit `33eed37b9f878439e86b82e75bc1a6020524bca0`, SHA-256 `b04caee024269192e062d57838bd6214a5dae671b32edf3001eae146ebb60cc5`.
- The loader verifies the committed source digest before executing it transactionally. It creates the `http` extension in a dedicated `yl_migration_transport` schema with no schema usage for `anon`, `authenticated`, or `service_role`; the extension is not intended as an application API.
- Post-install checks: owner unclaimed; no admin profiles or invitations; admin/audit tables have RLS; public review/claim RPCs deny anonymous execution. The anonymous boolean-only setup-status RPC returned true over Supabase REST with a publishable key.
- Local PostgreSQL replay and rollback-only hosted synthetic replay passed. Neither proves production email delivery, a real owner claim, PostgREST review calls, public application eligibility through the app, or browser operation.
- The current Production website has not been deployed from this branch. Production Auth invite delivery, exact redirect configuration, operator dry-run, owner public-key fingerprint verification, and first-owner invitation remain outstanding. Production Auth currently needs an independently verified invite-only policy and email delivery path; existing website Resend environment settings do not establish Supabase Auth SMTP.
