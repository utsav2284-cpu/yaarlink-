import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createHash, privateDecrypt, constants} from 'node:crypto';
import {mkdtemp, writeFile, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {provisionViaManagement} from '../scripts/lib/production-management-provision.mjs';

const config={site_url:'https://www.theyaar.com',uri_allow_list:'https://www.theyaar.com/admin/auth/callback',smtp_host:'smtp.example.invalid',smtp_port:465,smtp_user:'test',smtp_admin_email:'sender@example.invalid',disable_signup:true,external_email_enabled:true};
async function fixture() {
 const dir=await mkdtemp(join(tmpdir(),'yl-mgmt-test-'));
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const publicKeyFile=join(dir,'public.pem'), tokenFile=join(dir,'token.enc');
 await writeFile(publicKeyFile,publicKey.export({format:'pem',type:'spki'}));
 const expectedFingerprint=createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex');
 return {dir,privateKey,args:{managementToken:'synthetic',reference:'user-approved-production-owner',publicKeyFile,tokenFile,expectedFingerprint,deliveryVerified:true,callbackVerified:true}};
}
function sender({failCreate=false,invalidConfig=false}={}) {
 const calls=[];
 async function send(url,options) {
  calls.push({url,options});
  if (url.endsWith('/config/auth')) return {ok:true,json:async()=>invalidConfig?{...config,disable_signup:false}:config};
  const body=JSON.parse(options.body);
  if (body.query.includes('provision_first_owner_operator')) {
   if (failCreate) throw new Error('synthetic network failure');
   return {ok:true,json:async()=>[{ok:true}]};
  }
  return {ok:true,json:async()=>[{result:'production_management_preflight_pass'}]};
 }
 return {send,calls};
}
test('uses parameterized hash-only management request and encrypted output',async()=>{
 const f=await fixture();try{
  const mock=sender();
  const result=await provisionViaManagement(f.args,{send:mock.send});
  assert.deepEqual(result,{status:'invitation_created_ciphertext_saved'});
  const cipher=await readFile(f.args.tokenFile);
  const raw=privateDecrypt({key:f.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},cipher).toString();
  assert.match(raw,/^[a-f0-9]{64}$/);
  const request=JSON.parse(mock.calls[2].options.body);
  assert.equal(request.parameters[0],createHash('sha256').update(Buffer.from(raw,'hex')).digest('hex'));
  assert.ok(!request.query.includes(raw));
  assert.ok(!JSON.stringify(result).includes(raw));
  assert.equal(mock.calls[2].options.redirect,'error');
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('requires verified delivery, callback, matching key and safe Auth before sending',async()=>{
 const f=await fixture();try{
  const mock=sender();
  await assert.rejects(provisionViaManagement({...f.args,deliveryVerified:false},{send:mock.send}));
  await assert.rejects(provisionViaManagement({...f.args,callbackVerified:false},{send:mock.send}));
  await assert.rejects(provisionViaManagement({...f.args,expectedFingerprint:'0'.repeat(64)},{send:mock.send}));
  assert.equal(mock.calls.length,0);
  await assert.rejects(provisionViaManagement(f.args,{send:sender({invalidConfig:true}).send}));
  await assert.rejects(stat(f.args.tokenFile));
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('ambiguous management request preserves ciphertext and refuses overwrite',async()=>{
 const f=await fixture();try{
  await assert.rejects(provisionViaManagement(f.args,{send:sender({failCreate:true}).send}));
  assert.ok((await stat(f.args.tokenFile)).size>0);
  await assert.rejects(provisionViaManagement(f.args,{send:sender().send}));
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
