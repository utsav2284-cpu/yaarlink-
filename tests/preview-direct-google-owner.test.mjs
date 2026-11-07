import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {citext} from '@electric-sql/pglite/contrib/citext';

// Offline synthetic Postgres replay only. This deliberately does not claim a
// hosted owner slot and cannot prove OAuth, Supabase Auth or browser behavior.
test('direct owner candidate rejects wrong identity, missing password, AAL1, bad token and replay',async()=>{
 const db=new PGlite({extensions:{pgcrypto,citext}});
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions; create extension pgcrypto with schema extensions; create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
   create table auth.identities(user_id uuid,provider text,identity_data jsonb);
   create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text);
   create table auth.sessions(id uuid primary key,user_id uuid);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt(),auth.uid() to authenticated,anon;`);
  await db.exec(await readFile('backend/db/drizzle/0000_initial_schema.sql','utf8'));
  await db.exec(await readFile('supabase/production/0001_admin_marketplace.sql','utf8'));
  await db.exec('grant usage on schema admin to authenticated'); // Preview least-privilege migration
  await db.exec(await readFile('supabase/candidates/preview_direct_google_owner.sql','utf8'));
  const acl=(await db.query("select has_function_privilege('anon','admin.claim_direct_google_first_owner(text,text)','execute') as anon,has_function_privilege('service_role','admin.claim_direct_google_first_owner(text,text)','execute') as service,has_function_privilege('authenticated','admin.claim_direct_google_first_owner(text,text)','execute') as authenticated")).rows[0];
  assert.deepEqual(acl,{anon:false,service:false,authenticated:true});
  const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',sid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await db.exec(`insert into auth.users values ('${uid}','synthetic@example.invalid',now(),'');
   insert into auth.identities values ('${uid}','google','{"email":"synthetic@example.invalid","email_verified":true}');
   insert into auth.mfa_factors values ('cccccccc-cccc-cccc-cccc-cccccccccccc','${uid}','totp','verified');
   insert into auth.sessions values ('${sid}','${uid}');
   insert into admin.first_owner_setup_authorizations(email,token_hash,expires_at) values ('synthetic@example.invalid',extensions.digest(decode(repeat('ab',32),'hex'),'sha256'),now()+interval '1 hour');
   select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','email','synthetic@example.invalid','aal','aal2','session_id','${sid}','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,false);
   set role authenticated;`);
  const call="select admin.claim_direct_google_first_owner('Synthetic',repeat('ab',32)) as id";
  await assert.rejects(db.query(call),/verified_google_identity_and_password_required/);
  await db.exec("reset role; update auth.users set encrypted_password='synthetic-hash'; update auth.identities set identity_data='{\"email\":\"synthetic@example.invalid\",\"email_verified\":false}'; set role authenticated");
  await assert.rejects(db.query(call),/verified_google_identity_and_password_required/);
  await db.exec("reset role; update auth.identities set identity_data='{\"email\":\"synthetic@example.invalid\",\"email_verified\":true}'; set role authenticated");
  await db.exec(`select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','email','synthetic@example.invalid','aal','aal1','session_id','${sid}')::text,false)`);
  await assert.rejects(db.query(call),/aal2_required/);
  await db.exec(`select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','email','synthetic@example.invalid','aal','aal2','session_id','${sid}','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now()-interval '11 minutes')::bigint)))::text,false)`);
  await assert.rejects(db.query(call),/fresh_totp_required/);
  await db.exec(`select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','email','synthetic@example.invalid','aal','aal2','session_id','${sid}','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,false)`);
  await db.exec("reset role; update auth.mfa_factors set status='unverified'; set role authenticated");
  await assert.rejects(db.query(call),/verified_totp_required/);
  await db.exec("reset role; update auth.mfa_factors set status='verified'; set role authenticated");
  await assert.rejects(db.query("select admin.claim_direct_google_first_owner('Synthetic',repeat('cd',32))"),/invalid_setup_authorization/);
  // A late failure must roll back the authorization consumption and owner lock.
  await db.exec("reset role; create function audit.test_abort() returns trigger language plpgsql as $$begin raise exception 'synthetic_audit_failure'; end$$; create trigger test_abort before insert on audit.audit_log for each row execute function audit.test_abort(); set role authenticated");
  await assert.rejects(db.query(call),/synthetic_audit_failure/);
  await db.exec('reset role');
  assert.equal((await db.query('select consumed_at is null as unused from admin.first_owner_setup_authorizations')).rows[0].unused,true);
  assert.equal((await db.query('select owner_claimed_at is null as unclaimed from admin.admin_bootstrap_state')).rows[0].unclaimed,true);
  assert.equal((await db.query('select count(*)::int as n from admin.admin_profiles')).rows[0].n,0);
  await db.exec('drop trigger test_abort on audit.audit_log; drop function audit.test_abort(); set role authenticated');
  assert.equal((await db.query(call)).rows[0].id,uid);
  await assert.rejects(db.query(call),/bootstrap_locked/);
  await db.exec('reset role');
  const state=(await db.query('select owner_auth_user_id,bootstrap_disabled_at is not null as locked from admin.admin_bootstrap_state where id=true')).rows[0];
  assert.deepEqual(state,{owner_auth_user_id:uid,locked:true});
  assert.equal((await db.query("select count(*)::int as n from audit.audit_log where action='owner.claimed'")).rows[0].n,1);
 }finally{await db.close();}
});
