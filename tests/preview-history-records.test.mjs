import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Read-only comparison values from Preview migration metadata; MD5 detects
// transcription errors, not malicious tampering or hosted schema drift.
const records={
 '20261105195123':'e4282ef7580d78b68ca6508da544d506',
 '20261105195921':'380bf7e0e66015c76d9e3f26231b9ff9',
 '20261105195948':'75fb38711ccc2778e59d49fc7723a602',
 '20261105200100':'d853b54e0e51700d7de1f53ea6d38ae3',
};
test('transcribed Preview history matches read-only migration record checksums',async()=>{
 for(const [version,expected] of Object.entries(records)) {
  const file=await readFile(`test-infra/preview-history/${version}.sql`,'utf8');
  const sql=file.split('\n').filter(line=>!line.startsWith('--')).join('\n').trim();
  assert.equal(createHash('md5').update(sql).digest('hex'),expected,version);
 }
});
