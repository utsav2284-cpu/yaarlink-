import test from 'node:test';
import assert from 'node:assert/strict';

// proxy.ts imports next/server, which is not resolvable under --experimental-
// strip-types outside the Next build. This mirrors the two pure predicates
// verbatim; the live header behaviour is asserted with curl against the
// running server (see the preview verification notes).
function effectiveRequestHost(headers) {
  return (
    (headers['x-forwarded-host'] || '').split(',')[0]?.trim() ||
    (headers.host || '').trim() ||
    'localhost'
  );
}

function isPreviewProxyHost(headers) {
  const host = effectiveRequestHost(headers).toLowerCase().split(':')[0];
  return host === 'e2b.app' || host.endsWith('.e2b.app');
}

function frameAncestors(headers) {
  return isPreviewProxyHost(headers)
    ? "frame-ancestors 'self' https://*.e2b.app"
    : "frame-ancestors 'none'";
}

test('production hosts keep the deny-all frame policy', () => {
  for (const headers of [
    { host: 'www.theyaar.com' },
    { host: 'theyaar.com', 'x-forwarded-host': 'theyaar.com' },
    { host: 'yaarlink-cgti0fvfq-utsav-936a.vercel.app', 'x-forwarded-host': 'yaarlink-cgti0fvfq-utsav-936a.vercel.app' },
    { host: 'localhost:3000' },
    {},
  ]) {
    assert.equal(frameAncestors(headers), "frame-ancestors 'none'", `host ${JSON.stringify(headers)}`);
  }
});

test('only the Arena preview proxy host may be framed', () => {
  assert.equal(frameAncestors({ host: '3000-abc123.e2b.app' }), "frame-ancestors 'self' https://*.e2b.app");
  assert.equal(frameAncestors({ 'x-forwarded-host': '3000-abc123.e2b.app' }), "frame-ancestors 'self' https://*.e2b.app");
});

test('lookalike hosts that merely contain e2b.app are not treated as the proxy', () => {
  for (const host of [
    'e2b.app.evil.test',
    'evil-e2b.app.test',
    'notareale2b.app',
    'theyaar.com.e2b.app.attacker.io',
  ]) {
    assert.equal(frameAncestors({ host }), "frame-ancestors 'none'", host);
  }
});

test('a spoofed x-forwarded-host only relaxes framing when it is the proxy itself', () => {
  // The proxy already trusts x-forwarded-host for the CSP report endpoint, so
  // this adds no new trust; it must not, however, match arbitrary suffixes.
  assert.equal(frameAncestors({ host: 'www.theyaar.com', 'x-forwarded-host': 'x.e2b.app' }), "frame-ancestors 'self' https://*.e2b.app");
  assert.equal(frameAncestors({ host: 'x.e2b.app', 'x-forwarded-host': 'www.theyaar.com' }), "frame-ancestors 'none'");
});
