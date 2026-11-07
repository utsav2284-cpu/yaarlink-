import test from 'node:test';
import assert from 'node:assert/strict';
import {parseManagementArguments} from '../scripts/lib/production-management-cli.mjs';

test('dry run accepts no flags that could alter target or credentials',()=>{
 assert.deepEqual(parseManagementArguments(['--dry-run']),{'--dry-run':true});
 for(const args of [[],['--execute','--dry-run'],['--dry-run','--execute'],['--dry-run','--unknown'],['--dry-run','--token-file','/tmp/x'],['--dry-run','--dry-run'],['--token','sensitive']]) assert.throws(()=>parseManagementArguments(args));
});
test('execute requires both attestations and public-key/output inputs',()=>{
 const args=['--execute','--confirm-delivery-verified','--confirm-callback-verified','--token-file','/tmp/token','--recipient-public-key','/tmp/public','--recipient-key-sha256','a'.repeat(64)];
 assert.equal(parseManagementArguments(args)['--execute'],true);
 for(const required of ['--confirm-delivery-verified','--confirm-callback-verified']) assert.throws(()=>parseManagementArguments(args.filter(x=>x!==required)));
 assert.throws(()=>parseManagementArguments(['--execute']));
 assert.throws(()=>parseManagementArguments([...args,'--recipient-public-key','/tmp/other']));
});
