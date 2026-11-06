// CANDIDATE trusted operator path; no CLI or live deployment. Never logs or
// returns a raw token, token hash, management credential, or private key.
import { randomBytes, createHash, createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { readFile, open, unlink } from 'node:fs/promises';
import { productionOwnerInput } from './production-bootstrap.mjs';
import { managementPreflight, MANAGEMENT_QUERY_URL } from './production-management-preflight.mjs';
import { validateProductionAuthInviteConfig, PRODUCTION_CALLBACK } from './production-auth-invite.mjs';

const AUTH_CONFIG_URL='https://api.supabase.com/v1/projects/dqhxgwzjwzvpqiilteld/config/auth';
const CREATE_QUERY="select admin.provision_first_owner_operator(decode($1,'hex')) as ok";

export async function provisionViaManagement({managementToken, reference, tokenFile, publicKeyFile, expectedFingerprint, deliveryVerified, callbackVerified}, {send=fetch}={}) {
 if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || typeof managementToken!=='string' || !managementToken.trim() || /[\r\n]/.test(managementToken)) throw new Error('Trusted management configuration required');
 if (deliveryVerified !== true || callbackVerified !== true) throw new Error('Independent delivery and callback verification required');
 const input=productionOwnerInput(reference, tokenFile, false, publicKeyFile, expectedFingerprint);
 if (input.reference !== 'user-approved-production-owner') throw new Error('Invalid authorization reference');
 // Never permit the public key to be accidentally replaced with ciphertext.
 if (input.tokenFile === input.publicKeyFile) throw new Error('Invalid output path');
 const pem=await readFile(input.publicKeyFile,'utf8');
 if (!/^-----BEGIN (?:RSA )?PUBLIC KEY-----/.test(pem)) throw new Error('A recipient public key is required');
 const key=createPublicKey(pem);
 if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('A sufficiently strong RSA public key is required');
 const fingerprint=createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
 if (fingerprint !== input.expectedFingerprint) throw new Error('Recipient public key fingerprint mismatch');
 await managementPreflight(managementToken,{send});
 const headers={Authorization:`Bearer ${managementToken}`,'Content-Type':'application/json'};
 const config=await send(AUTH_CONFIG_URL,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if (!config.ok) throw new Error('Auth configuration unavailable');
 validateProductionAuthInviteConfig(await config.json(),PRODUCTION_CALLBACK);
 const token=randomBytes(32);
 const hash=createHash('sha256').update(token).digest('hex');
 const ciphertext=publicEncrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(token.toString('hex'),'utf8'));
 token.fill(0);
 let fileCreated=false, requestAttempted=false;
 try {
  const file=await open(input.tokenFile,'wx',0o600);
  fileCreated=true;
  try { await file.writeFile(ciphertext); await file.sync(); } finally { await file.close(); }
  // Once sent, any failure may be an ambiguous commit: preserve ciphertext.
  requestAttempted=true;
  const response=await send(MANAGEMENT_QUERY_URL, {method:'POST',headers,body:JSON.stringify({query:CREATE_QUERY,parameters:[hash]}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('Invitation commit was not confirmed; reconcile before retry');
  const rows=await response.json();
  if (!Array.isArray(rows) || rows.length!==1 || rows[0]?.ok!==true) throw new Error('Invitation commit was not confirmed; reconcile before retry');
  return {status:'invitation_created_ciphertext_saved'};
 } catch {
  if (fileCreated && !requestAttempted) await unlink(input.tokenFile).catch(()=>{});
  throw new Error(requestAttempted ? 'Invitation request not confirmed; reconcile before retry' : 'Encrypted output could not be created');
 }
}
