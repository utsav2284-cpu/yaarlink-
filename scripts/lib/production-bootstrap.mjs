// Production-only operator guard. No caller-controlled project or recipient.
// Uses the same audited, hash-only invitation transaction as Preview; it must
// not run until the admin schema has been installed and verified in Production.
import { provision, validateInput } from './preview-bootstrap.mjs';
export const PRODUCTION_REF = 'dqhxgwzjwzvpqiilteld';
export const AUTHORIZED_OWNER = 'utsavkumar20518@gmail.com';
// Confirmed from the Production project's Connect > Session pooler parameters.
// Supabase runs per-region pooler fleets (aws-0, aws-1, ...). The project can be
// moved between them, so every fleet hostname is pinned by this exact pattern
// rather than a single hardcoded name; the project ref is still fixed in the
// username, so no other tenant's database can be addressed.
const PRODUCTION_SESSION_POOLER = /^aws-\d+-(?:ap|us|eu|sa|ca|me|af)-[a-z]+-\d+\.pooler\.supabase\.com$/;

// Supabase's dashboard "Connect" dialog offers URIs that already carry
// `?sslmode=require`. Those parameters are never honoured here: TLS is enforced
// by the returned ssl config, so the only thing a literal `?sslmode=require`
// would do is fail validation and send the operator chasing a wrong error.
// Any parameter that could weaken or redirect the connection still rejects.
const SAFE_SSL_PARAMS = new Set(['sslmode']);
const SAFE_SSLMODE_VALUES = new Set(['require', 'verify-ca', 'verify-full']);

function assertOnlySafeSearchParams(u) {
  if (!u.search) return;
  for (const [name, value] of u.searchParams) {
    if (!SAFE_SSL_PARAMS.has(name)) throw new Error('Only a pinned TLS-verified Production direct or session-pooler connection is allowed');
    if (!SAFE_SSLMODE_VALUES.has(String(value).toLowerCase())) throw new Error('Only a pinned TLS-verified Production direct or session-pooler connection is allowed');
  }
}

export function validateProductionConnection(connectionString) {
  let u;
  try { u = new URL(connectionString); } catch { throw new Error('Production operator connection is not configured'); }
  const direct = u.hostname === `db.${PRODUCTION_REF}.supabase.co` && u.username === 'postgres';
  const sessionPooler = PRODUCTION_SESSION_POOLER.test(u.hostname) && u.username === `postgres.${PRODUCTION_REF}`;
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || (!direct && !sessionPooler) || (u.port && u.port !== '5432') || u.pathname !== '/postgres' || !u.password || u.hash) {
    throw new Error('Only a pinned TLS-verified Production direct or session-pooler connection is allowed');
  }
  assertOnlySafeSearchParams(u);
  return { host:u.hostname, port:5432, database:'postgres', user:u.username, password:decodeURIComponent(u.password), ssl:{rejectUnauthorized:true}, connectionTimeoutMillis:10000 };
}

export function productionOwnerInput(reference, tokenFile, dryRun, publicKeyFile, fingerprint) {
  return validateInput(AUTHORIZED_OWNER, reference, tokenFile, dryRun, publicKeyFile, fingerprint);
}

export async function provisionProductionOwner(client, input, deps) {
  if (!input || input.email !== AUTHORIZED_OWNER || typeof input.dryRun !== 'boolean') throw new Error('Unauthorized owner recipient');
  const validated = productionOwnerInput(input.reference, input.tokenFile, input.dryRun, input.publicKeyFile, input.expectedFingerprint);
  // Only an explicit, reviewed opt-in may retire an expired invitation. The
  // default stays fail-closed so an abandoned invitation is never silently
  // replaced.
  return provision(client, { ...validated, retireExpired: input.retireExpired === true }, deps);
}
