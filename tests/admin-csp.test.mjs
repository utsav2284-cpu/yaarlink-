import test from 'node:test';
import assert from 'node:assert/strict';
import { adminAuthCspOrigin } from '../lib/admin-csp.ts';
test('CSP permits the exact admin authentication project for each deployment', () => {
 assert.equal(adminAuthCspOrigin('production'),'https://dqhxgwzjwzvpqiilteld.supabase.co');
 assert.equal(adminAuthCspOrigin('preview'),'https://qwngmsedyepghskoagaj.supabase.co');
 assert.equal(adminAuthCspOrigin(undefined),'https://qwngmsedyepghskoagaj.supabase.co');
});
