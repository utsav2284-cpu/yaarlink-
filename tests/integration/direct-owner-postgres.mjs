// Genuine PostgreSQL locking test with synthetic Auth. By default it uses a
// production-derived schema surrogate. Opt-in Preview replay uses sanitized
// historical records plus later repo migrations. Neither is real Supabase Auth.
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
 const preview = process.env.YAARLINK_RECONSTRUCT_PREVIEW === 'true';
 if (preview) {
  await admin.query("do $$begin if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator; end if; end$$");
  const history=['20261105193208','20261105193227','20261105193246','20261105195049','20261105195123','20261105195921','20261105195948','20261105200100'].map(n=>`test-infra/preview-history/${n}.sql`);
  const later=['202611060001_admin_preview_least_privilege','202611060002_admin_preview_register_session','202611060003_admin_preview_bootstrap_hardening','202611060004_admin_preview_creator_pending_by_default','202611060005_admin_preview_recovery_controls','202611060006_admin_preview_recovery_runtime','202611060007_admin_preview_recovery_runtime_monotonic','202611060008_admin_preview_recovery_fresh_totp','202611060009_admin_preview_bootstrap_preflight','202611060010_admin_preview_bootstrap_public_status','202611060011_admin_preview_marketplace_review'].map(n=>`supabase/migrations/${n}.sql`);
  for (const path of [...history,...later]) {
   let sql=await readFile(path,'utf8');
   if(path.includes('202611060006_')) {
    const role=await admin.query("select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='preview_recovery_runtime'");
    if(role.rowCount) {
     assert.deepEqual(role.rows[0],{rolcanlogin:false,rolsuper:false,rolbypassrls:false});
     sql=sql.replace('create role preview_recovery_runtime nologin noinherit nobypassrls;','');
    }
   }
   await admin.query(sql);
  }
 } else {
  await admin.query(await readFile('supabase/production/0001_admin_marketplace.sql','utf8'));
  await admin.query('grant usage on schema admin to authenticated');
 }
 await admin.query(await readFile('supabase/candidates/preview_direct_google_owner.sql','utf8'));
 if (preview) {
  const inventory=await admin.query("select n.nspname as schema_name,count(*)::int as table_count,count(*) filter(where c.relrowsecurity)::int as rls_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('admin','audit','security','preview','ops') and c.relkind in ('r','p') and c.relname <> 'first_owner_setup_authorizations' group by n.nspname order by n.nspname");
  assert.deepEqual(inventory.rows,[{schema_name:'admin',table_count:15,rls_tables:15},{schema_name:'audit',table_count:2,rls_tables:2},{schema_name:'ops',table_count:3,rls_tables:3},{schema_name:'preview',table_count:14,rls_tables:14},{schema_name:'security',table_count:3,rls_tables:3}]);
  const columns=await admin.query("select n.nspname as schema_name,md5(string_agg(c.relname||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text,E'\\n' order by c.relname,a.attnum)) as columns_md5,count(*)::int as column_count from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('admin','audit','security','preview','ops') and c.relkind in ('r','p','v') and c.relname<>'first_owner_setup_authorizations' and a.attnum>0 and not a.attisdropped group by n.nspname order by n.nspname");
  assert.deepEqual(columns.rows,[{schema_name:'admin',columns_md5:'72db113641b33f214edd11f8828a948d',column_count:136},{schema_name:'audit',columns_md5:'6733e310b9173fac9c533d0524ac7b52',column_count:23},{schema_name:'ops',columns_md5:'dc53677325fb3b77edb820018fbcd43f',column_count:25},{schema_name:'preview',columns_md5:'f4fa740cc34ec34883ba9a8903281ad9',column_count:123},{schema_name:'security',columns_md5:'18a1c81951eef1500700315b6e89b524',column_count:29}]);
  const counts=await admin.query("select n.nspname as schema_name,count(distinct c.oid) filter(where c.contype in ('p','f','c','u','x'))::int as constraints,count(distinct t.oid) filter(where not t.tgisinternal)::int as triggers,count(distinct p.oid)::int as policies from pg_class cl join pg_namespace n on n.oid=cl.relnamespace left join pg_constraint c on c.conrelid=cl.oid left join pg_trigger t on t.tgrelid=cl.oid left join pg_policy p on p.polrelid=cl.oid where n.nspname in ('admin','audit','security','preview','ops') and cl.relkind in ('r','p') and cl.relname<>'first_owner_setup_authorizations' group by n.nspname order by n.nspname");
  assert.deepEqual(counts.rows,[{schema_name:'admin',constraints:61,triggers:2,policies:24},{schema_name:'audit',constraints:6,triggers:0,policies:1},{schema_name:'ops',constraints:6,triggers:0,policies:3},{schema_name:'preview',constraints:54,triggers:0,policies:14},{schema_name:'security',constraints:12,triggers:0,policies:4}]);
  const constraints=await admin.query("select n.nspname as schema_name,md5(string_agg(cl.relname||'|'||c.conname||'|'||pg_get_constraintdef(c.oid),E'\\n' order by cl.relname,c.conname)) as constraints_md5 from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname in ('admin','audit','security','preview','ops') and cl.relname<>'first_owner_setup_authorizations' and c.contype in ('p','f','c','u','x') group by n.nspname order by n.nspname");
  assert.deepEqual(constraints.rows,[{schema_name:'admin',constraints_md5:'05598f6fcfb20c712cf8f0267928a846'},{schema_name:'audit',constraints_md5:'3c245c35157ca2aea6a8cd34ee0cd321'},{schema_name:'ops',constraints_md5:'d5e419b0aa4abe22d07bfa034787572c'},{schema_name:'preview',constraints_md5:'a9ded670d80f1eb500409c5e88ba7a2c'},{schema_name:'security',constraints_md5:'94c284a19f8d975ec89392bc7cc001ae'}]);
  // Checksums compare names, commands and predicate expressions only—not roles,
  // ACLs or security properties. They are drift indicators, not security proof.
  const policies=await admin.query("select n.nspname as schema_name,md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\\n' order by c.relname,p.polname)) as policy_md5 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('admin','audit','security','preview','ops') group by n.nspname order by n.nspname");
  assert.deepEqual(policies.rows,[{schema_name:'admin',policy_md5:'61e533eb1ccf49792befb1ad3b958486'},{schema_name:'audit',policy_md5:'4bc6be1d6c492b2ce7d65d98edbce5e0'},{schema_name:'ops',policy_md5:'82ce8e486858dd34790f2eb7b8865bed'},{schema_name:'preview',policy_md5:'e6ab0d36592c1e2cec5af847e5a21167'},{schema_name:'security',policy_md5:'2a83f40c63863cfbf4e6b8c657aad6f6'}]);
  const grants=await admin.query("select n.nspname as schema_name,md5(string_agg(c.relname||'|'||case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||'|'||a.privilege_type,E'\\n' order by c.relname,(case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end),a.privilege_type)) as table_acl_md5,count(*)::int as grants from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl) a where n.nspname in ('admin','audit','security','preview','ops') and c.relkind in ('r','p','v') and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role','preview_recovery_runtime')) group by n.nspname order by n.nspname");
  assert.deepEqual(grants.rows,[{schema_name:'admin',table_acl_md5:'32842e29b6f4baa94fd6a970b321e909',grants:2},{schema_name:'ops',table_acl_md5:'8d4d8aff743a75f1f8d9c4d9111e0989',grants:9},{schema_name:'preview',table_acl_md5:'11b38a63219cf3098e3732956e7fe623',grants:2}]);
  const claimGrants=await admin.query("select has_function_privilege('anon','admin.claim_direct_google_first_owner(text,text)','execute') as anon,has_function_privilege('service_role','admin.claim_direct_google_first_owner(text,text)','execute') as service,has_function_privilege('authenticated','admin.claim_direct_google_first_owner(text,text)','execute') as direct,has_function_privilege('authenticated','admin.claim_invited_first_owner(text,text)','execute') as old_wrapper,has_function_privilege('authenticated','admin.claim_first_owner(text)','execute') as old_core");
  assert.deepEqual(claimGrants.rows[0],{anon:false,service:false,direct:true,old_wrapper:false,old_core:false});
 }
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
 console.log(preview ? 'PASS: real PostgreSQL Preview-history replay and concurrent claim; Auth tables and JWT are synthetic.' : 'PASS: genuine PostgreSQL concurrent-claim lock test, synthetic Auth and schema surrogate only.');
} finally { await Promise.allSettled([first.end(),second.end(),admin.end()]); }
