// Server-only primitives. Not a route and not wired to any client: callers must
// verify the Auth JWT, use a transaction with a per-user lock and implement all
// store methods atomically before exposing this service.
import { randomBytes, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ROUNDS = 12, WINDOW_MS = 15 * 60_000, MAX_FAILURES = 5, LIFETIME_MS = 90 * 86_400_000;
const DUMMY_HASH = '$2b$12$7Ds9GTmtscz6o3kQMoGDh.5ovxJZCaWPvaEvZDCMKhf5dzYw1lpRe';
function peppered(code, pepper) {
  if (!Buffer.isBuffer(pepper) || pepper.length < 32) throw new Error('Recovery is not configured');
  return createHmac('sha256', pepper).update(code, 'utf8').digest('base64');
}
export function normalizeRecoveryCode(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const normalized = raw.trim().toUpperCase();
  return /^(0[1-8])-[0-9A-F]{32}$/.test(normalized) ? normalized : null;
}
function authorize(actor, requireMfa) {
  // These identity fields must come from a verified server-side JWT boundary.
  // Live profile, TOTP, session and freshness are checked by the store inside
  // the transaction, never inferred from client-provided booleans.
  if (!actor?.verified || !actor.userId) throw new Error('Not authorized');
  if (requireMfa && !actor.aal2) throw new Error('Not authorized');
}

// store.transaction(userId, fn) MUST serialize the user across workers and
// commit returned failure outcomes as well as successes. It must roll back on
// exceptions; the methods below must never log arguments or code hashes.
export async function generateRecoveryCodes(store, actor, pepper, now = Date.now()) {
  authorize(actor, true); peppered('configuration-check', pepper);
  return store.transaction(actor.userId, async tx => {
    if (!await tx.authorizeGeneration() || await tx.recoveryPending()) return { status: 'denied' };
    const codes = [];
    const rows = [];
    for (let index = 1; index <= 8; index++) {
      const code = `${String(index).padStart(2, '0')}-${randomBytes(16).toString('hex').toUpperCase()}`;
      codes.push(code);
      rows.push({ index, hash: await bcrypt.hash(peppered(code, pepper), ROUNDS), expiresAt: now + LIFETIME_MS });
    }
    // Hashing can take time. Recheck live state before making any change.
    if (!await tx.authorizeGeneration() || await tx.recoveryPending()) return { status: 'denied' };
    await tx.invalidateAll();
    await tx.insertCodes(rows);
    await tx.event('recovery_codes_regenerated');
    return { status: 'generated', codes };
  });
}

export async function redeemRecoveryCode(store, actor, rawCode, pepper, now = Date.now()) {
  authorize(actor, false); peppered('configuration-check', pepper);
  return store.transaction(actor.userId, async tx => {
    if (!await tx.authorizeRedemption() || await tx.recoveryPending()) return { status: 'denied' };
    if (await tx.countFailuresSince(now - WINDOW_MS) >= MAX_FAILURES) { await tx.event('recovery_rate_limited'); return { status: 'rate_limited' }; }
    const code = normalizeRecoveryCode(rawCode);
    const index = code ? Number(code.slice(0, 2)) : 0;
    const row = index ? await tx.getCode(index) : null;
    // Always run a comparable-cost check for malformed, absent, expired and used codes.
    const matches = await bcrypt.compare(peppered(code ?? 'invalid', pepper), row?.hash ?? DUMMY_HASH);
    const valid = !!(row && row.usedAt == null && row.invalidatedAt == null && row.expiresAt > now && matches);
    if (!valid) { await tx.failure(now); await tx.event('recovery_code_failed'); return { status: 'denied' }; }
    if (!await tx.consume(row.id, now)) { await tx.failure(now); await tx.event('recovery_code_failed'); return { status: 'denied' }; }
    // Must atomically mark assisted recovery pending AND revoke all registered
    // sessions. This does not revoke already-issued Auth JWTs by itself; all
    // privileged paths and session registration must also enforce this state.
    await tx.requireAssistedRecovery(now);
    await tx.invalidateAll();
    await tx.revokeSessions(now);
    await tx.event('recovery_code_used');
    return { status: 'assistance_required' };
  });
}
