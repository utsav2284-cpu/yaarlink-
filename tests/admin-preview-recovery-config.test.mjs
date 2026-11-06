import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRecoverySettings, createPreviewRecoveryPool } from '../backend/admin-preview-recovery-config.mjs';
const env = { PREVIEW_RECOVERY_DB_PASSWORD:'synthetic-password', PREVIEW_RECOVERY_PEPPER_BASE64:Buffer.alloc(32,42).toString('base64') };
test('recovery configuration pins Preview direct host, dedicated login and verified TLS', () => {
 const result=previewRecoverySettings({...env, PGHOST:'production.invalid', PGSSLMODE:'disable'});
 assert.equal(result.database.host,'db.qwngmsedyepghskoagaj.supabase.co');
 assert.equal(result.database.user,'preview_recovery_login'); assert.equal(result.database.ssl.rejectUnauthorized,true);
 assert.equal(result.pepper.length,32);
 const pool=createPreviewRecoveryPool(result.database); assert.equal(pool.options.host,result.database.host); return pool.end();
});
test('rejects missing or noncanonical secrets and attempts to override the target', () => {
 for(const bad of [{},{...env,PREVIEW_RECOVERY_PEPPER_BASE64:'abc'}, {...env,PREVIEW_RECOVERY_PEPPER_BASE64:Buffer.alloc(31).toString('base64')}]) assert.throws(()=>previewRecoverySettings(bad),/not configured/);
 const settings=previewRecoverySettings(env).database;
 for(const override of [{host:'other.invalid'},{user:'postgres'},{ssl:{rejectUnauthorized:false}},{port:9999}]) assert.throws(()=>createPreviewRecoveryPool({...settings,...override}),/Invalid Preview/);
});
