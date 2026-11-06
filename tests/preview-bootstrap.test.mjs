import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePreviewConnection, validateInput, provision } from '../scripts/lib/preview-bootstrap.mjs';
const good = 'postgresql://postgres:example@db.qwngmsedyepghskoagaj.supabase.co:5432/postgres';
test('operator connection only accepts the Preview host and verified TLS', () => {
  assert.equal(validatePreviewConnection(good).ssl.rejectUnauthorized, true);
  for (const uri of [good.replace('qwngmsedyepghskoagaj','other'), good+'?sslmode=disable', good.replace('postgres:example','authenticated:example'), good.replace('/postgres','/other')]) assert.throws(() => validatePreviewConnection(uri));
});
test('input validation, explicit mode and protected output path', () => {
  assert.throws(() => validateInput('bad', 'ticket', '/tmp/token', false));
  assert.throws(() => validateInput('a@example.invalid', 'ticket', 'relative', false));
  assert.equal(validateInput('A@example.invalid','ticket',null,true).email, 'a@example.invalid');
});
function fakeClient({ claimed = false, pending = false, failInsert = false } = {}) {
  const calls = [];
  return { calls, async query(sql, params) { calls.push([sql,params]);
    if (sql.startsWith('select current_user')) return {rows:[{role:'postgres',db:'postgres',tls:true}]};
    if (sql.startsWith('select owner_claimed')) return {rows:[{owner_claimed_at:claimed ? new Date() : null}]};
    if (sql.startsWith('select exists')) return {rows:[{exists:pending}]};
    if (sql.startsWith('insert') && failInsert) throw new Error('failure');
    if (sql.startsWith('insert')) return {rows:[{id:'synthetic-invitation'}]};
    return {rows:[]};
  }};
}
test('dry-run rolls back without generating a token or inserting', async () => {
  const c = fakeClient(); let wrote = false;
  await provision(c,{email:'test@example.invalid',reference:'ticket',dryRun:true}, {writeToken:async()=>{wrote=true;}});
  assert.equal(wrote,false); assert.equal(c.calls.at(-1)[0],'rollback'); assert.equal(c.calls.some(([q])=>q.startsWith('insert')),false);
});
test('synthetic provisioning stores a hash, not the token, and commits once', async () => {
  const c=fakeClient(); let token;
  await provision(c,{email:'test@example.invalid',reference:'ticket',tokenFile:'/tmp/test',dryRun:false}, {writeToken:async (_p,t)=>{token=t;}});
  const insert=c.calls.find(([q])=>q.startsWith('insert'));
  assert.match(token,/^[a-f0-9]{64}$/); assert.deepEqual(insert[1][2],createHash('sha256').update(Buffer.from(token,'hex')).digest());
  assert.equal(c.calls.at(-1)[0],'commit');
});
test('claimed and pending states deny provisioning; insertion failure removes token', async () => {
  for (const config of [{claimed:true},{pending:true}]) await assert.rejects(provision(fakeClient(config),{email:'a@example.invalid',reference:'ticket',dryRun:true}));
  let removed=false; await assert.rejects(provision(fakeClient({failInsert:true}),{email:'a@example.invalid',reference:'ticket',tokenFile:'/tmp/test',dryRun:false},{writeToken:async()=>{},removeToken:async()=>{removed=true;}})); assert.equal(removed,true);
});

test('token file is encrypted to an operator-provided RSA public key', async () => {
  const dir=await mkdtemp(join(tmpdir(),'bootstrap-test-'));
  try {
    const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    const keyFile=join(dir,'public.pem'), out=join(dir,'token.enc');
    await writeFile(keyFile,publicKey.export({type:'spki',format:'pem'}));
    const c=fakeClient();
    const fingerprint=createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
    await assert.rejects(provision(fakeClient(),{email:'test@example.invalid',reference:'ticket',tokenFile:out,publicKeyFile:keyFile,expectedFingerprint:'0'.repeat(64),dryRun:false}));
    await provision(c,{email:'test@example.invalid',reference:'ticket',tokenFile:out,publicKeyFile:keyFile,expectedFingerprint:fingerprint,dryRun:false});
    const encrypted=await readFile(out);
    assert.equal((await stat(out)).mode & 0o777,0o600);
    const plain=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},encrypted).toString();
    assert.match(plain,/^[a-f0-9]{64}$/);
    assert.equal(encrypted.includes(Buffer.from(plain)),false);
    assert.deepEqual(c.calls.find(([q])=>q.startsWith('insert'))[1][2],createHash('sha256').update(Buffer.from(plain,'hex')).digest());
  } finally { await rm(dir,{recursive:true,force:true}); }
});
