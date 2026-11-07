// Trusted operator only. The authorized owner receives ciphertext, never a raw
// setup token. Provider acceptance is not proof of delivery or decryption.
import { AUTHORIZED_OWNER } from './production-bootstrap.mjs';
export const PRODUCTION_SENDER = 'noreply@theyaar.com';

export async function sendProductionEncryptedBootstrap({apiKey, ciphertext}, send = fetch) {
 if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('Encrypted delivery is not configured');
 if (!Buffer.isBuffer(ciphertext) || ciphertext.length < 256 || ciphertext.length > 1024) throw new Error('Invalid encrypted invitation');
 const response = await send('https://api.resend.com/emails', {
  method:'POST',
  headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
  body:JSON.stringify({
   from:PRODUCTION_SENDER, to:[AUTHORIZED_OWNER],
   subject:'YaarLink Production encrypted setup token',
   text:'The attachment is an encrypted Production setup token. Use only the private key kept on your own device. The Auth invitation is separate. Do not share the token.',
   attachments:[{ filename:'yaarlink-production-token.enc', content:ciphertext.toString('base64') }],
  }),
  redirect:'error', signal:AbortSignal.timeout(10000),
 });
 if (!response.ok) throw new Error('Email provider did not confirm acceptance');
 return {status:'accepted_by_provider'};
}
