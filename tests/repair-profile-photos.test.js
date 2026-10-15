import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupAllProfilePhotos,
  rejectPlaceholderProfileAssets,
  repairAllProfilePhotos,
} from '../src/core/repair-profile-photos.js';

test('rejectPlaceholderProfileAssets dry-run counts via SQL shape', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/count\(\*\)/i.test(sql)) return { rows: [{ n: 3 }] };
      return { rowCount: 0, rows: [] };
    },
    async withTransaction(fn) {
      return fn({
        async query(sql, params) {
          calls.push({ sql, params });
          return { rowCount: 2, rows: [] };
        },
      });
    },
  };
  const rejected = await rejectPlaceholderProfileAssets(db, { dryRun: true });
  assert.equal(rejected.rejected, 3);
  assert.equal(rejected.dryRun, true);
  assert.match(calls[0].sql, /img\/profile/i);

  const cleanup = await cleanupAllProfilePhotos(db, { dryRun: true });
  assert.equal(cleanup.placeholdersRejected, 3);
  assert.equal(cleanup.superseded, 0);
});

test('cleanupAllProfilePhotos runs supersede when not dry-run', async () => {
  const db = {
    async query(sql) {
      if (/UPDATE candidate_assets/i.test(sql)) return { rowCount: 4, rows: [] };
      return { rows: [], rowCount: 0 };
    },
    async withTransaction(fn) {
      return fn({
        async query() {
          return { rowCount: 7, rows: [] };
        },
      });
    },
  };
  const result = await cleanupAllProfilePhotos(db, { dryRun: false });
  assert.equal(result.placeholdersRejected, 4);
  assert.equal(result.superseded, 7);
});

test('repairAllProfilePhotos dry-run skips redownload', async () => {
  const db = {
    async query(sql) {
      if (/count\(\*\)/i.test(sql)) return { rows: [{ n: 2 }] };
      if (/SELECT DISTINCT ON/i.test(sql)) {
        assert.fail('dry-run must not query candidates for redownload');
      }
      return { rows: [], rowCount: 0 };
    },
    async withTransaction() {
      assert.fail('dry-run must not supersede');
    },
  };
  const result = await repairAllProfilePhotos(db, { dryRun: true, redownload: true, limit: 10 });
  assert.equal(result.dryRun, true);
  assert.equal(result.placeholdersRejected, 2);
  assert.equal(result.refreshed, 0);
  assert.match(result.note || '', /dry-run/i);
});

test('repairAllProfilePhotos cleanup-only returns after cleanup', async () => {
  const db = {
    async query(sql) {
      if (/UPDATE candidate_assets/i.test(sql)) return { rowCount: 1, rows: [] };
      if (/SELECT DISTINCT ON/i.test(sql)) {
        assert.fail('cleanup-only must not scan for redownload');
      }
      return { rows: [], rowCount: 0 };
    },
    async withTransaction(fn) {
      return fn({
        async query() {
          return { rowCount: 3, rows: [] };
        },
      });
    },
  };
  const result = await repairAllProfilePhotos(db, { redownload: false });
  assert.equal(result.redownload, false);
  assert.equal(result.placeholdersRejected, 1);
  assert.equal(result.superseded, 3);
  assert.equal(result.scanned, 0);
});
