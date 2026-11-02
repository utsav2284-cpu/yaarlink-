# YaarLink — repository structure

The code is split by responsibility. The `@/*` path alias (see `tsconfig.json`) maps to the
repository root, so an import reads like the folder it comes from: `@/backend/auth`,
`@/shared/constants`, `@/config/site`.

```
.
├── app/                     # Next.js App Router — the route tree
│   ├── api/**/route.ts      #   HTTP route handlers
│   ├── **/page.tsx          #   pages, layouts, globals.css, robots/sitemap/icon
│   └── layout.tsx
├── frontend/                # Client-side UI
│   ├── components/          #   shared React components (Navbar, Footer, …)
│   └── i18n.tsx             #   language provider + dictionaries
├── backend/                 # Server-side only
│   ├── db/                  #   Drizzle client, verified-TLS pool, schema, baseline migrations
│   ├── observability.ts     #   request-scoped server logging context
│   ├── auth.ts              #   password hashing + session cookies
│   ├── admin.ts             #   owner/admin session
│   ├── bot-challenge.ts     #   signed one-time public-form proof-of-work challenges
│   └── rate-limit.ts        #   PostgreSQL-backed distributed request limiter + auth lockouts
├── shared/                  # Isomorphic domain code (usable on both sides)
│   ├── constants.ts         #   categories, languages, budgets, formatINR
│   └── observability.ts     #   dependency-free redacted JSON logging primitives
├── config/                  # Site configuration
│   └── site.ts              #   contact details + WhatsApp/e-mail/Instagram links
├── scripts/                 # Operator scripts (empty-database bootstrap/verifier)
├── tests/                   # Node test suite
├── .github/workflows/       # CI: quality checks + disposable-PostgreSQL bootstrap
├── docs/                    # This folder — structure, deployment and observability notes
├── proxy.ts                 # Document CSP nonce/reporting + API/document request IDs
└── <tooling configs>        # next/tsconfig/drizzle/postcss/eslint at the root
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
