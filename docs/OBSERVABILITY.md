# YaarLink observability

## Status

The application now emits structured, privacy-screened logs and request IDs
without depending on a particular monitoring vendor. Those logs are available
in the deployment platform's normal runtime log stream.

An external log drain, hosted error tracker, product-analytics system, and
uptime monitor are **not activated by this repository**. In particular, do not
claim that external alerting is live until the project owner has created it in
the chosen provider, connected it to the canonical Vercel project, and verified
delivery. No product-analytics tracking is added by this code.

## Structured log contract

Server and browser operational logs are single-line JSON objects. A record
contains the following core fields when they are available:

| Field | Meaning |
|---|---|
| `timestamp` | ISO 8601 UTC emission time |
| `level` | `debug`, `info`, `warn`, `error`, or `fatal` |
| `event` | Stable event name, suitable for alerts and grouping |
| `service` | Always `yaarlink` |
| `env` | Deployment/runtime environment |
| `route` | Method plus normalized path or route template |
| `requestId` | Correlation ID (also returned as `x-request-id`) |
| `component` | Subsystem such as `database`, `session`, or `email` |
| `operation` | Operation inside the component/route |
| `error` | Sanitized error projection, when the record is an error |

Example shape:

```json
{
  "timestamp": "2026-11-02T12:00:00.000Z",
  "level": "error",
  "event": "request.failed",
  "service": "yaarlink",
  "env": "production",
  "route": "POST /api/contact",
  "requestId": "req_12345678",
  "component": "email",
  "operation": "send_notification",
  "error": { "name": "Error", "message": "Provider unavailable" }
}
```

### Stable events

Important events include:

- `startup.configuration_failed` — server secret/configuration validation
  failed during startup.
- `request.unhandled` — Next.js reported an unhandled server request/render
  error through `onRequestError`.
- `request.failed` — a handled route/page failure; use `route`, `component`,
  and `operation` to distinguish subsystems such as email delivery.
- `session.operation_failed` and `admin_session.lookup_failed` — session-store
  degradation, intentionally limited to the root error name/code.
- `database.slow_query` — a pooled database query exceeded the configured
  threshold.
- `database.schema_incomplete` and `database.health_check_failed` — the
  internal health check detected an incomplete schema or connectivity failure.
- `database.pool_idle_client_error` — an idle pooled PostgreSQL client failed.
- `rate_limit.database_unavailable` — the database-backed rate limiter could
  not be reached and the application used its safe fallback behavior.
- `admin_login.succeeded_after_failures` — an admin eventually authenticated
  after failed attempts from the same rate-limit bucket.
- `security.csp_report` — a browser Content Security Policy report after the
  endpoint's allowlist sanitization.
- `i18n.language_load_failed` and `i18n.unknown_dynamic_value` — browser-side
  language-bundle/enum diagnostics. These remain browser console records unless
  a separately reviewed client error-reporting integration is added.

## Privacy and secret boundary

The logger is deliberately not a pass-through for arbitrary objects:

- Secret-bearing and content-bearing keys are redacted, including credential,
  cookie, token, password/hash, request-body, query, parameter, and payload
  style fields.
- Strings are screened for credential-bearing URLs, URL query/fragment values,
  authorization values, JWT-shaped values, known password-hash formats,
  email addresses, phone-like numbers, and explicit secret assignments.
- Database errors are projected onto structural fields only (`name`, generic
  or sanitized `message`, `code`, `constraint`, `table`, `column`, `schema`,
  `routine`, and `severity`). Drizzle errors that may contain SQL or bound
  parameters are replaced with `Database query failed`.
- PostgreSQL `detail` and `hint` are never copied into the serialized error,
  because a detail string can contain a conflicting email or other row value.
- Values are bounded by string length, array/object size, nesting depth, and
  stack length.

Logs can still contain internal record/request UUIDs, route names, timing,
provider status, and sanitized stack traces. Treat them as access-controlled
operational data with a defined retention period. Do not paste raw provider
payloads, database URLs, headers, or customer content into a new log call.

## Request correlation

`proxy.ts` runs for both documents and `/api/*` requests. It accepts a
shape-valid inbound `x-request-id`, otherwise generates one, forwards it to the
application, and returns it on the response. Server route helpers preserve the
same ID and normalized route in request-scoped logs and nested email/audit
failures. A route helper also establishes ambient context for later logs in
that request; a slow query that occurs before any such helper may therefore
omit `requestId` rather than inventing a second, non-matching ID.

A caller-supplied ID is useful only for correlation. It is not authentication
and must never be trusted for identity, authorization, or uniqueness proofs.

## Slow-query logging

The shared node-postgres pool times pooled-client queries. When a query meets
or exceeds the threshold, it emits `database.slow_query` at `warn` level with:

- duration and threshold;
- the SQL operation keyword (for a CTE, the main operation after the CTEs);
- the first 16 hexadecimal characters of a SHA-256 fingerprint over normalized
  SQL;
- PostgreSQL row count when the driver exposes it;
- success/error outcome and, on failure, only the sanitized error name/code.

Normalization removes comments and replaces string literals, positional
parameters, and numbers before hashing. Raw SQL, bound values, result rows,
connection strings, hostnames, and credentials are not logged.

`SLOW_QUERY_THRESHOLD_MS` defaults to `1000`. Missing/invalid values use the
default; numeric values are clamped to 50–60000 ms.

A repeated fingerprint identifies a query shape to investigate, not the exact
production parameters. Reproduce it with synthetic data/parameters in an
isolated database before using `EXPLAIN (ANALYZE, BUFFERS)`. A provider with
administrator access may additionally use `pg_stat_statements` for aggregates
where the hosting platform has already enabled it; restrict access because
query-shape data is still operationally sensitive. The application bootstrap
does not require or enable that extension.

## Configure an external Vercel log drain (owner action)

Vercel drains are an external account/project configuration. Vercel documents
that drains are available on Pro and Enterprise plans and are created from
Team Settings → Drains. See
<https://vercel.com/docs/drains/using-drains>.

Recommended setup:

1. Choose the log provider and create its project/dataset/index and ingestion
   credential. Restrict the credential to log ingestion if the provider
   supports scoped credentials.
2. In Vercel, open the owner team's **Settings → Drains → Add Drain**.
3. Select **Logs**, select only the canonical `yaarlink-` project, and select
   the **Production** environment. Add Preview only if it goes to a separate
   non-production dataset and does not share the production database.
4. Choose the provider integration or a custom HTTPS endpoint. For a custom
   endpoint, use JSON or NDJSON as required by the receiver, return HTTP 200
   for accepted batches, and verify Vercel's drain signature as described in
   Vercel's drain-security documentation.
5. Store ingestion API keys/custom headers only in Vercel/provider secret
   settings. Never add them to Git, a `NEXT_PUBLIC_*` variable, an issue, or a
   pull request.
6. Start with 100% of the selected production log sources so error records are
   not sample-dropped. Revisit sampling only after measuring real volume and
   confirming that alert-critical events remain complete.
7. Configure the provider to parse the application's JSON message and index
   `level`, `event`, `route`, `requestId`, `component`, `operation`, and, for
   slow queries, `queryFingerprint`, `durationMs`, and `outcome`.
8. Create alerts at minimum for any `startup.configuration_failed`, elevated
   `request.unhandled` / `request.failed`, database health/schema failures,
   and repeated `database.slow_query` fingerprints. Tune counts/windows from
   observed baseline traffic rather than inventing an SLO in this document.
9. Verify end-to-end delivery in a non-production dataset or deployment first:
   locate the same request ID in Vercel and the provider, trigger the alert
   through the provider's test mechanism, and confirm that the intended owner
   channel receives it. Do not intentionally mutate production data merely to
   generate a test error.

Until those steps are complete, logs exist in Vercel but external retention,
search, and alerting are not live. If a dedicated error-tracking product is
chosen later, it requires a separate privacy/consent and source-map review,
an owner-managed account/DSN, and an explicit SDK/integration change; no such
SDK or DSN is included here.

## Configure uptime alerting (owner action)

Use an external uptime provider; the application cannot reliably alert on its
own total outage from inside the same deployment.

Suggested monitors:

1. `GET https://www.theyaar.com/api/health`
   - No `Authorization` header for the public check.
   - Expect HTTP 200 and a JSON body containing `"ok":true` and
     `"status":"ok"`.
   - Use a short timeout (for example 10 seconds), check every 1–5 minutes,
     and alert after 2–3 consecutive failures from the provider.
   - A database/schema failure returns HTTP 503 with `"status":"degraded"`.
2. `GET https://www.theyaar.com/`
   - Expect HTTP 200. This catches a broken document deployment that a health
     API check alone could miss.

Do not put `HEALTH_DIAGNOSTIC_TOKEN` in a monitor URL. Detailed diagnostics are
not needed for uptime. If a separate authenticated diagnostic check is ever
required, store the bearer credential only in the monitoring provider's secret
mechanism and ensure its logs do not echo request headers.

Configure and test the provider's owner notification channel, escalation, and
recovery notification. As with drains, the monitor is not active until the
owner has completed and verified that provider setup.

## Incident workflow

1. Record the UTC time, route, deployment, and `x-request-id` response header.
2. Search logs for the request ID, then widen to the `event`, `route`,
   `component`, and sanitized error code/constraint.
3. For `database.slow_query`, group by `queryFingerprint` and compare duration
   and row count. Do not try to recover or guess omitted parameter values.
4. For health failures, use the authenticated health diagnostics described in
   `docs/DEPLOY_PUBLIC.md`; keep diagnostic credentials out of URLs and tickets.
5. Preserve only the sanitized log record in an incident report. Add customer
   content, emails, tokens, SQL parameters, or database details only through an
   approved private support process, never by expanding application logs.
