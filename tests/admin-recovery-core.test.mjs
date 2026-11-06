import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRecoveryCodes, redeemRecoveryCode, normalizeRecoveryCode } from '../backend/admin-recovery-core.mjs';
const pepper=Buffer.alloc(32,42), user={verified:true,userId:'synthetic',active:true,aal2:true,liveTotp:true,currentSession:true};
function store() {
 let tail=Promise.resolve(); const data={rows:[],failures:[],events:[],pending:false,revoked:false};
 return {data, transaction(_id, fn) { const next=tail.then(async()=>fn({
   authorizeGeneration:async()=>true, authorizeRedemption:async()=>true,
   recoveryPending:async()=>data.pending,
   invalidateAll:async()=>{for(const row of data.rows) if(!row.usedAt) row.invalidatedAt=1;},
   insertCodes:async rows=>{for(const r of rows)data.rows.push({...r,id:data.rows.length+1});},
   getCode:async index=>data.rows.findLast(r=>r.index===index&&!r.invalidatedAt),
   countFailuresSince:async since=>data.failures.filter(x=>x>=since).length,
   consume:async(id,now)=>{const r=data.rows.find(x=>x.id===id);if(!r||r.usedAt||r.invalidatedAt)return false;r.usedAt=now;return true;},
   failure:async now=>data.failures.push(now), event:async event=>data.events.push(event),
   requireAssistedRecovery:async()=>{data.pending=true;}, revokeSessions:async()=>{data.revoked=true;}
 })); tail=next.catch(()=>{}); return next; }};
}
test('normalize and validate recovery code format',()=>{ assert.equal(normalizeRecoveryCode(' 01-abcdef0123456789abcdef0123456789 '),'01-ABCDEF0123456789ABCDEF0123456789');assert.equal(normalizeRecoveryCode('01-hello'),null); });
test('valid, invalid, replay, concurrent redemption, rotation and rate limit in serialized store',async()=>{
 const s=store(), now=1700000000000; const generated=await generateRecoveryCodes(s,user,pepper,now); assert.equal(generated.codes.length,8); assert.equal(new Set(s.data.rows.map(r=>r.hash.slice(0,29))).size,8); assert.ok(s.data.rows.every(r=>r.hash.startsWith('$2b$12$')));
 assert.notEqual(s.data.rows[0].hash,generated.codes[0]);
 assert.equal((await redeemRecoveryCode(s,user,'incorrect',pepper,now+1)).status,'denied');
 const next=await generateRecoveryCodes(s,user,pepper,now+2);
 assert.equal((await redeemRecoveryCode(s,user,generated.codes[0],pepper,now+3)).status,'denied');
 for(let i=0;i<3;i++) assert.equal((await redeemRecoveryCode(s,user,'incorrect',pepper,now+4+i)).status,'denied');
 assert.equal((await redeemRecoveryCode(s,user,next.codes[0],pepper,now+8)).status,'rate_limited');
 const results=await Promise.all([redeemRecoveryCode(s,user,next.codes[0],pepper,now+WINDOW()),redeemRecoveryCode(s,user,next.codes[0],pepper,now+WINDOW())]);
 assert.deepEqual(results.map(r=>r.status),['assistance_required','denied']); assert.equal(s.data.revoked,true); assert.equal(s.data.pending,true);
 assert.equal((await redeemRecoveryCode(s,user,next.codes[0],pepper,now+WINDOW()+1)).status,'denied');
 assert.equal(JSON.stringify(s.data.events).includes(next.codes[0]),false);
});
function WINDOW(){return 16*60_000;}
test('authorization and pepper fail closed',async()=>{
 const s=store(); await assert.rejects(generateRecoveryCodes(s,{...user,aal2:false},pepper));
 await assert.rejects(redeemRecoveryCode(s,{...user,verified:false},'x',pepper));
 await assert.rejects(generateRecoveryCodes(s,user,Buffer.alloc(2)));
});
test('expired and used codes remain denied', async () => {
 const s=store(), now=1700000000000; const result=await generateRecoveryCodes(s,user,pepper,now);
 s.data.rows[0].expiresAt=now;
 assert.equal((await redeemRecoveryCode(s,user,result.codes[0],pepper,now+1)).status,'denied');
 s.data.rows[1].usedAt=now;
 assert.equal((await redeemRecoveryCode(s,user,result.codes[1],pepper,now+1)).status,'denied');
});
