import test from 'node:test';
import assert from 'node:assert/strict';
import {
  genderFromPrefix,
  isJunkText,
  needsRepair,
  repairIncompleteCandidates,
  resolveProvinceFromRow,
  WORK_CHROME_SQL_RE,
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
    source_raw_text: 'ประวัติการทำงาน/ฝึกงาน 2022 ข้อมูลบริษัท : บริษัท ดี จำกัด ตำแหน่งงาน : พนักงานขาย Soft Skills',
    ocr_text: '',
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

test('resolveProvinceFromRow fills from address and rejects junk quotes', () => {
  assert.equal(isJunkText('"'), true);
  assert.equal(resolveProvinceFromRow({
    province: '"',
    address: '123 หมู่บ้านทดสอบ สมุทรปราการ 10270',
  }), 'สมุทรปราการ');
  assert.equal(resolveProvinceFromRow({
    province: '',
    desired_work_area: 'จังหวัดนนทบุรี',
  }), 'นนทบุรี');
});

test('repairIncompleteCandidates replaces junk province quote from address', async () => {
  const row = {
    id: '55555555-5555-5555-5555-555555555555',
    full_name: 'นายจังหวัด',
    prefix: 'นาย',
    phone: '0811111111',
    email: 'p@example.com',
    gender: 'ชาย',
    age: '30',
    address: '99 ถนนทดสอบ กรุงเทพมหานคร 10110',
    province: '"',
    desired_positions: 'พนักงานขาย',
    expected_salary: '18000',
    education: [{ institution: 'มหาวิทยาลัยก', degree: 'ปริญญาตรี' }],
    work_experience: [{ company: 'บริษัท ก', position: 'ขาย' }],
    hard_skills: [],
    soft_skills: [],
    language_skills: [],
    platform: 'jobbkk',
    source_raw_text: 'ที่อยู่ปัจจุบัน 99 ถนนทดสอบ กรุงเทพมหานคร 10110',
    ocr_text: '',
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
  assert.ok(result.sample[0].fields.includes('province'));
  assert.match(String(updated.params.join(' ')), /กรุงเทพมหานคร/);
});

test('genderFromPrefix maps Thai/English prefixes', () => {
  assert.equal(genderFromPrefix('นาย'), 'ชาย');
  assert.equal(genderFromPrefix('นางสาว'), 'หญิง');
  assert.equal(genderFromPrefix('', 'นาง สมใจ ใจดี'), 'หญิง');
  assert.equal(genderFromPrefix('Mr.'), 'ชาย');
  assert.equal(genderFromPrefix(''), '');
});

test('repairIncompleteCandidates fills gender from prefix and contacts from OCR', async () => {
  const row = {
    id: '44444444-4444-4444-4444-444444444444',
    full_name: 'นายสมชาย ใจดี',
    prefix: 'นาย',
    phone: '',
    email: '',
    gender: '',
    age: '28',
    address: 'กรุงเทพมหานคร',
    province: 'กรุงเทพมหานคร',
    desired_positions: 'ช่าง',
    expected_salary: '',
    education: [{ institution: 'มหาวิทยาลัยก', degree: 'ปริญญาตรี' }],
    work_experience: [{ company: 'บริษัท ก', position: 'ช่าง' }],
    hard_skills: [],
    soft_skills: [],
    language_skills: [],
    platform: 'jobbkk',
    source_raw_text: 'ชื่อ นายสมชาย ใจดี',
    ocr_text: 'Contact 0899999999 email prefix@example.com Expected Salary 16000',
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
  assert.ok(result.withOcr >= 1);
  assert.match(String(updated.params.join(' ')), /ชาย/);
  assert.match(String(updated.params.join(' ')), /0899999999/);
  assert.match(String(updated.params.join(' ')), /16000/);
});

test('repairIncompleteCandidates uses OCR text when raw_text is thin', async () => {
  const row = {
    id: '33333333-3333-3333-3333-333333333333',
    full_name: 'นายโอซีอาร์',
    phone: '',
    email: '',
    gender: '',
    age: '',
    address: '',
    province: '',
    desired_positions: 'ช่าง',
    expected_salary: '15000',
    education: [],
    work_experience: [],
    hard_skills: [],
    soft_skills: [],
    language_skills: [],
    platform: 'jobbkk',
    source_raw_text: 'ชื่อ นายโอซีอาร์',
    ocr_text: [
      'เพศ : ชาย อายุ 26 ปี ที่อยู่ปัจจุบัน กรุงเทพมหานคร',
      'เบอร์โทรศัพท์ 0855555555 อีเมล ocr@example.com',
      'ประวัติการศึกษา มหาวิทยาลัยตัวอย่าง ปริญญาตรี',
      'ประวัติการทำงาน บริษัท โอ จำกัด ตำแหน่งงาน ช่างอาคาร Soft Skills',
    ].join(' '),
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
  assert.match(String(updated.params.join(' ')), /0855555555/);
  assert.match(String(updated.params.join(' ')), /ช่างอาคาร/);
});

test('WORK_CHROME_SQL_RE matches login chrome but not real duties with เข้าสู่ระบบ', () => {
  const re = new RegExp(WORK_CHROME_SQL_RE, 'iu');
  assert.equal(re.test('register_page username_hint max_case'), true);
  assert.equal(re.test('คุณจะไม่สามารถเข้าสู่ระบบได้'), true);
  assert.equal(re.test('help@jobbkk.com'), true);
  assert.equal(re.test('ยิงคิวอาร์โค้ดพัสดุเข้าสู่ระบบออนไลน์'), false);
  assert.equal(re.test('คีย์ข้อมูลเข้าสู่ระบบ ERP'), false);
  assert.equal(re.test('บริษัท ไปรษณีย์ไทย จำกัด'), false);
});

test('needsRepair ignores real work rows that mention เข้าสู่ระบบ in duties', () => {
  assert.equal(needsRepair({
    phone: '0811111111',
    email: 'a@b.com',
    gender: 'ชาย',
    age: '30',
    address: 'นนทบุรี',
    province: 'นนทบุรี',
    desired_positions: 'ธุรการ',
    expected_salary: '18000',
    education: [{ institution: 'มหาวิทยาลัยก', degree: 'ปริญญาตรี' }],
    work_experience: [{
      company: 'บริษัท ไปรษณีย์ไทย จำกัด',
      position: 'พนักงานผู้ช่วย',
      responsibilities: 'ยิงคิวอาร์โค้ดพัสดุเข้าสู่ระบบ',
    }],
  }), false);
});
