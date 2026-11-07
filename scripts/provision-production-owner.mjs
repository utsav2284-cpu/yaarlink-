#!/usr/bin/env node
// Trusted operator only. Execution creates a Production owner bootstrap
// invitation; it never creates an Auth user or sends mail by itself.
import pg from 'pg';
import { validateProductionConnection, productionOwnerInput, provisionProductionOwner, PRODUCTION_REF } from './lib/production-bootstrap.mjs';

async function main() {
  const args=process.argv.slice(2), parsed={};
  const allowed=new Set(['--authorization-ref','--token-file','--recipient-public-key','--recipient-key-sha256','--execute','--dry-run','--retire-expired-invitation']);
  for(let i=0;i<args.length;i++) {
    const name=args[i];
    if(!allowed.has(name)||parsed[name]!==undefined) throw new Error('Invalid arguments');
    if(name==='--execute'||name==='--dry-run'||name==='--retire-expired-invitation') parsed[name]=true;
    else { if(!args[i+1]||args[i+1].startsWith('--')) throw new Error('Missing argument'); parsed[name]=args[++i]; }
  }
  if(!!parsed['--execute']===!!parsed['--dry-run']) throw new Error('Choose exactly one mode');
  const input=productionOwnerInput(parsed['--authorization-ref'],parsed['--token-file'],!!parsed['--dry-run'],parsed['--recipient-public-key'],parsed['--recipient-key-sha256']);
  const config=validateProductionConnection(process.env.ADMIN_PRODUCTION_OPERATOR_DATABASE_URL || '');
  const client=new pg.Client(config);
  try {
    await client.connect();
    // Execute always performs the same non-mutating preflight first. The
    // following transaction independently rechecks and locks bootstrap state.
    const retireExpired = parsed['--retire-expired-invitation'] === true;
    if (!input.dryRun) await provisionProductionOwner(client,{...input,dryRun:true,retireExpired});
    await provisionProductionOwner(client,{...input,retireExpired});
  }
  finally { await client.end().catch(()=>{}); }
  console.log(input.dryRun ? `Production ${PRODUCTION_REF} operator dry run passed; nothing was created.` : 'Production bootstrap invitation created; ciphertext saved. Auth invitation and delivery are separate and not yet confirmed.');
}
main().catch(()=>{console.error('Production provisioning failed or was denied. No secret values are displayed. If commit status is uncertain, inspect bootstrap state before any retry.');process.exitCode=1;});
