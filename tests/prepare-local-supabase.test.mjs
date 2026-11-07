import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('prepares a fresh local-only stack with ordered synthetic SQL and refuses overwrite',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'yl-local-prepare-'));const target=join(parent,'new');
 const call=path=>spawnSync(process.execPath,['scripts/prepare-local-supabase.mjs',path],{encoding:'utf8'});
 assert.equal(call(target).status,0);
 const manifest=JSON.parse(await readFile(join(target,'LOCAL_ONLY_MANIFEST.json'),'utf8'));
 assert.equal(manifest.manifest.length,22);
 assert.equal((await readdir(join(target,'supabase','migrations'))).length,22);
 const config=await readFile(join(target,'supabase','config.toml'),'utf8');
 assert.match(config,/\[auth\.external\.google\]\s*#.*\s*enabled = false/);
 assert.match(config,/schemas = \["public", "graphql_public", "admin", "preview"\]/);
 assert.equal(call(target).status,1); // never overwrite an existing scratch directory
 assert.equal(call('relative-dir').status,1);
 assert.equal(call(process.cwd()).status,1);
});
