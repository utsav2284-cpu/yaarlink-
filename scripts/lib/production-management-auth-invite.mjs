// CANDIDATE only. Reservation never authorizes an admin or sends email by itself.
// A reservation is durable before the external Auth request: any uncertain
// request requires operator reconciliation, never an automatic retry.
import { createClient } from '@supabase/supabase-js';
import { MANAGEMENT_QUERY_URL } from './production-management-preflight.mjs';
import { validateProductionAuthInviteConfig, validateProductionServiceKey, sendProductionAuthInvite, PRODUCTION_URL, PRODUCTION_CALLBACK } from './production-auth-invite.mjs';

const AUTH_CONFIG_URL='https://api.supabase.com/v1/projects/dqhxgwzjwzvpqiilteld/config/auth';
const RESERVE_QUERY='select admin.reserve_owner_auth_invitation_operator() as ok';

export async function inviteOwnerViaManagement({managementToken,serviceKey,deliveryVerified,callbackVerified,ciphertextDelivered}, {send=fetch,makeClient=createClient}={}) {
 if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || typeof managementToken!=='string' || !managementToken.trim() || /[\r\n]/.test(managementToken)) throw new Error('Trusted management configuration required');
 if (deliveryVerified!==true || callbackVerified!==true || ciphertextDelivered!==true) throw new Error('Independent delivery, callback, and encrypted-token receipt verification required');
 validateProductionServiceKey(serviceKey);
 const headers={Authorization:`Bearer ${managementToken}`,'Content-Type':'application/json'};
 const config=await send(AUTH_CONFIG_URL,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if (!config.ok) throw new Error('Auth configuration unavailable');
 validateProductionAuthInviteConfig(await config.json(),PRODUCTION_CALLBACK);
 // Authenticate the service key against the fixed project before consuming the
 // non-repeatable reservation. The response is not logged or returned.
 const client=makeClient(PRODUCTION_URL,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const probe=await client.auth.admin.listUsers({page:1,perPage:1});
 if (probe.error || !Array.isArray(probe.data?.users)) throw new Error('Production service key could not be verified');
 // After this request is sent, the reservation may have committed even if the
 // response is lost. Never call the external Auth API without confirmation.
 let reservationConfirmed=false;
 try {
  const response=await send(MANAGEMENT_QUERY_URL,{method:'POST',headers,body:JSON.stringify({query:RESERVE_QUERY}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('Reservation unavailable');
  const rows=await response.json();
  if (!Array.isArray(rows) || rows.length!==1 || rows[0]?.ok!==true) throw new Error('Reservation unconfirmed');
  reservationConfirmed=true;
  await sendProductionAuthInvite(client.auth,PRODUCTION_CALLBACK);
  return {status:'accepted_by_auth'}; // Not proof of delivery or ownership.
 } catch {
  throw new Error(reservationConfirmed ? 'Auth invitation not confirmed; reconcile before any retry' : 'Reservation not confirmed; reconcile before any retry');
 }
}
