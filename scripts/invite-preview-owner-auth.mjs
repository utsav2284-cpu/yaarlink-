#!/usr/bin/env node
// Requires the encrypted application invitation to have already been created.
// This creates a separate Auth invitation; it does not verify email delivery.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { validatePreviewConnection } from './lib/preview-bootstrap.mjs';
import { validateAuthInviteConfig, sendAuthInvite, PREVIEW_URL, OWNER_EMAIL } from './lib/preview-auth-invite.mjs';

async function main() {
 const mode=process.argv.slice(2);
 if (mode.length!==1 || !['--dry-run','--execute'].includes(mode[0])) throw new Error('Choose one mode');
 const { ADMIN_PREVIEW_OPERATOR_DATABASE_URL:db, SUPABASE_PREVIEW_MANAGEMENT_TOKEN:management, SUPABASE_PREVIEW_SERVICE_ROLE_KEY:key, PREVIEW_VERIFIED_AUTH_CALLBACK:callback }=process.env;
 if (!management || !key || !callback) throw new Error('Missing trusted operator configuration');
 // Legacy JWT key only: require its project and role claims to match Preview.
 // This is a guard against accidental cross-project credentials, not signature verification.
 let claims; try { claims=JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { throw new Error('Invalid Preview service key'); }
 if (claims?.ref!=='qwngmsedyepghskoagaj' || claims?.role!=='service_role') throw new Error('Invalid Preview service key');
 const client=new pg.Client(validatePreviewConnection(db || ''));
 try {
  await client.connect();
  const identity=await client.query("select current_user as role,current_database() as db,coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) as tls");
  if (identity.rows[0]?.role!=='postgres' || identity.rows[0]?.db!=='postgres' || identity.rows[0]?.tls!==true) throw new Error('Operator connection rejected');
  await client.query('begin');
  // Serialize concurrent operators across the external Auth request.
  await client.query('select id from admin.admin_bootstrap_state where id=true for update');
  const state=await client.query("select (select owner_claimed_at is null and owner_auth_user_id is null from admin.admin_bootstrap_state where id=true) as unclaimed,(select count(*)::int from admin.admin_profiles) as profiles,(select count(*)::int from admin.admin_invitations where invitation_kind='bootstrap' and status='pending' and expires_at>now() and lower(email::text)=lower($1)) as matches,(select count(*)::int from auth.users where lower(email)=lower($1)) as users",[OWNER_EMAIL]);
  const s=state.rows[0]; if (!s?.unclaimed || s.profiles!==0 || s.matches!==1 || s.users!==0) throw new Error('Bootstrap state requires operator review');
  const response=await fetch('https://api.supabase.com/v1/projects/qwngmsedyepghskoagaj/config/auth',{headers:{Authorization:`Bearer ${management}`},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Auth configuration unavailable');
  validateAuthInviteConfig(await response.json(),callback);
  if (mode[0]==='--dry-run') { console.log('Preview Auth invitation dry run passed; no email requested.'); return; }
  const supabase=createClient(PREVIEW_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  await sendAuthInvite(supabase.auth,callback);
  console.log('Preview Auth accepted the invitation request. Email delivery and acceptance are NOT verified.');
 } finally { await client.query('rollback').catch(()=>{}); await client.end().catch(()=>{}); }
}
main().catch(()=>{ console.error('Preview Auth invitation was not confirmed. Check configuration and state privately; inspect before retrying an uncertain request.'); process.exitCode=1; });
