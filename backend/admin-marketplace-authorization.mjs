// Server-only authorization primitive for a future marketplace adapter.
// Authorization is checked against the dedicated admin identity project; it
// does not connect to, or grant access to, the marketplace database.
import { createClient } from '@supabase/supabase-js';
import { verifyPreviewIdentity } from './admin-preview-verified-identity.mjs';

const ADMIN_PROJECT = 'https://qwngmsedyepghskoagaj.supabase.co';
const PERMISSIONS = new Set(['creators.review', 'creators.approve', 'campaigns.review', 'campaigns.publish']);
const denied = () => new Error('Not authorized');

// Injectable dependencies enable synthetic tests; request data never supplies them.
export async function authorizeMarketplaceWith(token, permission, verifyIdentity, checkPermission) {
  if (!PERMISSIONS.has(permission)) throw denied();
  let identity;
  try {
    identity = await verifyIdentity(token);
    if (identity?.aal !== 'aal2' || typeof identity.sub !== 'string' || typeof identity.session_id !== 'string') throw denied();
    // No permission is cached: the RPC checks the current registry session,
    // verified live TOTP factor, active profile and the precise assigned role.
    if (await checkPermission(token, permission) !== true) throw denied();
  } catch { throw denied(); }
  return Object.freeze({ sub: identity.sub, session_id: identity.session_id });
}

export async function authorizeMarketplace(token, permission, publishableKey) {
  if (typeof publishableKey !== 'string' || !publishableKey.trim()) throw denied();
  return authorizeMarketplaceWith(token, permission,
    value => verifyPreviewIdentity(value, publishableKey),
    async (value, key) => {
      const client = createClient(ADMIN_PROJECT, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${value}` } },
      });
      const result = await client.schema('admin').rpc('has_permission', { p_key: key });
      return !result.error && result.data === true;
    });
}
