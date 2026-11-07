import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionMarketplaceTarget } from '../backend/admin-marketplace-target.ts';

const pem = '-----BEGIN CERTIFICATE-----\nunit-test-ca\n-----END CERTIFICATE-----';
const direct = 'postgresql://app:example@db.dqhxgwzjwzvpqiilteld.supabase.co:5432/postgres?sslmode=verify-full';
const pool = 'postgresql://app.dqhxgwzjwzvpqiilteld:example@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=verify-full';
const env = (url = direct) => ({ VERCEL_ENV:'production', DATABASE_URL:url, DATABASE_CA_CERT:pem });

test('accepts only the pinned Production target in the Production environment', () => {
  assert.doesNotThrow(() => assertProductionMarketplaceTarget(env()));
  assert.doesNotThrow(() => assertProductionMarketplaceTarget(env(pool)));
  assert.throws(() => assertProductionMarketplaceTarget({ ...env(), VERCEL_ENV:'preview' }), /unavailable/);
  assert.throws(() => assertProductionMarketplaceTarget(env(direct.replace('dqhxgwzjwzvpqiilteld','qwngmsedyepghskoagaj'))), /target/);
  assert.throws(() => assertProductionMarketplaceTarget(env(pool.replace('dqhxgwzjwzvpqiilteld','qwngmsedyepghskoagaj'))), /target/);
});

test('rejects URL tricks and cannot weaken verified TLS', () => {
  for (const url of [direct.replace('supabase.co','supabase.co.attacker.test'), direct.replace('/postgres?', '/other?'), `${direct}&host=attacker.test`, `${direct}&HOST=attacker.test`, `${direct}&sslmode=disable`, direct.replace('postgresql:', 'https:')]) {
    assert.throws(() => assertProductionMarketplaceTarget(env(url)));
  }
  assert.throws(() => assertProductionMarketplaceTarget({ ...env(direct.replace('verify-full', 'disable')), DATABASE_CA_CERT:undefined }), /verified TLS/);
  assert.throws(() => assertProductionMarketplaceTarget({ ...env(), DATABASE_CA_CERT:undefined }), /DATABASE_CA_CERT/);
});
