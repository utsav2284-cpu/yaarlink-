import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdminSupabaseTarget } from '../lib/admin-target-config.ts';

const preview='https://qwngmsedyepghskoagaj.supabase.co';
const production='https://dqhxgwzjwzvpqiilteld.supabase.co';
test('Preview cannot silently connect to Production', () => {
  assert.deepEqual(requireAdminSupabaseTarget('preview',preview),{url:preview,production:false});
  assert.deepEqual(requireAdminSupabaseTarget(undefined,undefined),{url:preview,production:false});
  assert.throws(() => requireAdminSupabaseTarget('preview',production));
});
test('Production requires the exact Production project URL', () => {
  assert.deepEqual(requireAdminSupabaseTarget('production',production),{url:production,production:true});
  for (const value of [undefined,'',preview,`${production}.evil.test`,`${production}/unexpected`,`${production}?x=1`]) assert.throws(() => requireAdminSupabaseTarget('production',value));
  assert.throws(() => requireAdminSupabaseTarget('staging',production));
});
