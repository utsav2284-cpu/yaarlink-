import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryStore } from '../backend/admin-recovery-store.mjs';
const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function setup({ active = true, fail = false } = {}) {
 const calls=[]; let released=false;
 const client={async query(sql,args){ calls.push([sql,args]);
   if (fail && sql.startsWith('insert into admin.admin_recovery_attempts')) throw new Error('test failure');
   if (sql.startsWith('select auth_user_id')) return {rowCount:active?1:0,rows:active?[{auth_user_id:uid}]:[]};
   if (sql.includes('as allowed')) return {rows:[{allowed:true}]};
   if (sql.startsWith('select recovery_pending')) return {rows:[]};
   if (sql.startsWith('select count(*)')) return {rows:[{n:0}]};
   if (sql.startsWith('update admin.admin_recovery_codes set used_at')) return {rowCount:1,rows:[{id:'synthetic'}]};
   return {rowCount:0,rows:[]};
 }, release(){released=true;}};
 return {pool:{connect:async()=>client},calls,wasReleased:()=>released};
}
test('store refuses an identity mismatch before acquiring a connection', async()=>{
 const {pool,calls}=setup(); const store=createRecoveryStore(pool,{sub:uid});
 await assert.rejects(store.transaction('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',async()=>{})); assert.equal(calls.length,0);
});
test('store locks the profile and commits non-secret recovery events', async()=>{
 const {pool,calls,wasReleased}=setup(); const store=createRecoveryStore(pool,{sub:uid,aal:'aal2'});
 const result=await store.transaction(uid,async tx=>{
  assert.equal(await tx.authorizeGeneration(),true);
  assert.equal(await tx.countFailuresSince(Date.now()-1000),0);
  assert.equal(await tx.consume('synthetic',Date.now()),true);
  await tx.requireAssistedRecovery(Date.now()); await tx.revokeSessions(Date.now()); await tx.event('recovery_code_used');
  return 'ok';
 });
 assert.equal(result,'ok'); assert.equal(calls.at(-1)[0],'commit');
 assert.ok(calls.some(([q])=>q.includes('pg_advisory_xact_lock')));
 assert.ok(calls.some(([q])=>q==='set local role preview_recovery_runtime'));
 assert.ok(calls.some(([q])=>q.includes('admin.recovery_has_fresh_totp()')));
 assert.ok(calls.some(([q])=>q.includes('admin.log_recovery_event'))); assert.equal(wasReleased(),true);
});
test('inactive profile or database failure rolls back and releases', async()=>{
 for(const opts of [{active:false},{fail:true}]){
  const {pool,calls,wasReleased}=setup(opts); const store=createRecoveryStore(pool,{sub:uid});
  await assert.rejects(store.transaction(uid,async tx=>{await tx.failure(Date.now());}));
  assert.equal(calls.at(-1)[0],'rollback'); assert.equal(wasReleased(),true);
 }
});
