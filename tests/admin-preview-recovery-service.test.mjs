import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryGenerationService, createRecoveryRedemptionService } from '../backend/admin-preview-recovery-service.mjs';
const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const pepper=Buffer.alloc(32,42);
function harness({aal='aal2',verifierFails=false,deniedAt=0}={}) {
 let calls=0, storeCount=0, received, inserts=0, invalidations=0;
 const service=createRecoveryGenerationService({pepper,
  verify:async token=>{received=token; if(verifierFails)throw new Error('Not authorized'); return {sub:uid,aal,session_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',amr:[]};},
  makeStore:claims=>{storeCount++; assert.equal(claims.sub,uid); return {transaction:async(user,fn)=>{assert.equal(user,uid); return fn({
    authorizeGeneration:async()=>{calls++; return calls!==deniedAt;}, recoveryPending:async()=>false,
    invalidateAll:async()=>{invalidations++;}, insertCodes:async rows=>{inserts=rows.length; assert.ok(rows.every(x=>x.hash.startsWith('$2b$12$')));}, event:async()=>{}
  });}};}
 });
 return {service,stats:()=>({calls,storeCount,received,inserts,invalidations})};
}
test('generation accepts identity only from verifier and rechecks database before mutation',async()=>{
 const h=harness(); const result=await h.service.generate('synthetic-token');
 assert.equal(result.status,'generated'); assert.equal(result.codes.length,8); assert.equal(h.stats().calls,2);
 assert.equal(h.stats().received,'synthetic-token'); assert.equal(h.stats().inserts,8); assert.equal(h.stats().invalidations,1);
});
test('verification failure and AAL1 never acquire a store',async()=>{
 for(const opts of [{aal:'aal1'},{verifierFails:true}]) { const h=harness(opts); await assert.rejects(h.service.generate('synthetic-token')); assert.equal(h.stats().storeCount,0); }
});
test('state becoming unauthorized during hashing never invalidates or inserts codes',async()=>{
 const h=harness({deniedAt:2}); assert.deepEqual(await h.service.generate('synthetic-token'),{status:'denied'}); assert.equal(h.stats().invalidations,0); assert.equal(h.stats().inserts,0);
});
test('redemption verifies identity before store creation and does not require or grant AAL2',async()=>{
 let stores=0;
 const service=createRecoveryRedemptionService({pepper,
  verify:async token=>{if(token==='invalid')throw new Error('Not authorized');return {sub:uid,aal:'aal1',session_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};},
  makeStore:claims=>{stores++;assert.equal(claims.aal,'aal1');return {transaction:async(user,fn)=>{assert.equal(user,uid);return fn({authorizeRedemption:async()=>false,recoveryPending:async()=>false});}};}
 });
 await assert.rejects(service.redeem('invalid','invalid')); assert.equal(stores,0);
 assert.deepEqual(await service.redeem('verified-aal1','invalid'),{status:'denied'});
 assert.equal(stores,1);
});
