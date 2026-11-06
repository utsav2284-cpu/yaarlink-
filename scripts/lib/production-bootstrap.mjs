// Production-only operator guard. No caller-controlled project or recipient.
// Uses the same audited, hash-only invitation transaction as Preview; it must
// not run until the admin schema has been installed and verified in Production.
import { provision, validateInput } from './preview-bootstrap.mjs';
export const PRODUCTION_REF = 'dqhxgwzjwzvpqiilteld';
export const AUTHORIZED_OWNER = 'utsavkumar20518@gmail.com';
// Confirmed from the Production project's Connect > Session pooler parameters.
const PRODUCTION_SESSION_POOLER = 'aws-0-ap-northeast-2.pooler.supabase.com';

export function validateProductionConnection(connectionString) {
  let u;
  try { u = new URL(connectionString); } catch { throw new Error('Production operator connection is not configured'); }
  const direct = u.hostname === `db.${PRODUCTION_REF}.supabase.co` && u.username === 'postgres';
  const sessionPooler = u.hostname === PRODUCTION_SESSION_POOLER && u.username === `postgres.${PRODUCTION_REF}`;
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || (!direct && !sessionPooler) || (u.port && u.port !== '5432') || u.pathname !== '/postgres' || !u.password || u.search || u.hash) {
    throw new Error('Only a pinned TLS-verified Production direct or session-pooler connection is allowed');
  }
  return { host:u.hostname, port:5432, database:'postgres', user:u.username, password:decodeURIComponent(u.password), ssl:{rejectUnauthorized:true}, connectionTimeoutMillis:10000 };
}

export function productionOwnerInput(reference, tokenFile, dryRun, publicKeyFile, fingerprint) {
  return validateInput(AUTHORIZED_OWNER, reference, tokenFile, dryRun, publicKeyFile, fingerprint);
}

export async function provisionProductionOwner(client, input, deps) {
  if (!input || input.email !== AUTHORIZED_OWNER || typeof input.dryRun !== 'boolean') throw new Error('Unauthorized owner recipient');
  const validated = productionOwnerInput(input.reference, input.tokenFile, input.dryRun, input.publicKeyFile, input.expectedFingerprint);
  return provision(client, validated, deps);
}
