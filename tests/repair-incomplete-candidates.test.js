import test from 'node:test';
import assert from 'node:assert/strict';
import {
  needsRepair,
  repairIncompleteCandidates,
} from '../src/core/repair-incomplete-candidates.js';

test('needsRepair detects empty education/work arrays', () => {
  assert.equal(needsRepair({
    phone: '0811111111',
    email: 'a@b.com',
    gender: 'ชาย',
    age: '30',
    address: 'นนทบุรี',
    province: 'นนทบุรี',
    desired_positions: 'พนักงานขับรถ',
    expected_salary: '18000',
    education: [],
    work_experience: [],
  }), true);
});

test('needsRepair detects year-only work stubs as incomplete', () => {
  assert.equal(needsRepair({
    phone: '0811111111',
    email: 'a@b.com',
    gender: 'ชาย',
    age: '30',
    address: 'นนทบุรี',
    province: 'นนทบุรี',
    desired_positions: 'พนักงานขับรถ',
    expected_salary: '18000',
    education: [{ institution: 'มหาวิทยาลัยก', degree: 'ปริญญาตรี' }],
    work_experience: [{ year: '2022', company: '', position: '' }],
  }), true);
});

test('repairIncompleteCandidates fills blank fields from raw_text without inventing', async () => {
  const row = {
    id: '11111111-1111-1111-1111-111111111111',
    full_name: 'นายทดสอบ ซ่อม',
    phone: '',
    email: '',
    gender: '',
    age: '',
    address: '',
    province: '',
    desired_positions: '',
    expected_salary: '',
    education: [],
    work_experience: [],
    hard_skills: [],
    soft_skills: [],
    language_skills: [],
    platform: 'jobbkk',
    raw_text: [
      'เพศ : ชาย อายุ 27 ปี ที่อยู่ปัจจุบัน นนทบุรี 11000',
      'เบอร์โทรศัพท์ 0844444444 อีเมล oldfix@example.com',
      'งานที่ต้องการ ตำแหน่ง : พนักงานขับรถ พื้นที่ที่ต้องการทำงาน : นนทบุรี',
      'เงินเดือนที่ต้องการ 17000',
      'ประวัติการศึกษา มหาวิทยาลัยตัวอย่าง ปริญญาตรี',
      'ประวัติการทำงาน บริษัท ซี จำกัด ตำแหน่งงาน พนักงานขับรถ Soft Skills',
    ].join(' '),
  };

  let updated = null;
  const db = {
    async query(sql) {
      if (/FROM candidates/i.test(sql)) return { rows: [row] };
      return { rows: [] };
    },
    async withTransaction(fn) {
      const client = {
        async query(sql, params) {
          if (/UPDATE candidates/i.test(sql)) updated = { sql, params };
          return { rows: [] };
        },
      };
      return fn(client);
    },
  };

  const result = await repairIncompleteCandidates(db, { limit: 10 });
  assert.equal(result.repaired, 1);
  assert.ok(result.filledFields >= 4);
  assert.ok(updated, 'expected candidate UPDATE');
  assert.match(String(updated.params.join(' ')), /0844444444/);
  assert.match(String(updated.params.join(' ')), /oldfix@example.com/);
  assert.match(String(updated.params.join(' ')), /ปริญญาตรี/);
});

test('repairIncompleteCandidates replaces year-only work stubs', async () => {
  const row = {
    id: '22222222-2222-2222-2222-222222222222',
    full_name: 'นายปีอย่างเดียว',
    phone: '0811111111',
    email: 'year@example.com',
    gender: 'ชาย',
    age: '30',
    address: 'นนทบุรี',
    province: 'นนทบุรี',
    desired_positions: 'พนักงานขับรถ',
    expected_salary: '18000',
    education: [{ institution: 'มหาวิทยาลัยก', degree: 'ปริญญาตรี' }],
    work_experience: [{ year: '2022', company: '', position: '' }],
    hard_skills: [],
    soft_skills: [],
    language_skills: [],
    platform: 'jobbkk',
    raw_text: 'ประวัติการทำงาน/ฝึกงาน 2022 ข้อมูลบริษัท : บริษัท ดี จำกัด ตำแหน่งงาน : พนักงานขาย Soft Skills',
  };
  let updated = null;
  const db = {
    async query() { return { rows: [row] }; },
    async withTransaction(fn) {
      return fn({
        async query(sql, params) {
          if (/UPDATE candidates/i.test(sql)) updated = { sql, params };
          return { rows: [] };
        },
      });
    },
  };
  const result = await repairIncompleteCandidates(db, { limit: 10 });
  assert.equal(result.repaired, 1);
  assert.ok(result.sample[0].fields.includes('work_experience'));
  assert.match(String(updated.params.join(' ')), /พนักงานขาย/);
});
