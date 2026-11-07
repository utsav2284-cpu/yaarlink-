// Only call after the trusted provisioning process creates the ciphertext file.
// This sends ciphertext, never the decrypted token. Provider acceptance is not delivery.
export function validateEncryptedMailConfig({apiKey,from}) {
 if (typeof apiKey!=='string' || !apiKey.trim() || typeof from!=='string' || !/^[^\r\n@]+@[^\r\n@]+$/.test(from)) throw new Error('Encrypted email delivery is not configured');
}
export async function sendEncryptedBootstrap({apiKey,from,ciphertext}, send=fetch) {
 validateEncryptedMailConfig({apiKey,from});
 if (!Buffer.isBuffer(ciphertext) || ciphertext.length < 256 || ciphertext.length > 1024) throw new Error('Invalid encrypted invitation');
 const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:['utsavkumar20518@gmail.com'],subject:'YaarLink Preview encrypted setup token',text:'This attachment contains an encrypted Preview setup token. Use only the matching private key, kept on your own device. Your Auth invitation is sent separately.',attachments:[{filename:'yaarlink-preview-token.enc',content:ciphertext.toString('base64')}]}),signal:AbortSignal.timeout(10000)});
 if (!response.ok) throw new Error('Email provider did not confirm acceptance');
 return {status:'accepted_by_provider'};
}
