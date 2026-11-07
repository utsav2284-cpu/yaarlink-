import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeMarketplaceWith } from '../backend/admin-marketplace-authorization.mjs';

const identity = { sub:'synthetic-user', session_id:'synthetic-session', aal:'aal2' };
const verify = async token => { assert.equal(token, 'synthetic-token'); return identity; };

test('checks the exact operation and token on every call', async () => {
  const calls = [];
  const allowed = async (token, permission) => { calls.push([token,permission]); return true; };
  assert.deepEqual(await authorizeMarketplaceWith('synthetic-token','creators.approve',verify,allowed), { sub:identity.sub, session_id:identity.session_id });
  await authorizeMarketplaceWith('synthetic-token','campaigns.publish',verify,allowed);
  assert.deepEqual(calls, [['synthetic-token','creators.approve'], ['synthetic-token','campaigns.publish']]);
});

test('fails closed for unknown permissions, AAL1, unverified identity and denied or failing RPC', async () => {
  let rpcCalls=0;
  const rpc = async () => { rpcCalls++; return true; };
  await assert.rejects(authorizeMarketplaceWith('synthetic-token','admins.invite',verify,rpc), /Not authorized/);
  await assert.rejects(authorizeMarketplaceWith('synthetic-token','creators.approve',async () => ({...identity,aal:'aal1'}),rpc), /Not authorized/);
  await assert.rejects(authorizeMarketplaceWith('synthetic-token','creators.approve',async () => {throw Error('offline');},rpc), /Not authorized/);
  assert.equal(rpcCalls,0);
  for (const response of [false, null, 'true', 1]) {
    await assert.rejects(authorizeMarketplaceWith('synthetic-token','creators.approve',verify,async () => response), /Not authorized/);
  }
  await assert.rejects(authorizeMarketplaceWith('synthetic-token','creators.approve',verify,async () => {throw Error('offline');}), /Not authorized/);
});
