# Direct first-owner: Windows local test preparation (not ready)

This describes an **isolated local Supabase**, not a third hosted project. It does not modify hosted Preview or Production. The local target and experimental Google start/callback/password UI are implemented but not integrated end-to-end: Preview migration history includes record-only files with missing SQL, and direct claim and recovery are unfinished. **Do not configure Google credentials yet**; the instructions below are preparatory until the integration is ready. Do not apply candidate SQL to hosted projects. Never link this scratch directory to a hosted project or copy real users, credentials, or data into it.

## 1. Docker Desktop on Windows

We cannot inspect your actual computer from this sandbox. On your own Windows machine:

1. Check the current [Docker Desktop Windows requirements and installer](https://docs.docker.com/desktop/setup/install/windows-install/), including supported Windows version, virtualization enabled in BIOS/UEFI, and WSL 2. The Docker page currently specifies at least 8 GB RAM and WSL 2.1.5 for the x86-64 WSL backend; also check Docker's licensing terms. Check your architecture under Windows Settings → System → About and download the appropriate installer from the official page.
2. In **PowerShell as Administrator**, run `wsl --install` if WSL is not installed, then restart Windows when requested. Run `wsl --update` and `wsl --version` (if required, complete Microsoft’s WSL setup). Resolve any virtualization or Windows-version errors using Docker/Microsoft's instructions.
3. Install Docker Desktop, select the WSL 2 backend when prompted, open Docker Desktop and wait for it to report that the engine is running. Use Linux containers. In a new normal PowerShell window, run `docker version`; both Client and Server sections should appear. Do not publish local Supabase ports to the internet.
4. Install Node.js 22 and npm 10 or newer from the official Node.js installer, then verify `node --version` and `npm --version` in a new PowerShell window. Git is needed to obtain the repository.

## 2. Prepare an independent scratch stack

From a PowerShell window at the **repository root** on your machine, with this branch checked out, copy the local template out of the repository and work from that new directory:

```powershell
$Scratch = Join-Path $env:USERPROFILE 'yaarlink-synthetic-supabase'
if (Test-Path $Scratch) { throw 'Scratch directory already exists; inspect it instead of overwriting or resetting it.' }
New-Item -ItemType Directory -Path $Scratch | Out-Null
Copy-Item -Recurse 'test-infra/local-supabase/supabase' $Scratch
Set-Location $Scratch
```

The supplied `supabase/config.toml` uses CLI 3.0.0, project ID `yaarlink-synthetic-local`, API port **54321**, DB port **54322**, and Studio port **54323**. It deliberately contains **no migrations**: it is a local Auth test bed, not a complete reconstruction of the existing Preview database. If these ports are occupied, stop and resolve the conflict; don't silently change them, since the exact Google callback below would change. Avoid `supabase link`, `db push`, `db reset`, or commands targeting either hosted project. The local test config enables signup only in the isolated sandbox for OAuth experiments; it is not safe as a hosted signup policy.

Complete the Google steps below first. In the same PowerShell window set the values privately, without screenshots or chat. `Read-Host -AsSecureString` hides the secret while entering it, but it is subsequently held in this process environment for the CLI; do not enable shell transcript/logging. Use a dedicated test OAuth client, never a Production one.

```powershell
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID = Read-Host 'Local test Google client ID'
$secure = Read-Host 'Local test Google client secret (hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
npx --yes supabase@3.0.0 start --workdir $Scratch
```

The first start downloads Docker images. CLI output includes local database credentials and keys: **do not paste it into chat**. Confirm only that the local API is `http://127.0.0.1:54321`, Studio is `http://127.0.0.1:54323`, and the DB is on `127.0.0.1:54322`. Local keys and DB passwords are still secrets. To stop without deleting data, from the scratch directory run `npx --yes supabase@3.0.0 stop --workdir $Scratch`; do not add `--no-backup`. Afterwards remove the two environment variables from the terminal (`Remove-Item Env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID, Env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`) and close the terminal. Re-enter them privately before a subsequent start. Startup has **not been verified in this sandbox** because no Docker engine is available here.

## 3. Separate Google OAuth test client

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), use a suitable Google Cloud project and configure Branding and Audience. A Google Cloud project is distinct from a Supabase project. Use a dedicated test Google account, not the intended real owner; if the audience is External and testing, add that account as a test user. Do not send credentials in chat.
2. In Data Access configure only `openid`, `.../auth/userinfo.email`, and `.../auth/userinfo.profile` as needed. In Clients create a **Web application** OAuth client used only for this local test.
3. Set the exact Google **Authorized JavaScript origin** to `http://127.0.0.1:3000` and the exact Google **Authorized redirect URI** to `http://127.0.0.1:54321/auth/v1/callback`. The second URL is Supabase Auth's callback to Google—not the application callback. Do not use wildcards. If Google Console rejects a loopback origin, consult its current instructions; do not substitute another origin without updating and revalidating the entire local flow.
4. When integration is ready, enter the test client ID and client secret privately as in step 2 above. The local Supabase **Site URL** is `http://127.0.0.1:3000`; the exact local direct setup callback is `http://127.0.0.1:3000/admin/setup/direct/callback` (the existing invitation callback is also allowed separately). The application callback and Google URI are different and configured in different systems. These are local URLs only; no hosted callback is approved or implied. The template keeps Google nonce checking on and TOTP enrollment/verification enabled.
5. The opt-in local target requires development mode, the exact local browser origin, and `NEXT_PUBLIC_YAARLINK_LOCAL_ADMIN=true`, with the local publishable key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The CSP exception is restricted to the local development request. It has only unit-test coverage, not genuine OAuth or browser integration; do not change hosted pinning or CSP to bypass it.

Reference: [Supabase Google OAuth local development](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

## 4. Remaining implementation and integration work

- Recover the complete actual Preview schema SQL from authoritative migration records, including record-only files, without applying any hosted changes; build a deterministic scratch baseline and verify constraints, triggers, ACLs, security-definer owners and exposed PostgREST schemas. A read-only inspection found all 19 Preview migration records contain SQL statements; they have not yet been extracted and sanitized/replayed locally. Read-only inspection of the relevant Preview constraints confirms the profile and operation invitation references are nullable and the operation actor FK references `auth.users`; one non-internal trigger was listed on the six claim-related admin tables (the recovery-session update guard). This is partial compatibility evidence, not a complete schema audit or claim test. The existing synthetic PGlite test replays a production-derived baseline, **not** the full live Preview schema.
- Integrate and independently review `supabase/candidates/preview_direct_google_owner.sql` against that baseline; validate the live Auth session/factor schema, old claim grants, atomic rollback and actual concurrent transactions. Prepare a hosted migration only after these checks; do not run it without explicit approval.
- A default-deny pre-creation hook candidate and local-only OAuth initiation, callback/PKCE and password form are implemented but unverified against real Auth. The hook would currently block future invites and is intentionally not enabled. Integrate and test the full signup policy, TOTP and final claim UI without leaving public signup open or breaking future invitations. Future login must remain password + MFA, not Google.
- Complete setup-time recovery generation/display and persistent, throttled, single-use redemption. Recovery must not grant AAL2 or bypass a fresh verified TOTP. Design and verify safe recovery completion and revocation, including races, crashes and multiple sessions. Existing recovery primitives are not wired or usable end-to-end.
- Finish secure operator provisioning for actual authorized Google test identity and eventual Preview. `scripts/provision-local-direct-owner.mjs` is currently restricted to `example.invalid` addresses, loopback DB and an explicit scratch-only marker. It encrypts the token to an independently fingerprint-verified RSA public key and stores only its hash, but **cannot provision a real Google test identity or a hosted owner**. The local guard and candidate SQL are not migrations and must never be installed on hosted databases as-is.
- Complete and verify the new strictly local-only app target/test harness without loosening hosted project pinning, CSP, or routing hosted browsers to localhost. Prepare and execute the test matrix below against the actual local Auth and Postgres services; only when ready obtain interactive Google consent using the dedicated test account. Review all admin RBAC, granular permissions, passkeys, audit, password/MFA and session revocation under the real stack.

## 5. Genuine end-to-end acceptance matrix (all currently NOT TESTED)

Run with synthetic data in the isolated local stack, recording pass/fail without logging passwords, OTPs, recovery codes, tokens, private keys or raw JWTs:

1. Google OAuth through real Google and local Supabase Auth: correct provider, confirmed matching email, callback/PKCE, denial/cancel, wrong account and no public unauthorized ownership.
2. Personal password selection; fresh password login on a new browser session with no mandatory Google. Reject missing password and unconfirmed/mismatched identity.
3. Enroll and verify TOTP; require verified live factor, AAL2, fresh challenge and live session for claim and privileged RPCs. Test AAL1, stale challenge, missing/revoked factor and revoked session failures.
4. Show recovery codes exactly once, store only protected hashes, prove each code succeeds once and replay fails, verify throttling and concurrent redemption, verify no recovery code grants AAL2 or privileged access, and complete the supported recovery process.
5. Race two independently connected claim attempts and assert exactly one owner, one consumed authorization, permanent lock, no partial state on forced error, and audit record. Verify unauthorized, expired and duplicate attempts cannot claim.
6. Verify later password-plus-TOTP login, granular RBAC and session registration/revocation, with no automatic suspension; test expiry and multiple sessions. Verify passkeys and audit tamper detection separately rather than asserting immutability.

## 6. Hosted Preview readiness checklist (do not execute yet)

- [ ] All implementation items and genuine local tests above pass; security review approves the design, recovery threat model, bootstrap and access control.
- [ ] User explicitly approves the exact Preview-only migration, controlled setup authorization provisioning, Preview Auth/Google settings and deployment; identify the exact Preview project before and after each action. No Production or other hosted project changes.
- [ ] Configure a separate Preview Google OAuth client and exact approved hosted callbacks only after the deployment URL is known and approved; do not guess or reuse the local callback.
- [ ] Verify Preview schema and least-privilege grants before and after an approved migration; ensure no real owner claim is made as part of testing.
- [ ] Deploy the approved Preview revision, verify its protected exact URL and callback, and perform only explicitly approved non-destructive checks. Do not claim the real owner slot without separate approval.
- [ ] Arrange independent verification of the owner's encryption public-key fingerprint and a secure offline token delivery channel. Never paste passwords, secrets, codes, or token material into chat. SMTP and invitations remain deferred.
