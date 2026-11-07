#!/usr/bin/env node
// Local readiness check for the first-owner bootstrap. Contact-free: it never
// opens a database connection, never reads a password from the environment,
// and never prints private key material. Run it before starting the 24-hour
// invitation window so a missing piece is found first.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { AUTHORIZED_OWNER, PRODUCTION_REF, validateProductionConnection } from './lib/production-bootstrap.mjs';
import { DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY, publicKeyFingerprint } from './lib/owner-keypair.mjs';
import { PRODUCTION_CALLBACK } from './lib/production-auth-invite.mjs';

const results = [];
function check(label, fn) {
  try {
    const detail = fn();
    results.push({ ok: true, label, detail: detail ?? '' });
  } catch (error) {
    results.push({ ok: false, label, detail: error?.message ?? 'failed' });
  }
}

check('Owner private key exists (mode 0600)', () => {
  if (!existsSync(DEFAULT_PRIVATE_KEY)) throw new Error(`missing ${DEFAULT_PRIVATE_KEY}; run: node scripts/owner-key.mjs generate`);
  const { mode } = statSync(DEFAULT_PRIVATE_KEY);
  const permissions = (mode & 0o777).toString(8).padStart(3, '0');
  if (permissions !== '600') throw new Error(`mode is ${permissions}, expected 600`);
  return 'ok';
});

check('Owner public key fingerprint is independently reproducible', () => {
  if (!existsSync(DEFAULT_PUBLIC_KEY)) throw new Error('missing public key');
  const fromNode = publicKeyFingerprint(readFileSync(DEFAULT_PUBLIC_KEY, 'utf8'));
  const fromOpenssl = execFileSync(
    'sh',
    ['-c', `openssl pkey -pubin -in '${DEFAULT_PUBLIC_KEY}' -outform DER | openssl dgst -sha256 -hex`],
    { encoding: 'utf8' },
  ).trim().split('=').pop().trim();
  if (fromNode !== fromOpenssl) throw new Error('Node and openssl disagree on the fingerprint; regenerate the pair');
  return fromNode;
});

check('Private key is RSA and at least 2048 bits', () => {
  const text = execFileSync('openssl', ['pkey', '-in', DEFAULT_PRIVATE_KEY, '-text', '-noout'], { encoding: 'utf8' });
  const bits = Number((text.match(/\((\d+) bit,/) ?? [])[1] ?? 0);
  if (!bits || bits < 2048) throw new Error(`key is ${bits || 'unknown'} bits`);
  return `${bits} bit`;
});

check('Authorised recipient is set', () => `${AUTHORIZED_OWNER} (pinned for ${PRODUCTION_REF})`);

check('Auth callback target', () => PRODUCTION_CALLBACK);

check('Operator connection string in this shell', () => {
  const value = process.env.ADMIN_PRODUCTION_OPERATOR_DATABASE_URL;
  if (!value) throw new Error('ADMIN_PRODUCTION_OPERATOR_DATABASE_URL is not set (expected until step 3)');
  const config = validateProductionConnection(value);
  return `${config.user}@${config.host}:${config.port}`;
});

check('Management + service credentials present', () => {
  const management = process.env.SUPABASE_PRODUCTION_MANAGEMENT_TOKEN;
  const service = process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY;
  if (!management && !service) throw new Error('neither is set (expected until step 4)');
  return `${management ? 'management token set' : 'management token MISSING'}, ${service ? 'service key set' : 'service key MISSING'}`;
});

const blocking = results.filter((r) => !r.ok && !/expected until step/.test(r.detail));
for (const { ok, label, detail } of results) {
  const mark = ok ? '✅' : /expected until step/.test(detail) ? '⏳' : '❌';
  console.log(`${mark} ${label}`);
  if (detail) console.log(`     ${detail}`);
}

console.log('');
if (blocking.length > 0) {
  console.log(`${blocking.length} blocking problem(s). Fix these before Step 3.`);
  process.exitCode = 1;
} else {
  console.log('Local prerequisites are satisfied. ⏳ items are supplied later in the runbook.');
}
