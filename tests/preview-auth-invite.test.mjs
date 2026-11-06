import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAuthInviteConfig, sendAuthInvite, OWNER_EMAIL } from '../scripts/lib/preview-auth-invite.mjs';
const cb='https://preview.example.invalid/admin/auth/callback';
const config={site_url:'https://preview.example.invalid',uri_allow_list:cb,smtp_host:'smtp.example.invalid',smtp_port:587,smtp_user:'test',smtp_admin_email:'sender@example.invalid',disable_signup:true,external_email_enabled:true};
test('only exact verified Preview HTTPS callback and configured SMTP are accepted',()=>{
 validateAuthInviteConfig(config,cb);
 for (const changed of [{smtp_host:null},{site_url:'https://other.invalid'},{uri_allow_list:'https://preview.example.invalid/*'},{disable_signup:false}]) assert.throws(()=>validateAuthInviteConfig({...config,...changed},cb));
 for (const bad of ['http://localhost:3000/admin/auth/callback',`${cb}?next=bad`,'https://evil.invalid/admin/auth/callback']) assert.throws(()=>validateAuthInviteConfig(config,bad));
});
test('uses official Auth invite and does not claim delivery',async()=>{
 let args; const result=await sendAuthInvite({admin:{inviteUserByEmail:async(...a)=>{args=a; return {data:{user:{id:'synthetic'}},error:null};}}},cb);
 assert.deepEqual(args,[OWNER_EMAIL,{redirectTo:cb}]); assert.deepEqual(result,{status:'accepted_by_auth'});
 await assert.rejects(sendAuthInvite({admin:{inviteUserByEmail:async()=>({error:{},data:{user:null}})}},cb));
});
