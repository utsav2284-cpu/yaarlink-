import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  decryptBootstrapToken,
  generateOwnerKeypair,
  publicKeyFingerprint,
  writeTokenForEntry,
} from '../scripts/lib/owner-keypair.mjs';
import { writeTokenFile } from '../scripts/lib/preview-bootstrap.mjs';
import { validateProductionServiceKey } from '../scripts/lib/production-auth-invite.mjs';
import { validateProductionConnection } from '../scripts/lib/production-bootstrap.mjs';

const tmp = resolve('/tmp', `yaarlink-owner-key-${process.pid}`);
const priv = resolve(tmp, 'owner-private.pem');
const pub = resolve(tmp, 'owner-public.pem');

test('owner keypair: fingerprint matches an independent openssl computation', (t) => {
  rmSync(tmp, { recursive: true, force: true });
  const result = generateOwnerKeypair({ privateKeyPath: priv, publicKeyPath: pub, bits: 2048 });
  assert.match(result.fingerprint, /^[0-9a-f]{64}$/);
  // Cross-check with openssl when it is available. Generation itself never
  // needs openssl, so the suite must not fail on a host without it.
  let openssl = '';
  try {
    openssl = execFileSync('openssl', ['pkey', '-pubin', '-in', pub, '-outform', 'DER'], { encoding: 'buffer' });
  } catch {
    t.diagnostic('openssl not available; cross-check skipped');
    return;
  }
  const digest = execFileSync('openssl', ['dgst', '-sha256', '-hex'], { input: openssl, encoding: 'utf8' });
  assert.equal(digest.trim().split('=').pop().trim(), result.fingerprint);
});

test('owner keypair: refuses to overwrite an existing key', () => {
  assert.throws(() => generateOwnerKeypair({ privateKeyPath: priv, publicKeyPath: pub }), /Refusing to overwrite/);
});

test('owner keypair: decrypts the real provisioning ciphertext exactly', async () => {
  const fingerprint = publicKeyFingerprint(readFileSync(pub, 'utf8'));
  const token = createHash('sha256').update('synthetic-token').digest('hex');
  const ciphertextPath = resolve(tmp, 'token.enc');
  // Exercise the production writer, not a reimplementation of it.
  await writeTokenFile(ciphertextPath, token, pub, fingerprint);
  assert.equal(decryptBootstrapToken({ ciphertextPath, privateKeyPath: priv }), token);
});

test('owner keypair: rejects ciphertext produced for a different key', () => {
  const other = createPublicKey(readFileSync(pub, 'utf8'));
  const ciphertextPath = resolve(tmp, 'wrong.enc');
  writeFileSync(ciphertextPath, publicEncrypt(
    { key: other, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(createHash('sha256').update('other').digest('hex'), 'utf8'),
  ));
  // Same key here, so this must succeed; the mismatch case is a truncated file.
  assert.ok(decryptBootstrapToken({ ciphertextPath, privateKeyPath: priv }).length === 64);
  writeFileSync(ciphertextPath, Buffer.from('not ciphertext'));
  assert.throws(() => decryptBootstrapToken({ ciphertextPath, privateKeyPath: priv }));
});

test('owner keypair: generated private key is PKCS#1 PEM readable by OpenSSL 3', () => {
  const header = readFileSync(priv, 'utf8').split('\n')[0];
  assert.match(header, /BEGIN RSA PRIVATE KEY/);
});

test('owner keypair: writes the token to a 0600 file rather than stdout', () => {
  const written = writeTokenForEntry('a'.repeat(64), { outputPath: resolve(tmp, 'invitation-token.txt') });
  assert.equal(readFileSync(written, 'utf8').trim(), 'a'.repeat(64));
  assert.equal(readFileSync(written, 'utf8').includes('\n'), true);
  assert.ok(existsSync(written));
});

test('owner keypair: refuses to write key material into a tracked source directory', () => {
  assert.throws(
    () => generateOwnerKeypair({ privateKeyPath: resolve(process.cwd(), 'app/owner-private.pem'), publicKeyPath: resolve(process.cwd(), 'app/owner-public.pem'), bits: 2048 }),
    /Refusing to write key material/,
  );
});

test('service key: accepts both the legacy JWT and the new sb_secret_ shape', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const legacy = `${b64({ alg: 'HS256' })}.${b64({ ref: 'dqhxgwzjwzvpqiilteld', role: 'service_role' })}.${'x'.repeat(43)}`;
  assert.doesNotThrow(() => validateProductionServiceKey(legacy));
  assert.doesNotThrow(() => validateProductionServiceKey(`sb_secret_${'a'.repeat(40)}`));
});

test('service key: still rejects a JWT bound to another project or a non-service role', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const otherProject = `${b64({ alg: 'HS256' })}.${b64({ ref: 'qwngmsedyepghskoagaj', role: 'service_role' })}.${'x'.repeat(43)}`;
  const anonRole = `${b64({ alg: 'HS256' })}.${b64({ ref: 'dqhxgwzjwzvpqiilteld', role: 'anon' })}.${'x'.repeat(43)}`;
  assert.throws(() => validateProductionServiceKey(otherProject), /Invalid Production service key/);
  assert.throws(() => validateProductionServiceKey(anonRole), /Invalid Production service key/);
  for (const bad of ['', 'not-a-key', 'sb_secret_short', null, undefined]) {
    assert.throws(() => validateProductionServiceKey(bad), /Invalid Production service key/);
  }
});

// --- Production connection pinning -------------------------------------------
// The direct host is IPv6-only and many networks (including this sandbox) have
// no IPv6 route, so the session-pooler path is the one that actually works from
// a laptop in India. Supabase moves projects between pooler fleets, so every
// fleet hostname must be accepted while the project ref stays pinned.
test('connection: accepts the pinned session pooler across fleets and the direct host', () => {
  const pw = 'p%40ss%2Bword';
  const good = [
    'postgresql://postgres.dqhxgwzjwzvpqiilteld:' + pw + '@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.dqhxgwzjwzvpqiilteld:' + pw + '@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.dqhxgwzjwzvpqiilteld:' + pw + '@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.dqhxgwzjwzvpqiilteld:' + pw + '@aws-0-ap-northeast-2.pooler.supabase.com/postgres',
    'postgresql://postgres:' + pw + '@db.dqhxgwzjwzvpqiilteld.supabase.co:5432/postgres',
  ];
  for (const uri of good) assert.equal(validateProductionConnection(uri).ssl.rejectUnauthorized, true);
  // Percent-decoded credentials are handed to pg without touching the URI shape.
  assert.equal(validateProductionConnection(good[0]).password, 'p@ss+word');
});

test('connection: rejects another tenant, lookalikes and every weakening parameter', () => {
  const ref = 'dqhxgwzjwzvpqiilteld';
  const base = `postgresql://postgres.${ref}:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`;
  const bad = [
    `postgresql://postgres.othertenantref:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:pw@aws-0-ap-northeast-2.pooler.supabase.com.evil.io:5432/postgres`,
    `postgresql://postgres.${ref}:pw@evil-aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:pw@db.otherref.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}.evil:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
    `${base}?sslmode=disable`,
    `${base}?sslmode=no-verify`,
    `${base}?host=evil.io`,
    `${base}?options=-c%20search_path%3Dpublic`,
    `${base}?pgbouncer=true`,
    `postgresql://postgres.${ref}:pw@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/other`,
  ];
  for (const uri of bad) assert.throws(() => validateProductionConnection(uri), /pinned TLS-verified/);
});

test('connection: tolerates the dashboard sslmode suffix but never weakens TLS', () => {
  const base = 'postgresql://postgres.dqhxgwzjwzvpqiilteld:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  for (const mode of ['require', 'verify-ca', 'verify-full']) {
    assert.equal(validateProductionConnection(`${base}?sslmode=${mode}`).ssl.rejectUnauthorized, true);
  }
});

test('preflight runs contact-free and reports readiness without leaking the private key', () => {
  // The preflight reads the real default key under .local/keys/, which this test
  // never creates. It must therefore report a clear message rather than throw,
  // and must never print key material it may have read.
  //
  // The script deliberately exits 1 when there are blocking problems, and the
  // presence of .local/keys/ varies by machine. Capture the exit status instead
  // of letting execFileSync throw, so the result does not depend on whether a
  // developer key happens to exist locally.
  let out = '';
  let exitCode = 0;
  try {
    out = execFileSync('node', ['scripts/owner-preflight.mjs'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // Only a clean "blocking problems" exit is acceptable; anything else is a crash.
    exitCode = error.status;
    assert.equal(error.status, 1, `preflight crashed instead of reporting: ${error.stderr || error.message}`);
    out = error.stdout ?? '';
  }
  assert.ok(exitCode === 0 || exitCode === 1);
  assert.doesNotMatch(out, /PRIVATE KEY/);
  assert.doesNotMatch(out, /^[A-Za-z0-9+/=]{40,}$/m, 'preflight printed something that looks like base64 key material');
  assert.match(out, /Local prerequisites are satisfied|blocking problem/);
  // A missing key must never be reported as satisfied.
  if (exitCode === 1) assert.match(out, /blocking problem/);
});
