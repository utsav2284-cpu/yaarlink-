import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalAdminTarget,localAdminCspAllowed } from '../lib/admin-local-config.ts';

test('local auth needs explicit opt-in, development and exact browser origin',()=>{
 assert.equal(isLocalAdminTarget(undefined,'production','production','https://example.com'),false);
 assert.equal(isLocalAdminTarget('true','development','development','http://127.0.0.1:3000'),true);
 for (const origin of [undefined,'https://example.com','https://127.0.0.1:3000','http://localhost:3000','http://127.0.0.1:3001']) assert.throws(()=>isLocalAdminTarget('true','development','development',origin));
 for (const env of ['preview','production']) assert.throws(()=>isLocalAdminTarget('true','development',env,'http://127.0.0.1:3000'));
 assert.throws(()=>isLocalAdminTarget('true','production','development','http://127.0.0.1:3000'));
});
test('local CSP exception cannot be selected for hosted or forwarded requests',()=>{
 assert.equal(localAdminCspAllowed('true','development',undefined,'127.0.0.1:3000',null),true);
 assert.equal(localAdminCspAllowed('true','development',undefined,'127.0.0.1:3000','127.0.0.1:3000'),true);
 for (const args of [
  [undefined,'development',undefined,'127.0.0.1:3000',null],
  ['true','production',undefined,'127.0.0.1:3000',null],
  ['true','development','1','127.0.0.1:3000',null],
  ['true','development',undefined,'app.example.com',null],
  ['true','development',undefined,'127.0.0.1:3000','app.example.com'],
 ]) assert.equal(localAdminCspAllowed(...args),false);
});
