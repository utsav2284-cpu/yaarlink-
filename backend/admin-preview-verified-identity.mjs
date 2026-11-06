// Server-only groundwork: no route imports this module yet. Auth verification is
// always sent to the dedicated Preview project, never to a caller-supplied URL.
import { createClient } from '@supabase/supabase-js';

const PREVIEW = 'https://qwngmsedyepghskoagaj.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied = () => new Error('Not authorized');

// The injected verifier is a server-side dependency, not request data. In
// production use verifyPreviewIdentity(), which fixes the service and verifier.
export async function verifyIdentityWithAuth(token, getUser, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw denied();
  let user;
  try {
    const result = await getUser(token);
    if (result.error || !result.data?.user) throw denied();
    user = result.data.user;
  } catch { throw denied(); }
  let payload;
  try { payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { throw denied(); }
  // Decoding is not verification: this happens only after the exact token was
  // accepted by Preview Auth's getUser endpoint, and is bound to that response.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      payload.iss !== `${PREVIEW}/auth/v1` || payload.aud !== 'authenticated' ||
      payload.role !== 'authenticated' || !UUID.test(payload.sub ?? '') ||
      user.id !== payload.sub || !UUID.test(payload.session_id ?? '') ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(now / 1000) ||
      !Number.isSafeInteger(payload.iat) || payload.iat > Math.floor(now / 1000) + 60 ||
      !['aal1', 'aal2'].includes(payload.aal)) throw denied();
  // Pass only claims used by the DB predicates, not arbitrary metadata.
  return Object.freeze({ sub: payload.sub, session_id: payload.session_id, aal: payload.aal });
}

export async function verifyPreviewIdentity(token, publishableKey) {
  if (typeof publishableKey !== 'string' || !publishableKey.trim()) throw new Error('Recovery is not configured');
  const client = createClient(PREVIEW, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return verifyIdentityWithAuth(token, jwt => client.auth.getUser(jwt));
}
