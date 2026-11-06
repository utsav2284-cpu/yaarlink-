// LOCAL SYNTHETIC TESTING ONLY. Never accepts a remote host or a real email.
import { randomBytes, createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { unlink } from 'node:fs/promises';
import { writeTokenFile } from './preview-bootstrap.mjs';

export function localConnection(value) {
  const u = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !['127.0.0.1', '[::1]'].includes(u.hostname) || u.pathname !== '/postgres' || !u.port || u.search || u.hash || u.username !== 'postgres' || !u.password) throw new Error('An explicit loopback-only local postgres connection is required.');
  return { host: u.hostname === '[::1]' ? '::1' : u.hostname, port: Number(u.port), database: 'postgres', user: 'postgres', password: decodeURIComponent(u.password), connectionTimeoutMillis: 10000 };
}
export function localInput(email, output, publicKey, fingerprint) {
  if (typeof email !== 'string' || email.length > 254 || !/^[a-z0-9._+-]+@(?:[a-z0-9-]+\.)*example\.invalid$/i.test(email)) throw new Error('Use only a synthetic example.invalid email.');
  if (!isAbsolute(output || '') || !isAbsolute(publicKey || '') || !/^[0-9a-f]{64}$/.test(fingerprint || '')) throw new Error('Absolute file paths and independently verified SHA-256 public-key fingerprint are required.');
  return { email: email.toLowerCase(), output, publicKey, fingerprint };
}
// Caller must use localConnection and a scratch database. One transaction holds
// the same bootstrap lock as the claim. An ambiguous COMMIT preserves ciphertext.
export async function provisionLocal(client, input, {write = writeTokenFile, remove = unlink} = {}) {
  let created = false, committing = false;
  await client.query('begin');
  try {
    const guard = await client.query("select marker from admin.local_testing_guard where marker='synthetic-only'");
    if (guard.rows.length !== 1) throw new Error('Local synthetic guard missing.');
    const state = await client.query('select owner_claimed_at, owner_auth_user_id, bootstrap_disabled_at from admin.admin_bootstrap_state where id=true for update');
    if (state.rows.length !== 1 || Object.values(state.rows[0]).some(v => v !== null)) throw new Error('Bootstrap locked.');
    const occupied = await client.query('select exists(select 1 from admin.first_owner_setup_authorizations) or exists(select 1 from admin.admin_profiles) or exists(select 1 from admin.admin_invitations where invitation_kind=\'bootstrap\' and status=\'pending\') as occupied');
    if (occupied.rows[0]?.occupied !== false) throw new Error('Existing setup state requires review.');
    const token = randomBytes(32);
    const hash = createHash('sha256').update(token).digest();
    await write(input.output, token.toString('hex'), input.publicKey, input.fingerprint);
    created = true;
    await client.query("insert into admin.first_owner_setup_authorizations(email,token_hash,expires_at) values ($1,$2,now()+interval '24 hours')", [input.email, hash]);
    await client.query("select audit.append_audit(null,'bootstrap.direct_authorization_created','admin_bootstrap_state','true','success','{}'::jsonb)");
    committing = true;
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    if (created && !committing) await remove(input.output).catch(() => {});
    throw e;
  }
}
