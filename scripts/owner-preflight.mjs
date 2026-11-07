#!/usr/bin/env node
// Local readiness check for the first-owner bootstrap. Contact-free: it never
// opens a database connection, never reads a password from the environment,
// and never prints private key material. Run it before starting the 24-hour
// invitation window so a missing piece is found first.
import { existsSync, readFileSync } from 'node:fs';
import { AUTHORIZED_OWNER, PRODUCTION_REF, validateProductionConnection } from './lib/production-bootstrap.mjs';
import { DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY, WINDOWS, fileMode, fingerprintFromFile, publicKeyFingerprint, rsaBits } from './lib/owner-keypair.mjs';
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

check('Owner private key exists', () => {
  if (!existsSync(DEFAULT_PRIVATE_KEY)) throw new Error(`missing ${DEFAULT_PRIVATE_KEY}; run: node scripts/owner-key.mjs generate`);
  const mode = fileMode(DEFAULT_PRIVATE_KEY);
  if (mode === null) return 'present (Windows: use NTFS ACLs, file modes are not applied)';
  if (mode !== '600') throw new Error(`mode is ${mode}, expected 600`);
  return `mode ${mode}`;
});

check('Owner public key fingerprint is reproducible from disk', () => {
  if (!existsSync(DEFAULT_PUBLIC_KEY)) throw new Error('missing public key');
  const fromFile = fingerprintFromFile(DEFAULT_PUBLIC_KEY);
  const fromPem = publicKeyFingerprint(readFileSync(DEFAULT_PUBLIC_KEY, 'utf8'));
  if (fromFile !== fromPem) throw new Error('fingerprint is not reproducible; regenerate the pair');
  return fromFile;
});

check('Private key is RSA and at least 2048 bits', () => {
  const bits = rsaBits(DEFAULT_PRIVATE_KEY);
  if (!bits || bits < 2048) throw new Error(`key is ${bits || 'unreadable'} bits`);
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
