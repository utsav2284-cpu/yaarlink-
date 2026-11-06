#!/usr/bin/env node
// Run only after security checks, verified delivery setup and successful encrypted
// application invitation provisioning. Acceptance is not proof of email delivery.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { validateProductionConnection } from './lib/production-bootstrap.mjs';
import { validateProductionAuthInviteConfig, validateProductionServiceKey, sendProductionAuthInvite, PRODUCTION_URL, OWNER_EMAIL } from './lib/production-auth-invite.mjs';

async function main() {
 const mode=process.argv.slice(2);
 if (mode.length!==1 || !['--dry-run','--execute'].includes(mode[0])) throw new Error('Choose one mode');
 const { ADMIN_PRODUCTION_OPERATOR_DATABASE_URL:db, SUPABASE_PRODUCTION_MANAGEMENT_TOKEN:management, SUPABASE_PRODUCTION_SERVICE_ROLE_KEY:key, PRODUCTION_VERIFIED_AUTH_CALLBACK:callback }=process.env;
 if (!management || !key || !callback) throw new Error('Missing trusted operator configuration');
 validateProductionServiceKey(key);
 const client=new pg.Client(validateProductionConnection(db || ''));
 try {
  await client.connect();
  const identity=await client.query("select current_user as role,current_database() as db,coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) as tls");
  if (identity.rows[0]?.role!=='postgres' || identity.rows[0]?.db!=='postgres' || identity.rows[0]?.tls!==true) throw new Error('Operator connection rejected');
  await client.query('begin');
  await client.query('select id from admin.admin_bootstrap_state where id=true for update');
  const state=await client.query("select (select owner_claimed_at is null and owner_auth_user_id is null from admin.admin_bootstrap_state where id=true) as unclaimed,(select count(*)::int from admin.admin_profiles) as profiles,(select count(*)::int from admin.admin_invitations where invitation_kind='bootstrap' and status='pending' and expires_at>now() and lower(email::text)=lower($1)) as matches,(select count(*)::int from auth.users where lower(email)=lower($1)) as users",[OWNER_EMAIL]);
  const s=state.rows[0]; if (!s?.unclaimed || s.profiles!==0 || s.matches!==1 || s.users!==0) throw new Error('Bootstrap state requires operator review');
  const response=await fetch('https://api.supabase.com/v1/projects/dqhxgwzjwzvpqiilteld/config/auth',{headers:{Authorization:`Bearer ${management}`},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Auth configuration unavailable');
  validateProductionAuthInviteConfig(await response.json(),callback);
  if (mode[0]==='--dry-run') { console.log('Production Auth invitation dry run passed; no email requested.'); return; }
  const supabase=createClient(PRODUCTION_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  await sendProductionAuthInvite(supabase.auth,callback);
  console.log('Production Auth accepted the invitation request. Email delivery and acceptance are NOT verified.');
 } finally { await client.query('rollback').catch(()=>{}); await client.end().catch(()=>{}); }
}
main().catch(()=>{ console.error('Production Auth invitation was not confirmed. Check configuration and state privately; inspect before retrying an uncertain request.'); process.exitCode=1; });
