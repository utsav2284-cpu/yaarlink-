import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAdminCallback } from '../lib/admin-auth-callback.ts';

function fakeAuth(fail = false) {
  const calls = [];
  const auth = {
    async setSession(value) { calls.push(['session', value]); return { data: { session: fail ? null : {} }, error: fail ? {} : null }; },
    async verifyOtp(value) { calls.push(['otp', value]); return { data: { session: fail ? null : {} }, error: fail ? {} : null }; },
    async exchangeCodeForSession(...value) { calls.push(['code', value]); return { data: { session: fail ? null : {}, redirectType: 'recovery' }, error: fail ? {} : null }; },
    async getUser() { calls.push(['user']); return { data: { user: fail ? null : {} }, error: fail ? {} : null }; },
  };
  return {auth, calls};
}
const url = suffix => new URL(`https://example.test/admin/auth/callback${suffix}`);
test('implicit invite and recovery go to their local password setup pages', async () => {
  for (const flow of ['invite', 'recovery']) {
    const {auth, calls} = fakeAuth();
    assert.equal(await verifyAdminCallback(url(`#type=${flow}&access_token=x&refresh_token=y`), auth), flow === 'invite' ? '/admin/setup/password' : '/admin/reset-password');
    assert.deepEqual(calls.map(c => c[0]), ['session','user']);
  }
});
test('verified confirmation goes to MFA and ignores an external next parameter', async () => {
  const {auth} = fakeAuth();
  assert.equal(await verifyAdminCallback(url('?token_hash=x&type=email&next=https://evil.test'), auth), '/admin/mfa');
});
test('PKCE recovery exchanges code using the flow id', async () => {
  const {auth, calls} = fakeAuth();
  assert.equal(await verifyAdminCallback(url('?code=abc&sb_flow_id=flow'), auth), '/admin/reset-password');
  assert.deepEqual(calls[0], ['code', ['abc', {flowId:'flow'}]]);
});
test('missing, conflicting, invalid and expired credentials fail closed', async () => {
  for (const suffix of ['', '#type=invite&access_token=x', '?token_hash=x&type=magiclink', '?code=x&token_hash=y&type=invite', '#error=access_denied']) {
    await assert.rejects(verifyAdminCallback(url(suffix), fakeAuth().auth));
  }
  await assert.rejects(verifyAdminCallback(url('?token_hash=expired&type=recovery'), fakeAuth(true).auth));
});

test('verified invitation goes to first administrator password setup, never an external destination', async () => {
  const {auth} = fakeAuth();
  assert.equal(await verifyAdminCallback(url('?token_hash=x&type=invite&next=https://evil.test'), auth), '/admin/setup/password');
});
