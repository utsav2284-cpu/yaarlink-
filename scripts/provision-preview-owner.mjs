#!/usr/bin/env node
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { validateEncryptedMailConfig, sendEncryptedBootstrap } from './lib/preview-encrypted-delivery.mjs';
import { validatePreviewConnection, validateInput, provision, PREVIEW_REF } from './lib/preview-bootstrap.mjs';

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--email','--authorization-ref','--token-file','--recipient-public-key','--recipient-key-sha256','--send-encrypted-email','--execute','--dry-run']);
  const parsed = {};
  for (let i=0; i<args.length; i++) {
    const arg = args[i];
    if (!allowed.has(arg) || parsed[arg] !== undefined) throw new Error('Invalid arguments.');
    if (arg === '--execute' || arg === '--dry-run' || arg === '--send-encrypted-email') parsed[arg] = true;
    else { if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('Missing argument value.'); parsed[arg] = args[++i]; }
  }
  if (!!parsed['--execute'] === !!parsed['--dry-run']) throw new Error('Choose exactly one of --dry-run or --execute.');
  const input = validateInput(parsed['--email'], parsed['--authorization-ref'], parsed['--token-file'], !!parsed['--dry-run'], parsed['--recipient-public-key'], parsed['--recipient-key-sha256']);
  const sendMail = !!parsed['--send-encrypted-email'];
  if (sendMail) {
    if (input.dryRun || input.email !== 'utsavkumar20518@gmail.com') throw new Error('Encrypted email is only for the authorized Preview owner in execute mode.');
    validateEncryptedMailConfig({apiKey:process.env.PREVIEW_BOOTSTRAP_RESEND_API_KEY,from:process.env.PREVIEW_BOOTSTRAP_EMAIL_FROM});
  }
  const config = validatePreviewConnection(process.env.ADMIN_PREVIEW_OPERATOR_DATABASE_URL || '');
  const client = new pg.Client(config);
  try { await client.connect(); await provision(client, input); }
  finally { await client.end().catch(() => {}); }
  if (sendMail) {
    try {
      await sendEncryptedBootstrap({apiKey:process.env.PREVIEW_BOOTSTRAP_RESEND_API_KEY,from:process.env.PREVIEW_BOOTSTRAP_EMAIL_FROM,ciphertext:await readFile(input.tokenFile)});
      console.log('Encrypted attachment accepted by provider; delivery is NOT verified.');
    } catch {
      console.error('Invitation was created, but encrypted email acceptance was not confirmed. Keep the ciphertext and inspect provider status before retrying.');
      process.exitCode=1; return;
    }
  }
  console.log(input.dryRun ? `Dry run passed for Preview ${PREVIEW_REF} and ${input.email}; no invitation or token created.` : `Preview invitation created; encrypted token saved in the protected file. Deliver only through the trusted channel.`);
}
main().catch(() => { console.error('Provisioning failed or was denied. Check the operator inputs, Preview connection, and bootstrap state; no secret values are displayed. If commit status is uncertain, inspect the Preview state before retrying.'); process.exitCode=1; });
