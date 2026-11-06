import test from 'node:test';
import assert from 'node:assert/strict';
import {localConnection,localInput,provisionLocal} from '../scripts/lib/local-direct-owner.mjs';

const input=localInput('trial@example.invalid','/tmp/ciphertext','/tmp/public.pem','a'.repeat(64));
function fake(failAt='') {
 const calls=[];
 return {calls, async query(sql,params) {
  calls.push({sql,params});
  if (sql.includes(failAt) && failAt) throw Error('synthetic failure');
  if (sql.includes('local_testing_guard')) return {rows:[{marker:'synthetic-only'}]};
  if (sql.startsWith('select owner_claimed_at')) return {rows:[{owner_claimed_at:null,owner_auth_user_id:null,bootstrap_disabled_at:null}]};
  if (sql.includes('as occupied')) return {rows:[{occupied:false}]};
  return {rows:[]};
 }};
}
test('local provisioner rejects remote connections and nonsynthetic identities',()=>{
 assert.equal(localConnection('postgresql://postgres:example@127.0.0.1:54322/postgres').host,'127.0.0.1');
 for (const value of ['postgresql://postgres:example@db.example.com:5432/postgres','postgresql://postgres:example@127.0.0.1:54322/postgres?sslmode=disable','postgresql://postgres:example@127.0.0.1:54322/other']) assert.throws(()=>localConnection(value));
 assert.throws(()=>localInput('owner@gmail.com','/tmp/ciphertext','/tmp/public.pem','a'.repeat(64)));
 assert.throws(()=>localInput('trial@example.invalid','relative','/tmp/public.pem','a'.repeat(64)));
});
test('local provisioner writes only a digest and cleans failed precommit ciphertext',async()=>{
 const db=fake('insert into admin.first_owner'); let captured, removed=false;
 await assert.rejects(provisionLocal(db,input,{write:async (_path,token)=>{captured=token},remove:async()=>{removed=true}}));
 const params=db.calls.find(c=>c.sql.startsWith('insert into admin.first_owner')).params;
 assert.match(captured,/^[0-9a-f]{64}$/); assert.equal(params[1].length,32); assert.notEqual(params[1].toString('hex'),captured);
 assert.equal(removed,true); assert.equal(db.calls.at(-1).sql,'rollback');
});
test('local provisioner preserves ciphertext on ambiguous commit',async()=>{
 const db=fake('commit'); let removed=false;
 await assert.rejects(provisionLocal(db,input,{write:async()=>{},remove:async()=>{removed=true}}));
 assert.equal(removed,false); assert.equal(db.calls.at(-1).sql,'rollback');
});
