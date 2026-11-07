// Synthetic browser integration against a locally running Preview build.
// Auth and RPC responses are mocked; this is NOT a hosted Auth or email test.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const address = process.env.ADMIN_BROWSER_TEST_URL ?? 'http://127.0.0.1:3018';
const origin = new URL(address);
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Browser test requires an isolated local server');
if (!process.env.BROWSER_EXECUTABLE_PATH) throw new Error('Set BROWSER_EXECUTABLE_PATH to a local Chromium executable');
const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const jwt = aal => `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({ sub: '11111111-1111-4111-8111-111111111111', exp: now() + 3600, iat: now(), aal, session_id: '22222222-2222-4222-8222-222222222222', amr: [{ method: 'totp', timestamp: now() }] })}.c3ludGhldGlj`;
let verified = false;
let passwordRequests = 0;
const user = () => ({ id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', factors: verified ? [{ id: '33333333-3333-4333-8333-333333333333', factor_type: 'totp', status: 'verified' }] : [] });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  // Every external request is intercepted; no real invitations or Auth calls.
  await page.route('https://**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    if (url.hostname !== 'qwngmsedyepghskoagaj.supabase.co') return route.abort();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': '*' } });
    let result;
    if (path === '/auth/v1/user' && method === 'GET') result = user();
    else if (path === '/auth/v1/user' && method === 'PUT') { passwordRequests++; result = user(); }
    else if (path === '/auth/v1/factors' && method === 'POST') result = { id: '33333333-3333-4333-8333-333333333333', type: 'totp', totp: { secret: 'TESTSECRET', qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', uri: 'otpauth://totp/test' } };
    else if (path.endsWith('/challenge') && method === 'POST') result = { id: '44444444-4444-4444-8444-444444444444', type: 'totp', expires_at: now() + 300 };
    else if (path.endsWith('/verify') && method === 'POST') { verified = true; result = { access_token: jwt('aal2'), refresh_token: 'synthetic-refresh-2', token_type: 'bearer', expires_in: 3600, user: user() }; }
    else if (path === '/rest/v1/rpc/first_admin_setup_available' && method === 'POST') result = true;
    else return route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, json: { error: 'unmocked request' } });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: result });
  });
  await page.goto(`${origin.origin}/admin/auth/callback`);
  await page.locator('p[role=alert]').waitFor();
  assert.match(await page.locator('p[role=alert]').innerText(), /invalid, expired/);
  await page.goto('about:blank');
  await page.goto(`${origin.origin}/admin/auth/callback#type=invite&access_token=${jwt('aal1')}&refresh_token=synthetic-refresh`);
  await page.waitForURL('**/admin/setup/password');
  assert.match(await page.locator('h1').innerText(), /First administrator setup/);
  assert.equal(new URL(page.url()).hash, '');
  await page.locator('input[type=password]').fill('short');
  await page.getByRole('button', { name: 'Update password' }).click();
  assert.match(await page.locator('p[role=alert]').innerText(), /at least 12/);
  assert.equal(passwordRequests, 0);
  await page.locator('input[type=password]').fill('synthetic-Passw0rd!');
  await page.getByRole('button', { name: 'Update password' }).click();
  await page.waitForURL('**/admin/mfa');
  assert.equal(passwordRequests, 1);
  await page.getByRole('button', { name: 'Enroll authenticator' }).click();
  await page.getByText('Manual key:').waitFor();
  await page.locator('input[inputmode=numeric]').fill('123456');
  await page.getByRole('button', { name: 'Verify & continue' }).click();
  await page.waitForURL('**/admin/setup');
  assert.equal(verified, true);
  console.log('PASS synthetic mocked invitation → password → MFA → setup-token page; no real Auth, email, or owner claim tested');
} finally { await browser.close(); }
