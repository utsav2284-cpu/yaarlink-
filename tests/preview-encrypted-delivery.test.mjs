import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEncryptedBootstrap } from '../scripts/lib/preview-encrypted-delivery.mjs';
test('sends only the encrypted attachment to the authorized address and distinguishes provider acceptance',async()=>{
 const ciphertext=Buffer.alloc(384,7); let sent;
 const result=await sendEncryptedBootstrap({apiKey:'synthetic',from:'preview@example.invalid',ciphertext},async(url,options)=>{sent={url,body:JSON.parse(options.body)};return {ok:true};});
 assert.equal(sent.url,'https://api.resend.com/emails'); assert.deepEqual(sent.body.to,['utsavkumar20518@gmail.com']);
 assert.deepEqual(Buffer.from(sent.body.attachments[0].content,'base64'),ciphertext); assert.equal(result.status,'accepted_by_provider');
});
test('rejects invalid configuration, small input and provider failure',async()=>{
 await assert.rejects(sendEncryptedBootstrap({apiKey:'',from:'preview@example.invalid',ciphertext:Buffer.alloc(384)}));
 await assert.rejects(sendEncryptedBootstrap({apiKey:'synthetic',from:'preview@example.invalid',ciphertext:Buffer.alloc(20)}));
 await assert.rejects(sendEncryptedBootstrap({apiKey:'synthetic',from:'preview@example.invalid',ciphertext:Buffer.alloc(384)},async()=>({ok:false})));
});
