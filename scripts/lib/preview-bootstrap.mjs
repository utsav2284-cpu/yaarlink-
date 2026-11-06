import { randomBytes, createHash, createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { open, unlink, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export const PREVIEW_REF = 'qwngmsedyepghskoagaj';
export function validatePreviewConnection(connectionString) {
  const u = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || u.hostname !== `db.${PREVIEW_REF}.supabase.co` || (u.port && u.port !== '5432') || u.pathname !== '/postgres' || u.username !== 'postgres' || !u.password || u.search || u.hash) throw new Error('Only a direct TLS-verified Preview postgres operator connection is allowed.');
  return { host: u.hostname, port: 5432, database: 'postgres', user: 'postgres', password: decodeURIComponent(u.password), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 };
}
export function validateInput(email, reference, tokenFile, dryRun, publicKeyFile, expectedFingerprint) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid invitation email is required.');
  if (typeof reference !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(reference)) throw new Error('Use a non-secret operator authorization reference.');
  if (!dryRun && (!tokenFile || !isAbsolute(tokenFile) || !publicKeyFile || !isAbsolute(publicKeyFile))) throw new Error('Absolute output and recipient public-key paths are required.');
  if (!dryRun && !/^[0-9a-f]{64}$/.test(expectedFingerprint ?? '')) throw new Error('A verified public-key SHA-256 fingerprint is required.');
  return { email: email.trim().toLowerCase(), reference, tokenFile, publicKeyFile, expectedFingerprint, dryRun };
}

// The caller must supply a connection whose direct project hostname and TLS have
// been validated. No token or hash is printed, returned, or sent to Auth.
export async function provision(client, input, { writeToken = writeTokenFile, removeToken = unlink } = {}) {
  let fileCreated = false;
  let commitAttempted = false;
  await client.query('begin');
  try {
    const identity = await client.query("select current_user as role, current_database() as db, coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) as tls");
    if (identity.rows[0]?.role !== 'postgres' || identity.rows[0]?.db !== 'postgres' || identity.rows[0]?.tls !== true) throw new Error('Trusted Preview operator connection required.');
    const state = await client.query('select owner_claimed_at from admin.admin_bootstrap_state where id=true for update');
    if (state.rows.length !== 1 || state.rows[0].owner_claimed_at !== null) throw new Error('Bootstrap is unavailable or already claimed.');
    const pending = await client.query("select exists(select 1 from admin.admin_invitations where invitation_kind='bootstrap' and status='pending') as exists");
    if (pending.rows[0]?.exists) throw new Error('A pending bootstrap invitation already exists; operator review is required, even if expired.');
    if (input.dryRun) { await client.query('rollback'); return { dryRun: true }; }
    const token = randomBytes(32);
    const hash = createHash('sha256').update(token).digest();
    await writeToken(input.tokenFile, token.toString('hex'), input.publicKeyFile, input.expectedFingerprint);
    fileCreated = true;
    const created = await client.query("insert into admin.admin_invitations(email, invitation_kind, invited_by, operator_authorization_ref, intended_role_key, expires_at, token_hash) values ($1,'bootstrap',null,$2,'super_admin',now()+interval '24 hours',$3) returning id", [input.email, input.reference, hash]);
    await client.query("select audit.append_audit(null, 'bootstrap.invitation_created', 'admin_invitation', $1, 'success', '{}'::jsonb)", [String(created.rows[0].id)]);
    // Once COMMIT is sent, a network failure cannot prove whether it committed.
    // Preserve the ciphertext for operator reconciliation instead of losing it.
    commitAttempted = true;
    await client.query('commit');
    return { dryRun: false };
  } catch (err) {
    await client.query('rollback').catch(() => {});
    if (fileCreated && !commitAttempted) await removeToken(input.tokenFile).catch(() => {});
    throw err;
  }
}
export async function writeTokenFile(path, token, publicKeyFile, expectedFingerprint) {
  const pem = await readFile(publicKeyFile, 'utf8');
  if (!/^-----BEGIN (?:RSA )?PUBLIC KEY-----/.test(pem)) throw new Error('A recipient public key is required.');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('A sufficiently strong RSA public key is required.');
  const fingerprint = createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expectedFingerprint ?? '') || fingerprint !== expectedFingerprint) throw new Error('Recipient public key fingerprint mismatch.');
  const ciphertext = publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(token, 'utf8'));
  const f = await open(path, 'wx', 0o600);
  try { await f.writeFile(ciphertext); await f.sync(); await f.close(); } catch (error) { await f.close().catch(() => {}); await unlink(path).catch(() => {}); throw error; }
}
