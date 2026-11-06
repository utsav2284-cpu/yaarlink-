import test from 'node:test';
import assert from 'node:assert/strict';
import { sendProductionEncryptedBootstrap, PRODUCTION_SENDER } from '../scripts/lib/production-encrypted-delivery.mjs';
import { AUTHORIZED_OWNER } from '../scripts/lib/production-bootstrap.mjs';

test('production encrypted delivery uses pinned sender and recipient, and reports provider acceptance only', async () => {
 const cipher=Buffer.alloc(384,7); let request;
 const result=await sendProductionEncryptedBootstrap({apiKey:'synthetic',ciphertext:cipher},async(url,options)=>{request={url,options};return {ok:true};});
 assert.deepEqual(result,{status:'accepted_by_provider'});
 assert.equal(request.url,'https://api.resend.com/emails');
 assert.equal(request.options.redirect,'error');
 const body=JSON.parse(request.options.body);
 assert.equal(body.from,PRODUCTION_SENDER);
 assert.deepEqual(body.to,[AUTHORIZED_OWNER]);
 assert.equal(body.attachments[0].content,cipher.toString('base64'));
 assert.match(body.subject,/Production/);
});
test('fails closed on invalid config, ciphertext and provider failure',async()=>{
 for (const args of [{apiKey:'',ciphertext:Buffer.alloc(384)},{apiKey:'test\ninjection',ciphertext:Buffer.alloc(384)},{apiKey:'test',ciphertext:Buffer.alloc(10)},{apiKey:'test',ciphertext:'not bytes'}]) await assert.rejects(sendProductionEncryptedBootstrap(args));
 await assert.rejects(sendProductionEncryptedBootstrap({apiKey:'test',ciphertext:Buffer.alloc(384)},async()=>({ok:false})));
});
