// Genuine PostgreSQL locking test with synthetic Auth and a production-derived
// schema surrogate. Not a Supabase Auth, actual Preview schema, or OAuth test.
// The DB must be a fresh, explicitly named throwaway local database. This test
// permanently claims its synthetic owner slot; it never resets or drops it.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = process.env.YAARLINK_SYNTHETIC_PG_URL ?? '';
const u = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(u.protocol) || u.hostname !== '127.0.0.1' || !u.port || !/^\/yl_claim_race_[0-9a-f]{16}$/.test(u.pathname) || u.username !== 'synthetic_operator' || !u.password || u.search || u.hash || process.env.YAARLINK_SYNTHETIC_PG_CONFIRM !== 'fresh-isolated-cluster') throw new Error('Requires an explicitly confirmed fresh isolated synthetic database.');
const database=u.pathname.slice(1);
const config={host:u.hostname,port:Number(u.port),user:u.username,password:decodeURIComponent(u.password),database,connectionTimeoutMillis:5000};
const admin=new pg.Client(config), first=new pg.Client(config), second=new pg.Client(config);
try {
 await admin.connect();
 const identity=await admin.query("select current_user as role, current_database() as database, exists(select 1 from pg_namespace where nspname in ('admin','auth','audit')) as occupied");
 assert.deepEqual(identity.rows[0],{role:'synthetic_operator',database,occupied:false});
 await admin.query(`do $$ begin
   if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
   if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
   if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
   end $$; create schema extensions; create extension pgcrypto with schema extensions; create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
   create table auth.identities(user_id uuid,provider text,identity_data jsonb);
   create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text);
   create table auth.sessions(id uuid primary key,user_id uuid);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt(),auth.uid() to authenticated,anon;`);
 await admin.query(await readFile('backend/db/drizzle/0000_initial_schema.sql','utf8'));
 await admin.query(await readFile('supabase/production/0001_admin_marketplace.sql','utf8'));
 await admin.query('grant usage on schema admin to authenticated');
 await admin.query(await readFile('supabase/candidates/preview_direct_google_owner.sql','utf8'));
 const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',sid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 await admin.query(`insert into auth.users values ('${uid}','trial@example.invalid',now(),'synthetic');
  insert into auth.identities values ('${uid}','google','{"email":"trial@example.invalid","email_verified":true}');
  insert into auth.mfa_factors values ('cccccccc-cccc-cccc-cccc-cccccccccccc','${uid}','totp','verified');
  insert into auth.sessions values ('${sid}','${uid}');
  insert into admin.first_owner_setup_authorizations(email,token_hash,expires_at) values ('trial@example.invalid',extensions.digest(decode(repeat('ab',32),'hex'),'sha256'),now()+interval '1 hour');`);
 await Promise.all([first.connect(),second.connect()]);
 const q="select admin.claim_direct_google_first_owner('Synthetic',repeat('ab',32)) as id";
 async function waitForLock(pid, observer) {
  for(let i=0;i<40;i++) {
   const r=await observer.query("select wait_event_type='Lock' as locked from pg_stat_activity where pid=$1",[pid]);
   if(r.rows[0]?.locked) return;
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Transaction did not wait for the owner lock');
 }
 // Revoke the live factor while a claim waits for the bootstrap lock.
 await admin.query('begin');
 await admin.query('select 1 from admin.admin_bootstrap_state where id=true for update');
 await second.query('begin');
 await second.query("select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'email','trial@example.invalid','aal','aal2','session_id',$2::text,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true)",[uid,sid]);
 await second.query('set local role authenticated');
 const revoked=second.query(q).then(()=>({status:'unexpected_success'}),e=>({status:'rejected',code:e.message}));
 await waitForLock(second.processID,first);
 await first.query("update auth.mfa_factors set status='unverified'");
 await admin.query('commit');
 const revokedResult=await revoked;
 assert.equal(revokedResult.status,'rejected'); assert.match(revokedResult.code,/verified_totp_required/);
 await second.query('rollback');
 await first.query("update auth.mfa_factors set status='verified'");
 // Hold the owner lock past expiry. PostgreSQL now() is transaction-stable;
 // the candidate must instead recheck wall time once the lock is acquired.
 await admin.query("update admin.first_owner_setup_authorizations set expires_at=clock_timestamp()+interval '2 seconds'");
 await admin.query('begin');
 await admin.query('select 1 from admin.admin_bootstrap_state where id=true for update');
 await second.query('begin');
 await second.query("select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'email','trial@example.invalid','aal','aal2','session_id',$2::text,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true)",[uid,sid]);
 await second.query('set local role authenticated');
 const expired=second.query(q).then(()=>({status:'unexpected_success'}),e=>({status:'rejected',code:e.message}));
 await waitForLock(second.processID,first);
 await new Promise(resolve=>setTimeout(resolve,2300));
 await admin.query('commit');
 const expiredResult=await expired;
 assert.equal(expiredResult.status,'rejected'); assert.match(expiredResult.code,/invalid_setup_authorization/);
 await second.query('rollback');
 await admin.query("update admin.first_owner_setup_authorizations set expires_at=now()+interval '1 hour'");
 for(const c of [first,second]) {
  await c.query('begin');
  await c.query("select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'email','trial@example.invalid','aal','aal2','session_id',$2::text,'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true)",[uid,sid]);
  await c.query('set local role authenticated');
 }
 assert.equal((await first.query(q)).rows[0].id,uid);
 const pid=second.processID;
 const contender=second.query(q).then(()=>({status:'unexpected_success'}),e=>({status:'rejected',code:e.message}));
 // Detect actual PostgreSQL row-lock wait instead of merely assuming overlap.
 await waitForLock(pid,admin);
 await first.query('commit');
 const result=await contender;
 assert.equal(result.status,'rejected'); assert.match(result.code,/bootstrap_locked/);
 await second.query('rollback');
 const state=(await admin.query("select (select count(*)::int from admin.admin_profiles where is_owner and status='active') as owners, (select count(*)::int from audit.audit_log where action='owner.claimed') as audits, (select bootstrap_disabled_at is not null from admin.admin_bootstrap_state where id=true) as locked, (select consumed_at is not null from admin.first_owner_setup_authorizations where id=true) as consumed")).rows[0];
 assert.deepEqual(state,{owners:1,audits:1,locked:true,consumed:true});
 console.log('PASS: genuine PostgreSQL concurrent-claim lock test, synthetic Auth and schema surrogate only.');
} finally { await Promise.allSettled([first.end(),second.end(),admin.end()]); }
