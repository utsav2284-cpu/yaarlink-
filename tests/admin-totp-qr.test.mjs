import test from 'node:test';
import assert from 'node:assert/strict';
import { totpQrImageSource } from '../lib/admin-totp-qr.ts';
test('authenticator SVG is encoded as a non-inline image source', () => {
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
 const src=totpQrImageSource(svg);
 assert.ok(src.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg'));
 assert.equal(src.includes('<script>'),false);
 assert.equal(decodeURIComponent(src.split(',')[1]),svg);
 assert.equal(totpQrImageSource(`data:image/svg+xml;utf-8,${svg}`),src);
 assert.equal(totpQrImageSource(`data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`),src);
});
test('malformed or excessive QR data is rejected', () => {
 for (const input of ['', '<img src=x>', '<svg'+'a'.repeat(100001), null]) assert.throws(()=>totpQrImageSource(input));
});
