import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Contract tests only: the Auth hook event is synthetic, not proof of Google
// provenance, Supabase hook ordering, or any behavior in the hosted project.
test('candidate signup hook is default-deny and executable only by Auth', async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
   create schema admin;
   create table admin.admin_bootstrap_state(id boolean primary key,owner_claimed_at timestamptz,owner_auth_user_id uuid,bootstrap_disabled_at timestamptz);
   create table admin.first_owner_setup_authorizations(id boolean primary key,email text,consumed_at timestamptz,expires_at timestamptz);
   insert into admin.admin_bootstrap_state(id) values (true);
   insert into admin.first_owner_setup_authorizations values (true,'trial@example.invalid',null,now()+interval '1 hour');`);
  await db.exec(await readFile('supabase/candidates/preview_direct_owner_signup_hook.sql','utf8'));
  const privileges=(await db.query(`select has_function_privilege('anon','public.hook_direct_owner_signup(jsonb)','execute') as anon, has_function_privilege('authenticated','public.hook_direct_owner_signup(jsonb)','execute') as authenticated, has_function_privilege('service_role','public.hook_direct_owner_signup(jsonb)','execute') as service, has_function_privilege('supabase_auth_admin','public.hook_direct_owner_signup(jsonb)','execute') as auth`)).rows[0];
  assert.deepEqual(privileges,{anon:false,authenticated:false,service:false,auth:true});
  await db.exec('set role supabase_auth_admin');
  const run=async (provider,email)=> (await db.query('select public.hook_direct_owner_signup($1::jsonb) as result',[JSON.stringify({user:{email,app_metadata:{provider}}})])).rows[0].result;
  assert.deepEqual(await run('google','TRIAL@example.invalid'),{});
  for (const [provider,email] of [['email','trial@example.invalid'],['google','other@example.invalid'],['google',''],['','trial@example.invalid']]) assert.equal((await run(provider,email)).error.http_code,403);
  await db.exec('reset role; update admin.first_owner_setup_authorizations set expires_at=now()-interval \'1 second\'; set role supabase_auth_admin');
  assert.equal((await run('google','trial@example.invalid')).error.http_code,403);
  await db.exec("reset role; update admin.first_owner_setup_authorizations set expires_at=now()+interval '1 hour'; update admin.admin_bootstrap_state set bootstrap_disabled_at=now(); set role supabase_auth_admin");
  assert.equal((await run('google','trial@example.invalid')).error.http_code,403);
 } finally { await db.close(); }
});
