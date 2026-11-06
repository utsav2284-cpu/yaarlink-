import test from 'node:test';
import assert from 'node:assert/strict';
import {inviteOwnerViaManagement} from '../scripts/lib/production-management-auth-invite.mjs';
const serviceKey=`a.${Buffer.from(JSON.stringify({ref:'dqhxgwzjwzvpqiilteld',role:'service_role'})).toString('base64url')}.b`;
const input={managementToken:'synthetic',serviceKey,deliveryVerified:true,callbackVerified:true,ciphertextDelivered:true};
const config={site_url:'https://www.theyaar.com',uri_allow_list:'https://www.theyaar.com/admin/auth/callback',smtp_host:'smtp.example.invalid',smtp_port:465,smtp_user:'test',smtp_admin_email:'sender@example.invalid',disable_signup:true,external_email_enabled:true};
function mock({reserveFailure=false,authFailure=false}={}) {
 const calls=[]; let invites=0;
 const send=async(url,options)=>{calls.push({url,options});if(url.endsWith('/config/auth'))return {ok:true,json:async()=>config};return reserveFailure?{ok:false}:{ok:true,json:async()=>[{ok:true}]};};
 const makeClient=(url,key,options)=>{calls.push({url,key,options});return {auth:{admin:{listUsers:async()=>({data:{users:[]},error:null}),inviteUserByEmail:async(email,opts)=>{invites++; calls.push({email,opts});return authFailure?{error:{},data:{user:null}}:{data:{user:{id:'synthetic'}},error:null};}}}};};
 return {send,makeClient,calls,get invites(){return invites;}};
}
test('reserves once before official Auth invite and reports acceptance only',async()=>{
 const m=mock(); assert.deepEqual(await inviteOwnerViaManagement(input,m),{status:'accepted_by_auth'});
 assert.equal(m.invites,1);
 assert.equal(JSON.parse(m.calls[2].options.body).query,'select admin.reserve_owner_auth_invitation_operator() as ok');
 assert.equal(m.calls[1].url,'https://dqhxgwzjwzvpqiilteld.supabase.co');
 assert.equal(m.calls[3].email,'utsavkumar20518@gmail.com');
 assert.equal(m.calls[3].opts.redirectTo,'https://www.theyaar.com/admin/auth/callback');
});
test('fails closed before reservation without required independent checks or correct project key',async()=>{
 const m=mock();
 for(const item of [{...input,deliveryVerified:false},{...input,callbackVerified:false},{...input,ciphertextDelivered:false},{...input,serviceKey:'bad'}]) await assert.rejects(inviteOwnerViaManagement(item,m));
 assert.equal(m.calls.length,0);
});
test('uncertain reservation sends no Auth request; Auth error requires reconciliation',async()=>{
 const a=mock({reserveFailure:true});await assert.rejects(inviteOwnerViaManagement(input,a),/reconcile/);assert.equal(a.invites,0);
 const b=mock({authFailure:true});await assert.rejects(inviteOwnerViaManagement(input,b),/reconcile/);assert.equal(b.invites,1);
});

test('CLI requires all distinct explicit checks and rejects extra arguments',async()=>{
 const {parseAuthInviteArguments}=await import('../scripts/lib/production-management-auth-cli.mjs');
 const args=['--execute','--confirm-delivery-verified','--confirm-callback-verified','--confirm-ciphertext-received'];
 assert.deepEqual(parseAuthInviteArguments(args),{deliveryVerified:true,callbackVerified:true,ciphertextDelivered:true});
 for(const bad of [[],args.slice(1),[...args,'--anything'],[...args.slice(0,3),args[0]]]) assert.throws(()=>parseAuthInviteArguments(bad));
});
test('invalid service credential does not consume reservation',async()=>{
 const m=mock();m.makeClient=()=>({auth:{admin:{listUsers:async()=>({data:null,error:{}})}}});
 await assert.rejects(inviteOwnerViaManagement(input,m),/service key could not be verified/);
 assert.equal(m.calls.length,1);assert.equal(m.invites,0);
});
