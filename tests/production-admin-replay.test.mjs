import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { citext } from '@electric-sql/pglite/contrib/citext';

function canonical(value) {
 if (value === null || typeof value !== 'object') return JSON.stringify(value);
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
function enc(value) {
 if (value === null) return Buffer.alloc(8,255);
 const b=Buffer.isBuffer(value)?value:Buffer.from(String(value),'utf8'), n=Buffer.alloc(8);
 n.writeBigUInt64BE(BigInt(b.length)); return Buffer.concat([n,b]);
}
function rolesBytes(roles) {
 if (roles === null) return null;
 const sorted=[...new Set(roles)].sort(), n=Buffer.alloc(4); n.writeUInt32BE(sorted.length);
 return Buffer.concat([n,...sorted.map(enc)]);
}
function auditHash(row) {
 const json = value => value === null ? null : canonical(value);
 const fields=[row.id,row.time,row.actor,row.profile,rolesBytes(row.roles),row.action,row.type,row.resource,row.outcome,row.aal,row.ip,row.agent,row.request,json(row.before),json(row.after),row.reason,json(row.metadata)];
 return createHash('sha256').update(Buffer.concat([Buffer.from('yaarlink-audit-v1\0'),Buffer.from(row.prev,'hex'),...fields.map(enc)])).digest('hex');
}
// Local synthetic PostgreSQL replay: this is NOT a real Supabase Auth, browser,
// email, PostgREST or Production integration test.
test('production migration: synthetic first owner, MFA, permissions and marketplace decisions', async () => {
 const db = new PGlite({ extensions:{pgcrypto,citext} });
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions; create extension pgcrypto with schema extensions; create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text);
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt(),auth.uid() to authenticated,anon;
`);
  await db.exec(await readFile('backend/db/drizzle/0000_initial_schema.sql','utf8'));;
  const migration=await readFile('supabase/production/0001_admin_marketplace.sql','utf8');
  await db.exec(migration);
  const vector = await db.query(`select encode(audit.hash_fields(decode(repeat('00',32),'hex'),1,'2026-11-05T00:00:00Z'::timestamptz,'00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000001'::uuid,array['super_admin'],'owner.claimed','admin_bootstrap_state','true','success','aal2','192.0.2.10'::inet,'audit-test-vector/1.0','00000000-0000-4000-8000-000000000002'::uuid,'{}'::jsonb,'{"owner":true}'::jsonb,null,'{}'::jsonb),'hex') as hash`);
  assert.equal(vector.rows[0].hash,'06e5994cb5616437ea5196920ed84c34c33db64636f1a3c3817c9896cf08f187');
  const fixture={prev:'00'.repeat(32),id:1,time:'2026-11-05T00:00:00.000000Z',actor:'00000000-0000-4000-8000-000000000001',profile:'00000000-0000-4000-8000-000000000001',roles:['super_admin'],action:'owner.claimed',type:'admin_bootstrap_state',resource:'true',outcome:'success',aal:'aal2',ip:'192.0.2.10',agent:'audit-test-vector/1.0',request:'00000000-0000-4000-8000-000000000002',before:{},after:{owner:true},reason:null,metadata:{}};
  assert.equal(auditHash(fixture),vector.rows[0].hash);
  await assert.rejects(db.query("select audit._canonical('{\"n\":9007199254740992}'::jsonb)"),/audit_invalid_json_number/);
  const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await db.exec(`insert into auth.users values ('${uid}','synthetic@example.invalid',now());
   insert into auth.mfa_factors values ('cccccccc-cccc-cccc-cccc-cccccccccccc','${uid}','totp','verified');
   insert into admin.admin_invitations(email,invitation_kind,intended_role_key,operator_authorization_ref,expires_at,token_hash) values ('synthetic@example.invalid','bootstrap','super_admin','synthetic-test',now()+interval '1 hour',extensions.digest(decode(repeat('ab',32),'hex'),'sha256'));
   insert into public.users(id,name,email,role,password_hash) values ('55555555-5555-5555-5555-555555555555','Synthetic creator','creator@example.invalid','creator','synthetic-not-a-password'),('66666666-6666-6666-6666-666666666666','Synthetic brand','brand@example.invalid','brand','synthetic-not-a-password');
   insert into public.creators(id,user_id,name,status,verification_status,category,instagram,followers) values ('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','Synthetic','pending','pending','Other','https://www.instagram.com/synthetic/',1234);
   insert into public.campaigns(id,owner_id,title,business_name,status,verification_status,expires_at) values ('22222222-2222-2222-2222-222222222222','66666666-6666-6666-6666-666666666666','Synthetic','Synthetic','pending','pending',now()+interval '1 day');
   select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','email','synthetic@example.invalid','aal','aal2','session_id','${sid}','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,false);
   set role authenticated;`);
  assert.equal((await db.query("select has_function_privilege('anon','public.production_admin_review_queue(text)','execute') as allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated',(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='admin' and p.proname='claim_first_owner'),'execute') as allowed")).rows[0].allowed,false);
  await assert.rejects(db.query("select public.production_admin_review_queue('creator')"),/not_authorized/);
  await assert.rejects(db.query("select admin.claim_first_owner('Synthetic')"));
  assert.equal((await db.query("select public.first_admin_setup_available() as value")).rows[0].value,true);
  assert.equal((await db.query("select public.production_admin_validate_invitation(repeat('ab',32)) as value")).rows[0].value,true);
  await assert.rejects(db.query("select public.production_admin_claim_owner('Synthetic',repeat('cd',32))"),/invalid_invitation/);
  await db.exec(`select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','email','synthetic@example.invalid','aal','aal1','session_id','${sid}')::text,false);`);
  await assert.rejects(db.query("select public.production_admin_claim_owner('Synthetic',repeat('ab',32))"),/aal2_required/);
  await db.exec(`select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','email','synthetic@example.invalid','aal','aal2','session_id','${sid}','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,false);`);
  await db.query("select public.production_admin_claim_owner('Synthetic',repeat('ab',32))");
  assert.equal((await db.query("select public.first_admin_setup_available() as value")).rows[0].value,false);
  await assert.rejects(db.query("select public.production_admin_claim_owner('Synthetic',repeat('ab',32))"),/bootstrap_locked/);
  assert.equal((await db.query("select jsonb_array_length(public.production_admin_review_queue('creator')) as n")).rows[0].n,1);
  await db.query("select public.production_admin_review_decision('creator','11111111-1111-1111-1111-111111111111','approve',null)");
  await db.query("select public.production_admin_review_decision('campaign','22222222-2222-2222-2222-222222222222','approve',null)");
  await assert.rejects(db.query("select public.production_admin_review_decision('creator','11111111-1111-1111-1111-111111111111','approve',null)"),/invalid_transition/);
  await db.exec(`select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','aal','aal2','session_id','dddddddd-dddd-dddd-dddd-dddddddddddd')::text,false);`);
  await assert.rejects(db.query("select public.production_admin_review_queue('creator')"),/not_authorized/);
  await db.exec(`select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','aal','aal1','session_id','${sid}')::text,false);`);
  await assert.rejects(db.query("select public.production_admin_review_queue('creator')"),/not_authorized/);
  await db.exec('reset role');
  assert.equal((await db.query("select status from public.campaigns where id='22222222-2222-2222-2222-222222222222'")).rows[0].status,'open');
  assert.equal((await db.query("select verified_followers from public.creators where id='11111111-1111-1111-1111-111111111111'")).rows[0].verified_followers,1234);
  await db.query("insert into public.applications(campaign_id,user_id,creator_id,creator_name,status) select c.id,u.id,cr.id,cr.name,'applied' from public.campaigns c cross join public.users u join public.creators cr on cr.user_id=u.id where c.id='22222222-2222-2222-2222-222222222222' and c.status='open' and c.verification_status='verified' and c.expires_at>now() and cr.status='approved' and cr.verification_status='verified'");
  assert.equal((await db.query("select count(*)::int as n from public.applications")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int as n from audit.audit_log where action like 'marketplace.%'")).rows[0].n,2);
  const rows=(await db.query(`select id,encode(prev_hash,'hex') as prev,encode(row_hash,'hex') as hash,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as time,actor_auth_user_id as actor,actor_profile_id as profile,actor_role_snapshot as roles,action,resource_type as type,resource_id as resource,outcome,aal_at_action as aal,host(ip) as ip,user_agent as agent,request_id as request,before_state as before,after_state as after,reason,metadata from audit.audit_log order by id`)).rows;
  let prev='00'.repeat(32); for (const row of rows) { assert.equal(row.prev,prev); assert.equal(auditHash(row),row.hash); prev=row.hash; }
  assert.equal((await db.query("select encode(last_row_hash,'hex') as hash from audit.audit_chain_head")).rows[0].hash,prev);
  // No live factor, revoked role, and revoked session each independently deny.
  await db.exec(`insert into auth.users values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','no-factor@example.invalid',now());
   insert into admin.admin_profiles(auth_user_id,display_name,email_snapshot,status,invitation_kind) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','No factor','no-factor@example.invalid','active','admin_invite');
   insert into admin.admin_role_assignments(auth_user_id,role_key) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','super_admin');
   insert into admin.admin_session_registry(session_id,auth_user_id,aal_at_issue) values ('ffffffff-ffff-ffff-ffff-ffffffffffff','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aal2');
   select set_config('request.jwt.claims',jsonb_build_object('sub','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aal','aal2','session_id','ffffffff-ffff-ffff-ffff-ffffffffffff')::text,false); set role authenticated;`);
  await assert.rejects(db.query("select public.production_admin_review_queue('creator')"),/not_authorized/);
  await db.exec(`reset role; update admin.admin_role_assignments set is_current=false,revoked_at=now(),revoke_reason='revoked' where auth_user_id='${uid}'; select set_config('request.jwt.claims',jsonb_build_object('sub','${uid}','aal','aal2','session_id','${sid}')::text,false); set role authenticated;`);
  await assert.rejects(db.query("select public.production_admin_review_queue('creator')"),/not_authorized/);
  await db.exec(`reset role; update admin.admin_role_assignments set is_current=true,revoked_at=null,revoke_reason=null where auth_user_id='${uid}'; update admin.admin_session_registry set revoked_at=now(),revoke_reason='test' where session_id='${sid}'; set role authenticated;`);
  await assert.rejects(db.query("select public.production_admin_review_queue('creator')"),/not_authorized/);
  await assert.rejects(db.query("select public.production_admin_register_session()"),/session_revoked_or_mismatch/);
 } finally { await db.close(); }
});
