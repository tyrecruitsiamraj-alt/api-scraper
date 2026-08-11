import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCandidateToTask } from '../src/db/repositories.js';

test('Resume คนใหม่ถูกนับเข้ากับงานเพียงครั้งแรก', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 1, rows: [{ task_id: params[0] }] };
    },
  };

  const result = await linkCandidateToTask(client, {
    taskId: 'task-1', candidateId: 'candidate-1', sourceId: 'source-1', matchedPosition: 'พนักงานขับรถ',
  });

  assert.equal(result.isNewForTask, true);
  assert.equal(result.becameQualified, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ON CONFLICT \(task_id, candidate_id\) DO NOTHING/);
});

test('Resume คนเดิมอัปเดตแหล่งที่มาแต่ไม่เพิ่มยอดซ้ำ', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rowCount: 0, rows: [] };
      if (calls.length === 2) return { rowCount: 1, rows: [{ qualification_status: 'qualified' }] };
      return { rowCount: 1, rows: [] };
    },
  };

  const result = await linkCandidateToTask(client, {
    taskId: 'task-1', candidateId: 'candidate-1', sourceId: 'source-2', matchedPosition: 'พนักงานขับรถส่วนกลาง',
  });

  assert.equal(result.isNewForTask, false);
  assert.equal(result.becameQualified, false);
  assert.equal(calls.length, 3);
  assert.match(calls[2].sql, /UPDATE scrape_task_candidates/);
});

test('Resume ที่เคยต้องตรวจเพิ่มจะเริ่มนับเมื่อมีหลักฐานครบและเปลี่ยนเป็นผ่าน', async () => {
  let call = 0;
  const client = {
    async query() {
      call += 1;
      if (call === 1) return { rowCount: 0, rows: [] };
      if (call === 2) return { rowCount: 1, rows: [{ qualification_status: 'needs_review' }] };
      return { rowCount: 1, rows: [] };
    },
  };
  const result = await linkCandidateToTask(client, {
    taskId: 'task-1', candidateId: 'candidate-2', sourceId: 'source-2', matchedPosition: 'พนักงานขับรถ',
    qualification: { status: 'qualified', reasons: [], score: 100, evidence: { passed: ['required_license'] } },
  });
  assert.equal(result.isNewForTask, false);
  assert.equal(result.becameQualified, true);
});
