#!/usr/bin/env node
// Copy an explicit, local-only synthetic stack to a NEW external directory.
// No hosted connection, linking, reset, Docker command, or secret involved.
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const history=['20261105193208','20261105193227','20261105193246','20261105195049','20261105195123','20261105195921','20261105195948','20261105200100'];
const later=['202611060001_admin_preview_least_privilege','202611060002_admin_preview_register_session','202611060003_admin_preview_bootstrap_hardening','202611060004_admin_preview_creator_pending_by_default','202611060005_admin_preview_recovery_controls','202611060006_admin_preview_recovery_runtime','202611060007_admin_preview_recovery_runtime_monotonic','202611060008_admin_preview_recovery_fresh_totp','202611060009_admin_preview_bootstrap_preflight','202611060010_admin_preview_bootstrap_public_status','202611060011_admin_preview_marketplace_review'];
const files=['backend/db/drizzle/0000_initial_schema.sql',...history.map(n=>`test-infra/preview-history/${n}.sql`),...later.map(n=>n.startsWith('202611060005_') ? 'test-infra/preview-history/20261106043409.sql' : `supabase/migrations/${n}.sql`),'supabase/candidates/preview_direct_google_owner.sql','supabase/candidates/local_synthetic_guard.sql'];

async function main() {
 const target=process.argv[2];
 if(process.argv.length!==3 || !target || !isAbsolute(target)) throw Error('Supply one absolute new scratch directory.');
 const absolute=resolve(target), rel=relative(root,absolute);
 if(!rel || (!isAbsolute(rel) && !rel.startsWith(`..${sep}`) && rel!=='..') || absolute===resolve(absolute, '..')) throw Error('Scratch must be outside the repository and not a filesystem root.');
 // Resolve the existing parent too, so a symlink cannot redirect output into
 // the repository while appearing to be outside it lexically.
 const physicalRoot=await realpath(root), physicalParent=await realpath(dirname(absolute));
 const physicalRelative=relative(physicalRoot,physicalParent);
 if(!physicalRelative || (!isAbsolute(physicalRelative) && !physicalRelative.startsWith(`..${sep}`) && physicalRelative!=='..')) throw Error('Scratch parent must be outside the repository.');
 // Read everything before creating any output; missing source files fail early.
 const contents=await Promise.all(files.map(file=>readFile(join(root,file))));
 const config=await readFile(join(root,'test-infra/local-supabase/supabase/config.toml'));
 // mkdir is exclusive: existing directory or symlink is never overwritten.
 await mkdir(absolute);
 const supabase=join(absolute,'supabase'), migrations=join(supabase,'migrations');
 await mkdir(supabase); await mkdir(migrations);
 await writeFile(join(supabase,'config.toml'),config,{flag:'wx'});
 const manifest=[];
 for(let i=0;i<files.length;i++) {
  // Distinct 14-digit local version numbers do not imply hosted history.
  const name=`${String(i+1).padStart(14,'0')}_synthetic_replay.sql`;
  await writeFile(join(migrations,name),contents[i],{flag:'wx'});
  manifest.push({source:files[i],file:name,sha256:createHash('sha256').update(contents[i]).digest('hex')});
 }
 await writeFile(join(absolute,'LOCAL_ONLY_MANIFEST.json'),JSON.stringify({warning:'Disposable synthetic local reconstruction; never link or push to a hosted project.',manifest},null,2)+'\n',{flag:'wx'});
 // Suppress accidental source-control inclusion if the directory is later git-initialized.
 await writeFile(join(absolute,'.gitignore'),'supabase/.temp/\nsupabase/.branches/\n.env*\n',{flag:'wx'});
 console.log('Prepared local-only synthetic Supabase files. No database was contacted and no stack started.');
}
main().catch(()=>{console.error('Preparation failed. Nothing was overwritten. Inspect any newly created scratch directory before retrying.');process.exitCode=1;});
