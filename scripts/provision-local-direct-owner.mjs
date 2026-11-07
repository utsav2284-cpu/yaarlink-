#!/usr/bin/env node
// Synthetic local use only. No hosted connection, email or plaintext token output.
import pg from 'pg';
import { localConnection, localInput, provisionLocal } from './lib/local-direct-owner.mjs';

async function main() {
  const args = process.argv.slice(2), parsed = {};
  const allowed = new Set(['--email', '--output', '--public-key', '--fingerprint']);
  for (let i=0; i<args.length; i++) {
    const k=args[i];
    if (!allowed.has(k) || parsed[k] !== undefined || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Invalid arguments');
    parsed[k]=args[++i];
  }
  const input=localInput(parsed['--email'],parsed['--output'],parsed['--public-key'],parsed['--fingerprint']);
  const client=new pg.Client(localConnection(process.env.LOCAL_ADMIN_DATABASE_URL || ''));
  try { await client.connect(); await provisionLocal(client,input); }
  finally { await client.end().catch(() => {}); }
  console.log('Synthetic local authorization provisioned. Ciphertext saved; no email was sent.');
}
main().catch(() => { console.error('Local provisioning failed. If commit status is uncertain, inspect the local state before retrying; do not share secrets.'); process.exitCode=1; });
