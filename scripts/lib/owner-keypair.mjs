// Owner keypair helper: generate, fingerprint and decrypt the one-time
// encrypted bootstrap token. No plaintext token is ever printed.
//
// The private key must never be committed, uploaded or shared. Defaults live
// under the gitignored `.local/` directory; this module refuses paths inside
// tracked build output and never writes outside the caller-supplied path.
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, privateDecrypt, constants } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export const DEFAULT_KEY_DIR = resolve(process.cwd(), '.local/keys');
export const DEFAULT_PRIVATE_KEY = resolve(DEFAULT_KEY_DIR, 'owner-private.pem');
export const DEFAULT_PUBLIC_KEY = resolve(DEFAULT_KEY_DIR, 'owner-public.pem');

function assertAbsolute(label, value) {
  if (typeof value !== 'string' || !value || !isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return value;
}

/** Refuse to touch paths that could be committed in error. */
function assertSafeOutputPath(path) {
  assertAbsolute('Output path', path);
  const normalized = path.replaceAll('\\', '/');
  const banned = ['/app/', '/backend/', '/frontend/', '/shared/', '/public/', '/config/', '/scripts/'];
  if (banned.some((segment) => normalized.includes(segment)) && !normalized.includes('/.local/')) {
    throw new Error('Refusing to write key material inside a tracked source directory. Use .local/ (gitignored).');
  }
  return path;
}

/**
 * SHA-256 of the SubjectPublicKeyInfo DER encoding — the same fingerprint the
 * provisioning CLIs verify via `--recipient-key-sha256`.
 */
export function publicKeyFingerprint(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

/** Generate an RSA keypair with openssl; return the fingerprint. */
export function generateOwnerKeypair({ privateKeyPath, publicKeyPath, bits = 3072 } = {}) {
  const priv = assertSafeOutputPath(privateKeyPath || DEFAULT_PRIVATE_KEY);
  const pub = assertSafeOutputPath(publicKeyPath || DEFAULT_PUBLIC_KEY);
  if (!Number.isInteger(bits) || bits < 2048) throw new Error('RSA key size must be at least 2048 bits.');
  if (existsSync(priv) || existsSync(pub)) {
    throw new Error('Refusing to overwrite an existing key. Move or delete it deliberately first.');
  }
  mkdirSync(dirname(priv), { recursive: true, mode: 0o700 });
  execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', `rsa_keygen_bits:${bits}`, '-out', priv], { stdio: 'pipe' });
  chmodSync(priv, 0o600);
  execFileSync('openssl', ['rsa', '-pubout', '-in', priv, '-out', pub], { stdio: 'pipe' });
  const fingerprint = publicKeyFingerprint(readFileSync(pub, 'utf8'));
  return { privateKeyPath: priv, publicKeyPath: pub, fingerprint, bits };
}

/**
 * Decrypt the RSA-OAEP-SHA256 ciphertext written by
 * scripts/provision-production-owner.mjs.
 */
export function decryptBootstrapToken({ ciphertextPath, privateKeyPath } = {}) {
  const ct = assertAbsolute('Ciphertext path', ciphertextPath);
  const keyPath = assertAbsolute('Private key path', privateKeyPath || DEFAULT_PRIVATE_KEY);
  const privateKey = createPrivateKey(readFileSync(keyPath));
  if (privateKey.asymmetricKeyType !== 'rsa') throw new Error('The owner private key must be an RSA key.');
  const plaintext = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    readFileSync(ct),
  ).toString('utf8');
  if (!/^[0-9a-f]{64}$/i.test(plaintext)) {
    throw new Error('Decrypted value is not a 64-character hexadecimal invitation token.');
  }
  return plaintext.trim();
}

/** Write the token to a gitignored 0600 file instead of stdout. */
export function writeTokenForEntry(token, { outputPath } = {}) {
  const out = assertSafeOutputPath(outputPath || resolve(DEFAULT_KEY_DIR, 'invitation-token.txt'));
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
  writeFileSync(out, `${token}\n`, { mode: 0o600 });
  chmodSync(out, 0o600);
  return out;
}
