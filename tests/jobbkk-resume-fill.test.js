import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissingFromRawText, parseResumeHtml } from '../src/providers/jobbkk/parser.js';

test('fillMissingFromRawText recovers profile fields from collapsed JobBKK text', () => {
  const record = {
    name: 'นายทดสอบ ระบบ',
    phone: '',
    email: '',
    gender: '',
    age: '',
    address: '',
    desired_positions: '',
    expected_salary: '',
    education: [],
    work_experience: [],
  };
  fillMissingFromRawText(record, [
    'เพศ : ชาย อายุ 28 ปี ที่อยู่ปัจจุบัน กรุงเทพมหานคร 10240',
    'เบอร์โทรศัพท์ 0812345678 อีเมล test.user@example.com',
    'งานที่ต้องการ ตำแหน่ง : พนักงานขับรถ พื้นที่ที่ต้องการทำงาน : นนทบุรี',
    'เงินเดือนที่ต้องการ 18000 ประวัติการศึกษา มหาวิทยาลัยตัวอย่าง วุฒิการศึกษา ปริญญาตรี',
    'ประวัติการทำงาน บริษัท ตัวอย่าง จำกัด ตำแหน่งงาน พนักงานขับรถ Soft Skills',
  ].join(' '));

  assert.equal(record.gender, 'ชาย');
  assert.equal(record.age, '28');
  assert.match(record.phone, /0812345678/);
  assert.equal(record.email, 'test.user@example.com');
  assert.match(record.desired_positions, /พนักงานขับรถ/);
  assert.equal(record.expected_salary, '18000');
  assert.match(record.education_summary, /ปริญญาตรี/);
  assert.match(record.experience_summary, /พนักงานขับรถ/);
});

test('fillMissingFromRawText never overwrites existing values', () => {
  const record = { gender: 'หญิง', age: '40', phone: '0899999999' };
  fillMissingFromRawText(record, 'เพศ : ชาย อายุ 21 ปี เบอร์โทรศัพท์ 0811111111');
  assert.equal(record.gender, 'หญิง');
  assert.equal(record.age, '40');
  assert.equal(record.phone, '0899999999');
});

test('preview_new HTML parser fills gender/age/education before returning', () => {
  const html = `
    <html><body>
      <h3 class="jobseeker-name">นางสาวตัวอย่าง งาน</h3>
      <div class="header-name">
        <h5>ที่อยู่ปัจจุบัน</h5><p>นนทบุรี 11000</p>
        <h5>เบอร์โทรศัพท์</h5><p>0822222222</p>
        <h5>อีเมล</h5><p>demo@example.com</p>
        <h5>เพศ</h5><p>หญิง</p>
        <h5>อายุ</h5><p>30 ปี</p>
      </div>
      <div class="education"><div class="timeline-2"><div class="content-2">
        <h5>มหาวิทยาลัยตัวอย่าง</h5>
        <p><span>วุฒิการศึกษา</span> ปริญญาตรี</p>
        <p><span>สาขา</span> การบัญชี</p>
      </div></div></div>
      <div class="skills"><div class="timeline-2"><div class="content-2">
        <h2>2020</h2>
        <p><span>ข้อมูลบริษัท</span> บริษัท ตัวอย่าง</p>
        <p><span>ตำแหน่งงาน</span> เจ้าหน้าที่บัญชี</p>
      </div></div></div>
    </body></html>
  `;
  const parsed = parseResumeHtml(html, { sourceUrl: 'https://www.jobbkk.com/resumes/preview_new/1', index: 1 });
  assert.equal(parsed.gender, 'หญิง');
  assert.equal(parsed.age, '30');
  assert.equal(parsed.phone, '0822222222');
  assert.equal(parsed.email, 'demo@example.com');
  assert.equal(parsed.education[0].degree, 'ปริญญาตรี');
  assert.equal(parsed.work_experience[0].position, 'เจ้าหน้าที่บัญชี');
  assert.equal(parsed.parse_status, 'success');
});
