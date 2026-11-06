// Server-side composition only. There is intentionally no HTTP route or UI.
// Never pass request-supplied dependencies, pool settings, or actor flags.
import { verifyPreviewIdentity } from './admin-preview-verified-identity.mjs';
import { createPreviewRecoveryPool, previewRecoverySettings } from './admin-preview-recovery-config.mjs';
import { createRecoveryStore } from './admin-recovery-store.mjs';
import { generateRecoveryCodes } from './admin-recovery-core.mjs';

// Exported for dependency-isolated tests; production callers must use the
// fixed composition below and must not allow callers to choose dependencies.
export function createRecoveryGenerationService({ verify, makeStore, pepper }) {
  return {
    async generate(token) {
      const claims = await verify(token);
      if (claims.aal !== 'aal2') throw new Error('Not authorized');
      const actor = { verified: true, userId: claims.sub, aal2: true };
      const store = makeStore(claims);
      // The store rechecks active profile, AAL2, registered session, live
      // verified TOTP and recent TOTP AMR under its user-scoped transaction.
      return generateRecoveryCodes(store, actor, pepper);
    }
  };
}

export function createPreviewRecoveryGenerationService(env) {
  const { database, pepper } = previewRecoverySettings(env);
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (typeof key !== 'string' || !key.trim()) throw new Error('Recovery is not configured');
  const pool = createPreviewRecoveryPool(database);
  const service = createRecoveryGenerationService({
    verify: token => verifyPreviewIdentity(token, key),
    makeStore: claims => createRecoveryStore(pool, claims),
    pepper
  });
  return { generate: service.generate, close: () => pool.end() };
}
