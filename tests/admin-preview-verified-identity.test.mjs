import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyIdentityWithAuth, verifyProductionIdentityWithAuth } from '../backend/admin-preview-verified-identity.mjs';
const uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const now = 1800000000000;
const base = { iss:'https://qwngmsedyepghskoagaj.supabase.co/auth/v1', aud:'authenticated', role:'authenticated', sub:uid, session_id:sid, aal:'aal2', iat:now/1000-10, exp:now/1000+100, amr:[{method:'password',timestamp:now/1000-15},{method:'totp',timestamp:now/1000-5}], admin:true };
const token = payload => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2ln`;
const verified = async () => ({ data:{user:{id:uid}}, error:null });
test('binds the exact remotely validated token to a minimal identity', async () => {
 let sent; const t = token(base);
 const identity = await verifyIdentityWithAuth(t, async input => { sent=input; return verified(); }, now);
 assert.equal(sent,t); assert.deepEqual(identity,{sub:uid,session_id:sid,aal:'aal2',amr:[{method:'totp',timestamp:now/1000-5}]}); assert.ok(Object.isFrozen(identity.amr)); assert.ok(Object.isFrozen(identity));
});
test('rejects failure, mismatched user, malformed and invalid claims', async () => {
 for (const changes of [
  {iss:'https://example.com/auth/v1'}, {aud:'anon'}, {role:'service_role'}, {sub:sid},
  {session_id:'not-a-uuid'}, {aal:'aal3'}, {exp:now/1000}, {iat:now/1000+61}, {exp:'1800000100'}
 ]) await assert.rejects(verifyIdentityWithAuth(token({...base,...changes}), verified, now), /Not authorized/);
 await assert.rejects(verifyIdentityWithAuth(token(base), async () => ({error:new Error('secret details')}), now), /^Error: Not authorized$/);
 await assert.rejects(verifyIdentityWithAuth(token(base), async () => { throw new Error('secret details'); }, now), /^Error: Not authorized$/);
 await assert.rejects(verifyIdentityWithAuth('not-a-jwt', verified, now), /Not authorized/);
});

test('malformed TOTP evidence cannot be converted into a fresh verification', async () => {
 for (const amr of [null, {}, [{method:'totp',timestamp:'1800000000'}], Array(33).fill({method:'totp',timestamp:now/1000})]) {
  const identity = await verifyIdentityWithAuth(token({...base,amr}), verified, now);
  assert.deepEqual(identity.amr,[]);
 }
});


test('Production verification is pinned to the Production issuer, not Preview', async () => {
 const production = {...base, iss:'https://dqhxgwzjwzvpqiilteld.supabase.co/auth/v1'};
 const result = await verifyProductionIdentityWithAuth(token(production), verified, now);
 assert.equal(result.sub, uid);
 await assert.rejects(verifyProductionIdentityWithAuth(token(base), verified, now), /Not authorized/);
 await assert.rejects(verifyIdentityWithAuth(token(production), verified, now), /Not authorized/);
});
