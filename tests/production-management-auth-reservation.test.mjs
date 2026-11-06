import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { citext } from '@electric-sql/pglite/contrib/citext';

// Synthetic replay substitutes only the TLS check (PGlite has no TLS socket)
// and the recipient. It does not prove real Auth email or management delivery.
test('candidate auth invite reservation is one-time, audited, and never grants ownership',async()=>{
 const db=new PGlite({extensions:{pgcrypto,citext}});
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions; create extension pgcrypto with schema extensions; create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text);
   create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
   create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt(),auth.uid() to authenticated,anon;`);
  await db.exec(await readFile('backend/db/drizzle/0000_initial_schema.sql','utf8'));
  await db.exec(await readFile('supabase/production/0001_admin_marketplace.sql','utf8'));
  const sql=await readFile('supabase/production/0003_management_owner_auth_reservation.sql','utf8');
  assert.match(sql,/pg_catalog\.pg_stat_ssl/);
  const replay=sql.replace("not coalesce((select ssl from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid()),false)",'false').replaceAll('utsavkumar20518@gmail.com','synthetic@example.invalid');
  await db.exec(replay);
  const grants=await db.query("select has_function_privilege('anon','admin.reserve_owner_auth_invitation_operator()','execute') as anon,has_function_privilege('authenticated','admin.reserve_owner_auth_invitation_operator()','execute') as authenticated,has_function_privilege('service_role','admin.reserve_owner_auth_invitation_operator()','execute') as service_role");
  assert.deepEqual(grants.rows[0],{anon:false,authenticated:false,service_role:false});
  await assert.rejects(db.query('select admin.reserve_owner_auth_invitation_operator()'),/bootstrap_invitation_unavailable/);
  await db.exec("insert into admin.admin_invitations(email,invitation_kind,intended_role_key,operator_authorization_ref,expires_at,token_hash) values ('synthetic@example.invalid','bootstrap','super_admin','user-approved-production-owner',now()+interval '1 hour',decode(repeat('aa',32),'hex'))");
  assert.equal((await db.query('select admin.reserve_owner_auth_invitation_operator() as ok')).rows[0].ok,true);
  await assert.rejects(db.query('select admin.reserve_owner_auth_invitation_operator()'),/auth_invitation_requires_operator_review/);
  const state=(await db.query('select owner_claimed_at,owner_auth_user_id from admin.admin_bootstrap_state where id=true')).rows[0];
  assert.equal(state.owner_claimed_at,null); assert.equal(state.owner_auth_user_id,null);
  assert.equal((await db.query("select count(*)::int as n from audit.audit_log where action='bootstrap.auth_invitation_reserved'")).rows[0].n,1);
 }finally{await db.close();}
});
