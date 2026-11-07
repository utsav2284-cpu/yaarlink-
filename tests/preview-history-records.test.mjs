import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Read-only comparison values from Preview migration metadata; MD5 detects
// transcription errors, not malicious tampering or hosted schema drift.
const records={
 '20261105193208':'a774b70b61996b5ba07d3cc819f22060',
 '20261105193227':'6d966c155ca0a1ac09f2ab3064e41929',
 // These two checksums are for sanitized files, after removing seed inserts.
 '20261105193246':'2cb5f0ae2e097f752424f46bccc697bd',
 '20261105195049':'a49969e744914f10c2f2f48acb999c57',
 '20261105195123':'e4282ef7580d78b68ca6508da544d506',
 '20261105195921':'380bf7e0e66015c76d9e3f26231b9ff9',
 '20261105195948':'75fb38711ccc2778e59d49fc7723a602',
 '20261105200100':'d853b54e0e51700d7de1f53ea6d38ae3',
 '20261106043409':'f58d83d5d324115958650e5efc65ee80',
};
test('transcribed Preview history matches read-only migration record checksums',async()=>{
 for(const [version,expected] of Object.entries(records)) {
  const file=await readFile(`test-infra/preview-history/${version}.sql`,'utf8');
  const sql=file.split('\n').filter(line=>!line.startsWith('--')).join('\n').trim();
  assert.equal(createHash('md5').update(sql).digest('hex'),expected,version);
 }
});

test('later repository migrations match read-only Preview records after whitespace and comment normalization',async()=>{
 const later={
  '202611060001_admin_preview_least_privilege':'dc0cf67c5bc2a47126c23eefe71031c2',
  '202611060002_admin_preview_register_session':'83b3e1f6b1cb31ff7e8064844ea0da67',
  '202611060003_admin_preview_bootstrap_hardening':'2a9fb75336c626f728ef92e0108f4270',
  '202611060004_admin_preview_creator_pending_by_default':'bd6de803081f3a5a0e075e4e30e8dda3',
  '202611060006_admin_preview_recovery_runtime':'137721b136febc37162fc7bcf3b095c8',
  '202611060007_admin_preview_recovery_runtime_monotonic':'ca650d1fe6ae5d72298c980ecfff636c',
  '202611060008_admin_preview_recovery_fresh_totp':'ad1c7abc69677a472b7afd243246b794',
  '202611060009_admin_preview_bootstrap_preflight':'2301b978eb77d2bff2236e8f9d74f104',
  '202611060010_admin_preview_bootstrap_public_status':'b5316f014733b144fa41bc072c1cc793',
  '202611060011_admin_preview_marketplace_review':'4c0b09bcf119632a8689fcf545564b13',
 };
 for(const [name,expected] of Object.entries(later)) {
  const sql=(await readFile(`supabase/migrations/${name}.sql`,'utf8')).replace(/--[^\n]*(\n|$)/g,'').trim().replace(/\s+/g,' ');
  assert.equal(createHash('md5').update(sql).digest('hex'),expected,name);
 }
});
