import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 23 พ.ย. 2569: บัญชี JobThai เดิมหมดอายุ เปลี่ยนเป็นบัญชีใหม่ แต่ระบบยังใช้การล็อกอินที่จำไว้ของบัญชีเก่า
test('changing an account username or password forgets its saved login', () => {
  const repo = fs.readFileSync(new URL('../web/lib/repo.ts', import.meta.url), 'utf8');
  const fn = repo.slice(repo.indexOf('export async function updateScraperConnector'), repo.indexOf('export async function updateFacebookAccount'));
  assert.match(fn, /password_enc=\$4, session_state=NULL/);
  assert.match(fn, /session_state = CASE WHEN username IS DISTINCT FROM \$3 THEN NULL ELSE session_state END/);
});

test('an account with no saved login signs in with its own username, not a leftover login file', () => {
  const pipeline = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(pipeline, /let sess = await openSession\(!connector\.session_state && Boolean\(connector\.username\)\);/);
});
