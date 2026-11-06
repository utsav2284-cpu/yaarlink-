import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { citext } from '@electric-sql/pglite/contrib/citext';

// PGlite has no TLS socket. Replace only that assertion in this synthetic
// replay; real TLS and connection checks must be tested independently.
test('candidate management operator is postgres-only, single-use and audited', async () => {
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
  const sql=await readFile('supabase/production/0002_management_owner_operator.sql','utf8');
  assert.match(sql,/pg_catalog\.pg_stat_ssl/);
  assert.match(sql,/session_user <> 'postgres'/);
  const replay=sql.replace("not coalesce((select ssl from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid()),false)", 'false')
    .replaceAll('utsavkumar20518@gmail.com','synthetic@example.invalid');
  assert.notEqual(replay,sql);
  await db.exec(replay);
  const grants=await db.query(`select has_function_privilege('anon','admin.provision_first_owner_operator(bytea)','execute') as anon, has_function_privilege('authenticated','admin.provision_first_owner_operator(bytea)','execute') as authenticated, has_function_privilege('service_role','admin.provision_first_owner_operator(bytea)','execute') as service_role`);
  assert.deepEqual(grants.rows[0],{anon:false,authenticated:false,service_role:false});
  await assert.rejects(db.query("select admin.provision_first_owner_operator(decode('00','hex'))"),/invalid_input/);
  assert.equal((await db.query("select admin.provision_first_owner_operator(decode(repeat('ab',32),'hex')) as ok")).rows[0].ok,true);
  assert.equal((await db.query("select count(*)::int as n from admin.admin_invitations where email='synthetic@example.invalid' and status='pending'")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int as n from audit.audit_log where action='bootstrap.invitation_created'")).rows[0].n,1);
  await assert.rejects(db.query("select admin.provision_first_owner_operator(decode(repeat('cd',32),'hex'))"),/bootstrap_requires_operator_review/);
 } finally { await db.close(); }
});
