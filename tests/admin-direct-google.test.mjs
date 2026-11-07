import test from 'node:test';
import assert from 'node:assert/strict';
import {finishDirectGoogleCallback} from '../lib/admin-direct-google.ts';
const url = s => new URL(`http://127.0.0.1:3000/admin/setup/direct/callback${s}`);
const goodUser = {email:'trial@example.invalid',email_confirmed_at:'2026-01-01',identities:[{provider:'google',identity_data:{email:'trial@example.invalid',email_verified:true}}]};
const auth = user => ({exchangeCodeForSession:async()=>({data:{session:{}},error:null}),getUser:async()=>({data:{user},error:null})});
test('local callback requires PKCE code and a matching verified Google identity',async()=>{
 await finishDirectGoogleCallback(url('?code=synthetic'),auth(goodUser));
 for (const bad of [null,{...goodUser,email_confirmed_at:null},{...goodUser,identities:[]},{...goodUser,identities:[{provider:'google',identity_data:{email:'other@example.invalid',email_verified:true}}]},{...goodUser,identities:[{provider:'google',identity_data:{email:goodUser.email,email_verified:false}}]}]) await assert.rejects(finishDirectGoogleCallback(url('?code=synthetic'),auth(bad)));
 for (const s of ['', '?error=access_denied', '?code=x&token_hash=y', '#access_token=x']) await assert.rejects(finishDirectGoogleCallback(url(s),auth(goodUser)));
 await assert.rejects(finishDirectGoogleCallback(url('?code=synthetic'),{exchangeCodeForSession:async()=>({data:{session:null},error:{}})}));
});
