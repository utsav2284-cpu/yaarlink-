#!/usr/bin/env node
// Owner key setup helper. Local-only: never contacts the network, never prints
// the private key or the plaintext invitation token.
//
//   node scripts/owner-key.mjs generate
//   node scripts/owner-key.mjs decrypt --ciphertext /abs/path/token.enc [--write]
import { DEFAULT_KEY_DIR, DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY, decryptBootstrapToken, generateOwnerKeypair, writeTokenForEntry } from './lib/owner-keypair.mjs';

const [command, ...rest] = process.argv.slice(2);

function arg(name, fallback) {
  const index = rest.indexOf(name);
  if (index === -1) return fallback;
  const value = rest[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

try {
  if (command === 'generate') {
    const bits = Number(arg('--bits', '3072'));
    const result = generateOwnerKeypair({
      privateKeyPath: arg('--private-key', DEFAULT_PRIVATE_KEY),
      publicKeyPath: arg('--public-key', DEFAULT_PUBLIC_KEY),
      bits,
    });
    console.log('Owner keypair created (no network access, nothing committed).');
    console.log(`  private : ${result.privateKeyPath}  (keep secret, never share)`);
    console.log(`  public  : ${result.publicKeyPath}`);
    console.log(`  RSA bits: ${result.bits}`);
    console.log('');
    console.log('Use this fingerprint as --recipient-key-sha256:');
    console.log(`  ${result.fingerprint}`);
    console.log('');
    console.log('Verify it independently before use:');
    console.log(`  openssl pkey -pubin -in '${result.publicKeyPath}' -outform DER | openssl dgst -sha256 -hex`);
  } else if (command === 'decrypt') {
    const ciphertextPath = arg('--ciphertext');
    if (!ciphertextPath) throw new Error('--ciphertext /abs/path/to/token.enc is required');
    const token = decryptBootstrapToken({ ciphertextPath, privateKeyPath: arg('--private-key', DEFAULT_PRIVATE_KEY) });
    if (rest.includes('--write')) {
      const written = writeTokenForEntry(token);
      console.log(`Invitation token written to ${written} (mode 0600).`);
      console.log('Open that file, paste the 64 characters into /admin/setup, then delete it.');
    } else {
      // Printed deliberately for manual entry into /admin/setup; never logged
      // by this tool and never written to a tracked file.
      console.log(token);
    }
  } else {
    console.error('Usage:\n  node scripts/owner-key.mjs generate [--bits 3072]\n  node scripts/owner-key.mjs decrypt --ciphertext /abs/token.enc [--write]');
    console.error(`Default key directory: ${DEFAULT_KEY_DIR} (gitignored)`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Owner key operation failed: ${error?.message ?? 'unknown error'}`);
  console.error('No secret values are displayed.');
  process.exitCode = 1;
}
