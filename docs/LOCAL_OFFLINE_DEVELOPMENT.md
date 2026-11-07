# Local offline development

Use this guide to run the public YaarLink application against a local PostgreSQL database and local email/password-check stubs. Never point local development at Production.

## Requirements

- Node.js 22 or newer and npm 10 or newer
- Docker with Docker Compose

## Start local services

```bash
cp .env.local.example .env.local
npm ci
npm run local:db:up
npm run local:services
```

In another terminal, initialize the disposable local database using its bootstrap URL:

```bash
npm run local:bootstrap
npm run dev
```

Open <http://localhost:3000>. The local email stub writes messages to `.local/email-outbox.jsonl`; use those links to exercise account verification and recovery. The local password-range stub is test-only and is not a real breach database.

## Public product smoke test

1. Create a brand account and verify its email using the local outbox.
2. Create a campaign from the brand dashboard.
3. Create a creator account with a different email, verify it, and apply to that campaign.
4. Confirm the brand sees its own campaign/application data and that public campaign/creator pages omit private contact and budget fields.
5. Exercise account settings, password recovery, contact links, and `/api/health`.

Use synthetic data only. Keep local credentials, messages, and database contents out of Git. The `.env.local` and `.local` paths are ignored by Git.

## Stop services

```bash
npm run local:db:down
```

Stop the local services process with Ctrl+C. To reset the disposable database, remove its local Docker volume only after confirming it contains no data you need to keep.
