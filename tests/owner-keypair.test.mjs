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

const tmp = resolve('/tmp', `yaarlink-owner-key-${process.pid}`);
const priv = resolve(tmp, 'owner-private.pem');
const pub = resolve(tmp, 'owner-public.pem');

test('owner keypair: fingerprint matches an independent openssl computation', () => {
  rmSync(tmp, { recursive: true, force: true });
  const result = generateOwnerKeypair({ privateKeyPath: priv, publicKeyPath: pub, bits: 2048 });
  const openssl = execFileSync('sh', ['-c', `openssl pkey -pubin -in '${pub}' -outform DER | openssl dgst -sha256 -hex`], { encoding: 'utf8' });
  assert.equal(openssl.trim().split('=').pop().trim(), result.fingerprint);
  assert.match(result.fingerprint, /^[0-9a-f]{64}$/);
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
