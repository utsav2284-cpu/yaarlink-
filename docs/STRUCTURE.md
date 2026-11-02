# YaarLink — repository structure

The code is split by responsibility. The `@/*` path alias (see `tsconfig.json`) maps to the
repository root, so an import reads like the folder it comes from: `@/backend/auth`,
`@/shared/constants`, `@/config/site`.

```
.
├── app/                         # Next.js App Router — the route tree
│   ├── api/**/route.ts          #   HTTP route handlers
│   ├── **/page.tsx + layout.tsx #   pages and layouts
│   └── globals.css, fonts/, icon.svg, manifest.ts, opengraph-image.tsx,
│       robots.ts, sitemap.ts    #   global styles and generated metadata routes
├── frontend/                    # Client-side UI and browser helpers
│   ├── components/              #   shared React components (Navbar, Footer, page clients)
│   ├── i18n.tsx                 #   language provider and dynamic-value helpers
│   ├── i18n/                    #   config, locale loading/formatting, server and route helpers
│   │   └── locales/             #   en.ts, hi.ts, pa.ts dictionaries
│   └── api-json.ts, bot-challenge.ts, form-drafts.ts, session-context.tsx
├── backend/                     # Server-side only
│   ├── db/                      #   Drizzle schema/client, verified-TLS pool, health,
│   │                            #   slow-query fingerprints, baseline + historical migrations
│   ├── account*.ts, admin*.ts, auth.ts, email-verification.ts,
│   │   identity-sync.ts         #   accounts, sessions, admin access, identity changes
│   ├── bot-challenge.ts, password-policy.ts, public-env.ts,
│   │   rate-limit.ts, secret-config.ts
│   │                            #   abuse controls, credential policy, startup validation
│   ├── application-*.ts, campaign-lifecycle.ts, content-moderation.ts,
│   │   moderation.ts, notifications.ts, own-applications.ts,
│   │   platform-settings.ts, public-listings.ts
│   │                            #   marketplace workflows, review state, notices, listings
│   ├── audit-events.ts, health-diagnostics.ts, observability.ts
│   │                            #   domain history, protected diagnostics, request logging
│   ├── email.ts, pagination.ts, validation.ts
│   │                            #   mail transport, cursor pagination, input parsing
│   └── social-url.ts            #   server-facing re-export of shared/social-url.ts
├── shared/                      # Isomorphic domain code (usable on both sides)
│   ├── constants.ts             #   categories, languages, formats, statuses, limits, formatINR
│   ├── contact-links.ts         #   validated contact/social link construction
│   ├── social-url.ts            #   Instagram/YouTube/profile URL normalization
│   ├── observability.ts         #   dependency-free redacted JSON logging primitives
│   └── password-policy.ts, return-to.ts, user-roles.ts
├── config/                      # Site configuration
│   ├── site.ts                  #   canonical origin, contact details, validated link builders
│   └── metadata.ts              #   per-route canonical/social metadata from SITE.url
├── scripts/                     # Operator scripts (empty-database bootstrap/verifier)
├── tests/                       # Node test suite
├── .github/workflows/           # CI: quality checks + disposable-PostgreSQL bootstrap
├── .github/dependabot.yml       # Scheduled npm and GitHub Actions update PRs
├── docs/                        # Structure, deployment, backup and observability notes
├── instrumentation.ts           # Startup secret/site-config checks + unhandled-error logging
├── proxy.ts                     # Document CSP nonce/reporting + API/document request IDs
└── <tooling configs>            # next/tsconfig/drizzle/postcss/eslint and .nvmrc at the root
```

## Why `app/` is at the root and not inside `frontend/`

Next.js discovers routes from the filesystem: the App Router tree must be either `app/` or
`src/app/` at the project root, and there is no configuration option to point it elsewhere
(`srcDir` was removed in Next.js 16). Page components and `route.ts` handlers therefore stay in
`app/**`, which is why the route handlers are not inside `backend/`.

`app/**` is intended to stay thin: routing plus request/response shaping. Anything reusable lives
in `frontend/`, `backend/`, `shared/` or `config/`, and the handlers import it from there.

## Rules of thumb

- `frontend/` — imports React or browser APIs, or renders UI.
- `backend/` — imports the database, reads secrets, sets cookies; never imported by a Client Component.
- `shared/` — pure values and helpers with no framework or platform dependency.
- `config/` — settings a non-developer may need to edit (site name, phone number, links).

Tool configs (`next.config.ts`, `tsconfig.json`, `drizzle.config.json`, `eslint.config.mjs`,
`postcss.config.mjs`) stay at the repository root because the tools look for them there;
`drizzle.config.json` points at the schema at `backend/db/schema.ts` and writes
journalled migrations/snapshots to `backend/db/drizzle/`.
