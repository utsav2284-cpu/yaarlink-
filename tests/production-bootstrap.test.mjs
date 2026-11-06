import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConnection, productionOwnerInput, provisionProductionOwner, AUTHORIZED_OWNER } from '../scripts/lib/production-bootstrap.mjs';

const url='postgresql://postgres:synthetic@db.dqhxgwzjwzvpqiilteld.supabase.co:5432/postgres';
test('Production operator connection is pinned, direct, and TLS verified', () => {
 const config=validateProductionConnection(url);
 assert.equal(config.host,'db.dqhxgwzjwzvpqiilteld.supabase.co');
 assert.equal(config.ssl.rejectUnauthorized,true);
 for(const value of ['',url.replace('dqhxgwzjwzvpqiilteld','qwngmsedyepghskoagaj'),url.replace('supabase.co','supabase.co.evil.test'),`${url}?sslmode=disable`,url.replace('postgres:synthetic','app:synthetic')]) assert.throws(()=>validateProductionConnection(value));
});
test('owner recipient is fixed, with separate execute-mode key requirements', async () => {
 const input=productionOwnerInput('synthetic-test',null,true,null,null);
 assert.equal(input.email,AUTHORIZED_OWNER);
 assert.throws(()=>productionOwnerInput('synthetic-test',null,false,null,null));
 await assert.rejects(provisionProductionOwner({}, {...input,email:'another@example.invalid'}), /recipient/);
 await assert.rejects(provisionProductionOwner({}, {...input,dryRun:'false'}), /recipient/);
});
