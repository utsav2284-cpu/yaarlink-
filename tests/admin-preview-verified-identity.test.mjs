import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyIdentityWithAuth } from '../backend/admin-preview-verified-identity.mjs';
const uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const now = 1800000000000;
const base = { iss:'https://qwngmsedyepghskoagaj.supabase.co/auth/v1', aud:'authenticated', role:'authenticated', sub:uid, session_id:sid, aal:'aal2', iat:now/1000-10, exp:now/1000+100, admin:true };
const token = payload => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2ln`;
const verified = async () => ({ data:{user:{id:uid}}, error:null });
test('binds the exact remotely validated token to a minimal identity', async () => {
 let sent; const t = token(base);
 const identity = await verifyIdentityWithAuth(t, async input => { sent=input; return verified(); }, now);
 assert.equal(sent,t); assert.deepEqual(identity,{sub:uid,session_id:sid,aal:'aal2'}); assert.ok(Object.isFrozen(identity));
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
