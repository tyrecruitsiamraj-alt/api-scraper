import test from 'node:test';
import assert from 'node:assert/strict';
import { bankSearchTerms, rankBankCandidates } from '../src/core/candidate-bank.js';

test('คำค้นในคลังรวมตำแหน่ง คำค้น และตำแหน่งที่ AI เสนอ ไม่ซ้ำ', () => {
  assert.deepEqual(
    bankSearchTerms({ position: 'พนักงานขับรถ', keyword: '' }, { accepted_positions: ['พนักงานขับรถ', 'พนักงานขับรถผู้บริหาร'] }),
    ['พนักงานขับรถ', 'พนักงานขับรถผู้บริหาร'],
  );
  assert.deepEqual(bankSearchTerms({}, {}), []);
});

test('คนในคลังที่ตกเพศ อายุ จังหวัด ไม่ถูกผูก · ตำแหน่งตรงขึ้นก่อน แล้วใหม่สุดก่อน', () => {
  const criteria = { province: 'กรุงเทพมหานคร', gender: 'ชาย', ageMin: '25', ageMax: '45' };
  const qualificationSpec = { accepted_positions: ['พนักงานขับรถ'] };
  const base = { gender: 'ชาย', age: '30', desired_work_area: 'กรุงเทพมหานคร' };
  const rows = [
    { id: 'old-driver', full_name: 'ก', desired_positions: 'พนักงานขับรถ', last_updated_at: '2026-09-01', ...base },
    { id: 'new-driver', full_name: 'ข', desired_positions: 'พนักงานขับรถ', last_updated_at: '2026-11-01', ...base },
    { id: 'helper', full_name: 'ค', desired_positions: 'พนักงานส่งของ', work_experience: [{ position: 'ขับรถส่งของ' }], last_updated_at: '2026-11-03', ...base },
    { id: 'woman', full_name: 'ง', desired_positions: 'พนักงานขับรถ', ...base, gender: 'หญิง' },
    { id: 'too-old', full_name: 'จ', desired_positions: 'พนักงานขับรถ', ...base, age: '52' },
    { id: 'chiangmai', full_name: 'ฉ', desired_positions: 'พนักงานขับรถ', ...base, desired_work_area: 'เชียงใหม่' },
  ];
  const ranked = rankBankCandidates(rows, { criteria, qualificationSpec, limit: 10 });
  assert.deepEqual(ranked.map((r) => r.row.id), ['new-driver', 'old-driver', 'helper']);
  assert.ok(ranked.every((r) => r.qualification.status === 'qualified'));
});

test('ผูกไม่เกินจำนวนที่ขอ', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: String(i), full_name: `คน ${i}`, desired_positions: 'ธุรการ' }));
  assert.equal(rankBankCandidates(rows, { qualificationSpec: { accepted_positions: ['ธุรการ'] }, limit: 3 }).length, 3);
});
