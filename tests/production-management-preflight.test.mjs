import test from 'node:test';
import assert from 'node:assert/strict';
import { managementPreflight, MANAGEMENT_QUERY_URL, PREFLIGHT_QUERY } from '../scripts/lib/production-management-preflight.mjs';

test('fixed project management preflight requires postgres, backend TLS, lock, no pending invitation and rollback', async () => {
 let request;
 const result = await managementPreflight('synthetic-token', { send: async (url, options) => {
  request = { url, options };
  return { ok: true, json: async () => [{ result:'production_management_preflight_pass' }] };
 }});
 assert.deepEqual(result, { status:'pass', changes:false });
 assert.equal(request.url, MANAGEMENT_QUERY_URL);
 assert.equal(request.options.redirect, 'error');
 assert.deepEqual(JSON.parse(request.options.body), { query:PREFLIGHT_QUERY });
 for (const clause of ['pg_stat_ssl', 'current_user', 'for update', "status='pending'", 'rollback;']) assert.ok(PREFLIGHT_QUERY.includes(clause));
 assert.doesNotMatch(PREFLIGHT_QUERY, /\b(insert|update\s+admin|delete|commit)\b/i);
});

test('fails closed for TLS bypass, invalid token, failure and unexpected response', async () => {
 let called = false;
 const send = async () => { called = true; return {ok:false}; };
 for (const token of ['', 'a\nb', null]) await assert.rejects(managementPreflight(token, {send}));
 await assert.rejects(managementPreflight('test', {send,tlsDisabled:true}));
 assert.equal(called, false);
 await assert.rejects(managementPreflight('test', {send}));
 for (const data of [[], [{result:'other'}], {result:'production_management_preflight_pass'}]) {
  await assert.rejects(managementPreflight('test', {send:async()=>({ok:true,json:async()=>data})}));
 }
});
