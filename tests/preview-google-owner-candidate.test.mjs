import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Stand-in for the already-tested existing claim boundary; no real Auth,
// Google OAuth, TOTP, recovery, or hosted database is exercised here.
test('candidate Google gate requires confirmed matching identity, password and setup token delegation',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create schema admin;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
   create table auth.identities(user_id uuid,provider text,identity_data jsonb);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   grant usage on schema admin,auth to authenticated; grant execute on function auth.jwt(),auth.uid() to authenticated;
   create function admin.claim_invited_first_owner(name text, token text) returns uuid language plpgsql security definer as $$begin
    if token <> 'synthetic-setup-token' then raise exception 'invalid_invitation'; end if;
    return auth.uid(); end$$;
   grant execute on function admin.claim_invited_first_owner(text,text) to authenticated;
   insert into auth.users values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','synthetic@example.invalid',now(),'');
   select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"synthetic@example.invalid"}',false);`);
  await db.exec(await readFile('supabase/candidates/preview_google_first_owner.sql','utf8'));
  const acl=await db.query("select has_function_privilege('authenticated','admin.claim_invited_first_owner(text,text)','execute') as legacy,has_function_privilege('anon','admin.claim_google_first_owner(text,text)','execute') as anon,has_function_privilege('service_role','admin.claim_google_first_owner(text,text)','execute') as service_role,has_function_privilege('authenticated','admin.claim_google_first_owner(text,text)','execute') as authenticated");
  assert.deepEqual(acl.rows[0],{legacy:false,anon:false,service_role:false,authenticated:true});
  await db.exec('set role authenticated');
  await assert.rejects(db.query("select admin.claim_google_first_owner('Synthetic','synthetic-setup-token')"),/verified_google_identity_and_password_required/);
  await db.exec('reset role');
  await db.exec("update auth.users set encrypted_password='synthetic-hash'; insert into auth.identities values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','google','{\"email\":\"synthetic@example.invalid\",\"email_verified\":false}')");
  await db.exec('set role authenticated');
  await assert.rejects(db.query("select admin.claim_google_first_owner('Synthetic','synthetic-setup-token')"),/verified_google_identity_and_password_required/);
  await db.exec('reset role');
  await db.exec("update auth.identities set identity_data='{\"email\":\"other@example.invalid\",\"email_verified\":true}'");
  await db.exec('set role authenticated');
  await assert.rejects(db.query("select admin.claim_google_first_owner('Synthetic','synthetic-setup-token')"),/verified_google_identity_and_password_required/);
  await db.exec('reset role');
  await db.exec("update auth.identities set identity_data='{\"email\":\"synthetic@example.invalid\",\"email_verified\":true}'");
  await db.exec('set role authenticated');
  await assert.rejects(db.query("select admin.claim_google_first_owner('Synthetic','wrong')"),/invalid_invitation/);
  assert.equal((await db.query("select admin.claim_google_first_owner('Synthetic','synthetic-setup-token') as id")).rows[0].id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 } finally { await db.close(); }
});
