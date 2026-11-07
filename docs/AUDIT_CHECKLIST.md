# YaarLink Audit Checklist

Branch `arena/8767a4dd-yaarlink` · HEAD at time of writing: see `git log -1`.
Local harness: `next dev` :3000, `next start` (production build) :3100,
PGlite over the Postgres wire protocol :55432, mail/HIBP stub :4025,
read-only DB inspector + seeding endpoints :4026.

## Verified PASS

### Security
- [x] Security headers (CSP nonce, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy)
- [x] Production CSP hardened (`unsafe-eval` and `ws:` are dev-gated only)
- [x] `Reporting-Endpoints` present; CSP report-to resolves
- [x] Session cookie `__Host-` prefix, HttpOnly, Secure, SameSite=Lax
- [x] Session tampering rejected (HMAC); empty/garbage cookie → 401
- [x] No user enumeration on login (identical 401 body)
- [x] Login lockout at 5 failures; key hashed (SHA-256), no email stored
- [x] Forgot-password identical 202 for known/unknown
- [x] Password reset single-use; old sessions revoked (`token_version` bump)
- [x] Email change password-gated; account delete password-gated
- [x] Privilege escalation blocked (`super_admin` rejected)
- [x] CSRF Origin check → 403 `forbidden_origin`
- [x] Open redirect: 17/17 probes pass (`tests/return-to.test.mjs`)
- [x] SQL injection: 349 parameterized queries, 0 string interpolation
- [x] XSS: single nonce'd static inline script, no `dangerouslySetInnerHTML` of user data
- [x] Cross-brand IDOR blocked (PATCH/DELETE → 404, no existence leak)
- [x] Application/notification/export IDOR probes → 400/404, no data
- [x] GDPR export strips tokens/hashes; includes `excludedForSecurity`
- [x] Dependency audit: 0 vulnerabilities
- [x] Health endpoint leaks no version/host/stack

### Passwords (FIXED)
- [x] Min length raised 6 → 10 (verified over HTTP: 9 chars 400, 10 chars 202)
- [x] PBKDF2 100k → 600k, with iteration-aware rehash (verified 100000→600000 on login)
- [x] Timing equalization preserved (94.9 ms known vs 102.6 ms unknown)

### Request handling (FIXED)
- [x] 64 KiB JSON body cap → 413 `payload_too_large` (was: unbounded / silently truncated at 10 MB)

### Frontend / responsive (FIXED)
- [x] Admin JSON preview overflow at 320px (~115px) → `overflowWrap:anywhere`
- [x] Admin record rows → `flexWrap` + `minWidth:0`
- [x] Admin touch targets → 44px minimum
- [x] Admin per-row accessible names; mobile nav/padding/heading tightened

### Error handling (FIXED)
- [x] Branded `app/error.tsx` + `app/global-error.tsx` (was: unstyled Next default)
- [x] 3 new strings in en/hi/pa; parity 1023/1023/1023

### SEO / sitemap (TASK 1 — PASS)
- [x] 12 static URLs, 0 duplicates, all canonical HTTPS, ISO-8601 lastmod
- [x] Campaigns need `open` + `verified` + unexpired; creators need `approved` + `verified` + category
- [x] Pending/unverified campaign absent from sitemap (verified both directions)
- [x] DB down → 12 static routes kept, dynamic omitted, nothing guessed
- [x] robots.txt canonical, disallows private areas

### Campaign detail (TASK 2 — PASS)
- [x] Pending/unverified → 404 to public (no draft leakage)
- [x] Invalid UUID / nonexistent / SQL-injection-shaped ID → 404
- [x] Verified → 200 with correct canonical, description, og:title
- [x] Appears in sitemap + `/api/campaigns` + `/campaigns` after verification

### Creator discovery (TASK 3 — PASS)
- [x] Search across 10 fields, case-insensitive; empty results clean
- [x] Filters: category, platform, language, contentType all precise
- [x] All 7 sorts work; invalid sort → 400 `invalid_sort`
- [x] Invalid cursor → 400 `invalid_cursor`; limit=1 cursor shape correct
- [x] Zero private fields in payload (email/phone/user_id/hashes absent)
- [x] DB down → pages 200, API sanitized 500, health 503 `degraded`

### Database
- [x] 16 tables, all have PKs
- [x] Only 2 unindexed FKs (`notifications.application_id`, `campaign_id`), both informational
- [x] Composite indexes match query shapes (public listing/queue)
- [x] RLS on all `admin.*` tables; no `anon` grants on `public` data tables
- [x] App connects via Drizzle as privileged role (documented architecture)
- [x] Slow-query fingerprinting with clamped thresholds
- [x] CHECK constraints extensive (email format, token hash format, count bounds)

### i18n / a11y
- [x] 1023 keys × 3 languages, 0 missing/extra
- [x] Only 7 untranslatable values identical to English (brands, placeholders)
- [x] `lang="en-IN"`, `dir="ltr"`, skip link, single h1, landmarks, 0 images without alt
- [x] Self-hosted fonts with `display: swap`

### Performance (measured, production build)
- [x] TTFB 17–38 ms (home 143 ms cold); all pages
- [x] Client JS 91.6 KB gzip for homepage
- [x] HTML 92–116 KB (locale strings inlined by RSC; inherent to design)

### Business flows
- [x] Brand signup → verify → login (synthetic)
- [x] Campaign create 201 (gated `pending`), idempotent replay 200 same ID, 1 row
- [x] PATCH stale → 409 `campaign_changed`; correct → 200 in place
- [x] Creator signup → verify → login; incomplete profile blocks applications (409)
- [x] 17 internal links, 0 broken; 404s correct

### Admin surface (re-verified on current build)
- [x] Unauthenticated `/admin`, `/admin/login`, `/admin/setup`, `/admin/mfa`,
      `/admin/diagnostics`, `/admin/reset-password`, `/admin-preview` all render
      the public shell + "Checking secure session (AAL2 required)…" and then gate
- [x] Zero marketplace data in unauthenticated `/admin` HTML (no names, titles,
      display_name, verification_status, or table markup)
- [x] `/admin` was crawlable → FIXED (see below)

### SEO hardening (FIXED)
- [x] robots.txt disallows `/admin`, `/admin/`, `/admin-preview`
- [x] `/admin/*` and `/admin-preview` emit `noindex, nofollow, nocache`
- [x] Public pages still `index, follow`; `/login`, `/signup` keep `noindex`

### Accessibility (verified, no change needed)
- [x] Global unlayered `:focus-visible` rule with 3px outline + double inset
      shadow, deliberately unlayered so `outline-none` cannot remove it;
      confirmed present in the shipped CSS
- [x] 12 controls use bare `outline-none` → still get the global ring (not a bug)
- [x] Escape key closes menus; backdrop div is `aria-hidden` (mouse-only)
- [x] Skip-to-content link present

### API edge cases
- [x] Any `Content-Type` (or none) → clean 400, never 500
- [x] Malformed JSON, `[]`, `null`, `"str"` → 400 `invalid_request`
- [x] NoSQL-injection shape `{"$ne":null}` → treated as invalid string, 400
- [x] 8 parallel same-email signups → exactly 1 row; 5×202 idempotent, 3×429
- [x] Idempotency key replay returns same campaign, 1 row

## Known limitations (not fixable in repo)
- TRACE → 500 with server-side stack log. Thrown inside Next's request
  constructor before middleware; proxy guard was attempted and reverted as
  unreachable. Not exploitable (no echo body); noisy log only.
- No browser available: visual/responsive verification is source + CSS
  inspection, not pixel rendering. Marked BLOCKED for visual confirmation.

## Audit complete
- [x] Admin route auth-gate re-verification on current build
- [x] Keyboard/focus-order inspection on key flows
- [x] Final full suite + build + commit
