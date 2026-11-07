// Owner keypair helper: generate, fingerprint and decrypt the one-time
// encrypted bootstrap token.
//
// Everything here uses Node's own crypto and file APIs so the same commands
// work on Linux, macOS and Windows. No `openssl` binary and no POSIX shell is
// required (Windows ships LibreSSL in Git Bash and nothing on PATH in CMD,
// which broke the first version of these scripts).
//
// The private key must never be committed, uploaded or shared. Defaults live
// under the gitignored `.local/` directory; key material is never written into
// a tracked source directory.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export const DEFAULT_KEY_DIR = resolve(process.cwd(), '.local/keys');
export const DEFAULT_PRIVATE_KEY = resolve(DEFAULT_KEY_DIR, 'owner-private.pem');
export const DEFAULT_PUBLIC_KEY = resolve(DEFAULT_KEY_DIR, 'owner-public.pem');

export const WINDOWS = process.platform === 'win32';

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

/** Best-effort owner-only permissions. POSIX chmod is a no-op on Windows. */
function restrictToOwner(path) {
  if (WINDOWS) return;
  chmodSync(path, 0o600);
}

/**
 * Report access permissions in a portable way. On Windows file modes are not
 * meaningful (chmod is a no-op), so callers must not treat them as a check.
 */
export function fileMode(path) {
  if (WINDOWS) return null;
  return (statSync(path).mode & 0o777).toString(8).padStart(3, '0');
}

/**
 * SHA-256 of the SubjectPublicKeyInfo DER encoding — the same fingerprint the
 * provisioning CLIs verify via `--recipient-key-sha256`.
 */
export function publicKeyFingerprint(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

/** Fingerprint a key from a file path. */
export function fingerprintFromFile(publicKeyPath) {
  return publicKeyFingerprint(readFileSync(assertAbsolute('Public key path', publicKeyPath), 'utf8'));
}

/** RSA modulus size in bits, or 0 when the key cannot be read. */
export function rsaBits(privateKeyPath) {
  try {
    const key = createPrivateKey(readFileSync(assertAbsolute('Private key path', privateKeyPath)));
    return key.asymmetricKeyType === 'rsa' ? (key.asymmetricKeyDetails?.modulusLength ?? 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Generate an RSA keypair with Node's crypto. Defaults to PKCS#1 PEM
 * ("BEGIN RSA PRIVATE KEY"), which OpenSSL 3 reads directly, so the same file
 * works with either toolchain.
 */
export function generateOwnerKeypair({ privateKeyPath, publicKeyPath, bits = 3072 } = {}) {
  const priv = assertSafeOutputPath(privateKeyPath || DEFAULT_PRIVATE_KEY);
  const pub = assertSafeOutputPath(publicKeyPath || DEFAULT_PUBLIC_KEY);
  if (!Number.isInteger(bits) || bits < 2048) throw new Error('RSA key size must be at least 2048 bits.');
  if (existsSync(priv) || existsSync(pub)) {
    throw new Error('Refusing to overwrite an existing key. Move or delete it deliberately first.');
  }
  mkdirSync(dirname(priv), { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  writeFileSync(priv, privateKey, { mode: 0o600 });
  restrictToOwner(priv);
  writeFileSync(pub, publicKey, { mode: 0o644 });
  return { privateKeyPath: priv, publicKeyPath: pub, fingerprint: publicKeyFingerprint(publicKey), bits };
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

/** Write the token to a gitignored file instead of leaving it in scrollback. */
export function writeTokenForEntry(token, { outputPath } = {}) {
  const out = assertSafeOutputPath(outputPath || resolve(DEFAULT_KEY_DIR, 'invitation-token.txt'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${token}\n`, { mode: 0o600 });
  restrictToOwner(out);
  return out;
}
