import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

// 23 พ.ย. 2569: กดลบบัญชี 2 บัญชี งาน Scrap 39 ใบ + รายชื่อที่ผูก + ประวัติการค้น JobBKK หายตามไปทั้งหมด
test('"ลบ" a search account closes and hides it, never deletes the row', () => {
  const repo = read('../web/lib/repo.ts');
  const fn = repo.slice(repo.indexOf('export async function deleteConnector'), repo.indexOf('export async function updateScraperConnector'));
  assert.doesNotMatch(fn, /DELETE FROM connectors/);
  assert.match(fn, /SET enabled = false, deleted_at = now\(\)/);
});

test('a deleted account does not show in the accounts page, the Jarvis picker, or the worker list', () => {
  const repo = read('../web/lib/repo.ts');
  assert.match(repo, /FROM connectors WHERE \$\{NOT_DELETED\} ORDER BY platform, label/);
  assert.match(repo, /NULL::boolean AS worker_online\s+FROM connectors WHERE \$\{NOT_DELETED\}/);
  assert.match(read('../web/lib/jarvis-options.ts'), /c\.platform IN \('jobthai', 'jobbkk'\) AND to_jsonb\(c\)->>'deleted_at' IS NULL/);
  assert.match(read('../src/db/repositories.js'), /const where = \[`to_jsonb\(connectors\)->>'deleted_at' IS NULL`\];/);
});

test('the database refuses to delete an account that still has orders or search history', () => {
  const sql = read('../src/db/schema-031.sql');
  assert.match(sql, /scrape_tasks_connector_id_fkey\s+FOREIGN KEY \(connector_id\) REFERENCES connectors\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /scrape_runs_connector_id_fkey\s+FOREIGN KEY \(connector_id\) REFERENCES connectors\(id\) ON DELETE RESTRICT/);
  assert.match(read('../src/db/migrate.js'), /'schema-031\.sql'/);
  assert.doesNotMatch(read('../src/db/schema.sql'), /connector_id uuid NOT NULL REFERENCES connectors\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(read('../src/db/schema-002.sql'), /REFERENCES connectors\(id\) ON DELETE CASCADE/);
});
