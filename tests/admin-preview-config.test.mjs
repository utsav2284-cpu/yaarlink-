import test from 'node:test';
import assert from 'node:assert/strict';
import { requirePreviewSupabaseUrl, ADMIN_PREVIEW_SUPABASE_URL } from '../lib/admin-preview-config.ts';

test('admin client is pinned to dedicated Preview', () => {
 for (const value of [undefined,'',ADMIN_PREVIEW_SUPABASE_URL,`${ADMIN_PREVIEW_SUPABASE_URL}/`]) assert.equal(requirePreviewSupabaseUrl(value),ADMIN_PREVIEW_SUPABASE_URL);
});
test('admin client fails closed for non-Preview URLs and URL tricks', () => {
 for (const value of ['https://example.test','http://qwngmsedyepghskoagaj.supabase.co','https://qwngmsedyepghskoagaj.supabase.co.evil.test','https://qwngmsedyepghskoagaj.supabase.co/path','https://user@qwngmsedyepghskoagaj.supabase.co','https://qwngmsedyepghskoagaj.supabase.co?x=y']) assert.throws(()=>requirePreviewSupabaseUrl(value),/dedicated Preview/);
});
