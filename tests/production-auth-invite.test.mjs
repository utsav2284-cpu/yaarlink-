import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionAuthInviteConfig, validateProductionServiceKey, sendProductionAuthInvite, PRODUCTION_CALLBACK, OWNER_EMAIL } from '../scripts/lib/production-auth-invite.mjs';
const config={site_url:'https://www.theyaar.com',uri_allow_list:PRODUCTION_CALLBACK,smtp_host:'smtp.example.invalid',smtp_port:587,smtp_user:'test',smtp_admin_email:'sender@example.invalid',disable_signup:true,external_email_enabled:true};
test('Production Auth requires exact callback, invite-only, SMTP and no wildcard redirects',()=>{
 validateProductionAuthInviteConfig(config,PRODUCTION_CALLBACK);
 for (const changed of [{smtp_host:null},{site_url:'https://other.invalid'},{uri_allow_list:PRODUCTION_CALLBACK+',https://www.theyaar.com/**'},{disable_signup:false},{external_email_enabled:false}]) assert.throws(()=>validateProductionAuthInviteConfig({...config,...changed},PRODUCTION_CALLBACK));
 for (const cb of ['https://evil.invalid/admin/auth/callback',PRODUCTION_CALLBACK+'?x=1']) assert.throws(()=>validateProductionAuthInviteConfig(config,cb));
});
test('service key guard rejects other projects and roles',()=>{
 const key=claims=>`x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`;
 validateProductionServiceKey(key({ref:'dqhxgwzjwzvpqiilteld',role:'service_role'}));
 for(const k of ['invalid',key({ref:'qwngmsedyepghskoagaj',role:'service_role'}),key({ref:'dqhxgwzjwzvpqiilteld',role:'anon'})]) assert.throws(()=>validateProductionServiceKey(k));
});
test('Auth invite targets authorized owner and reports acceptance only',async()=>{
 let args; const result=await sendProductionAuthInvite({admin:{inviteUserByEmail:async(...a)=>{args=a;return {data:{user:{id:'synthetic'}},error:null};}}},PRODUCTION_CALLBACK);
 assert.deepEqual(args,[OWNER_EMAIL,{redirectTo:PRODUCTION_CALLBACK}]); assert.deepEqual(result,{status:'accepted_by_auth'});
 await assert.rejects(sendProductionAuthInvite({admin:{inviteUserByEmail:async()=>({error:{},data:{user:null}})}},PRODUCTION_CALLBACK));
 await assert.rejects(sendProductionAuthInvite({},'https://evil.invalid/admin/auth/callback'));
});
