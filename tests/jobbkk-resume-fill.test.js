import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fillMissingFromRawText,
  finalizeCandidateRecord,
  isResumeProfileThin,
  parseResumeHtml,
} from '../src/providers/jobbkk/parser.js';

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
  assert.equal(record.education[0]?.degree, 'ปริญญาตรี');
  assert.match(record.education[0]?.institution || '', /มหาวิทยาลัยตัวอย่าง/);
  assert.match(record.work_experience[0]?.position || '', /พนักงานขับรถ/);
  assert.match(record.work_experience[0]?.company || '', /ตัวอย่าง/);
});

test('fillMissingFromRawText materializes jsonb arrays from *_summary when raw_text is thin', () => {
  const record = {
    education: [],
    work_experience: [],
    education_summary: 'มหาวิทยาลัยรามคำแหง คณะบริหารธุรกิจ สาขาการตลาด ปริญญาตรี ปีที่จบ 2560',
    experience_summary: 'บริษัท เอ จำกัด ตำแหน่งงาน พนักงานขาย ระยะเวลา 2 ปี เงินเดือน 15000',
  };
  fillMissingFromRawText(record, 'ชื่อ นายทดสอบ');
  assert.equal(record.education[0]?.degree, 'ปริญญาตรี');
  assert.match(record.education[0]?.institution || '', /มหาวิทยาลัยรามคำแหง/);
  assert.match(record.education[0]?.major || '', /การตลาด/);
  assert.equal(record.work_experience[0]?.position, 'พนักงานขาย');
  assert.match(record.work_experience[0]?.company || '', /เอ/);
});

test('fillMissingFromRawText marks no-experience work rows', () => {
  const record = { education: [], work_experience: [] };
  fillMissingFromRawText(record, 'ประวัติการศึกษา มัธยมศึกษาตอนปลาย ประวัติการทำงาน ไม่มีประสบการณ์ Soft Skills');
  assert.equal(record.work_experience[0]?.position, 'ไม่มีประสบการณ์');
});

test('fillMissingFromRawText never overwrites existing values', () => {
  const record = {
    gender: 'หญิง',
    age: '40',
    phone: '0899999999',
    education: [{ institution: 'เก่า', degree: 'ปวช.' }],
    work_experience: [{ company: 'เก่า', position: 'ธุรการ' }],
  };
  fillMissingFromRawText(record, [
    'เพศ : ชาย อายุ 21 ปี เบอร์โทรศัพท์ 0811111111',
    'ประวัติการศึกษา มหาวิทยาลัยใหม่ ปริญญาตรี',
    'ประวัติการทำงาน บริษัทใหม่ ตำแหน่งงาน โปรแกรมเมอร์ Soft Skills',
  ].join(' '));
  assert.equal(record.gender, 'หญิง');
  assert.equal(record.age, '40');
  assert.equal(record.phone, '0899999999');
  assert.equal(record.education[0].institution, 'เก่า');
  assert.equal(record.work_experience[0].position, 'ธุรการ');
});

test('finalizeCandidateRecord repairs blank arrays from raw_text and sets parse_status', () => {
  const repaired = finalizeCandidateRecord({
    name: 'นายซ่อม ข้อมูล',
    phone: '',
    email: '',
    gender: '',
    education: null,
    work_experience: null,
    raw_text: [
      'เพศ : ชาย อายุ 25 ปี ที่อยู่ปัจจุบัน นนทบุรี 11000',
      'เบอร์โทรศัพท์ 0833333333 อีเมล repair@example.com',
      'ประวัติการศึกษา วิทยาลัยเทคนิคตัวอย่าง ปวส. สาขาช่างยนต์',
      'ประวัติการทำงาน บริษัท บี จำกัด ตำแหน่งงาน ช่างยนต์ Soft Skills',
    ].join(' '),
  });
  assert.equal(repaired.gender, 'ชาย');
  assert.equal(repaired.age, '25');
  assert.match(repaired.phone, /0833333333/);
  assert.equal(repaired.email, 'repair@example.com');
  assert.ok(Array.isArray(repaired.education));
  assert.ok(repaired.education.length >= 1);
  assert.ok(Array.isArray(repaired.work_experience));
  assert.ok(repaired.work_experience.length >= 1);
  assert.notEqual(repaired.parse_status, 'failed');
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
  assert.equal(isResumeProfileThin(parsed), false);
});

test('fillMissingFromRawText replaces year-only work stubs from raw_text', () => {
  const record = {
    education: [],
    work_experience: [{ year: '2022', company: '', position: '', period: '', salary: '', business_type: '', responsibilities: '' }],
  };
  fillMissingFromRawText(record, [
    'ประวัติการทำงาน/ฝึกงาน 2022 ข้อมูลบริษัท : บริษัท ดี จำกัด',
    'ตำแหน่งงาน : พนักงานขาย ระยะเวลา : 1 ปี Soft Skills',
  ].join(' '));
  assert.equal(record.work_experience[0]?.position, 'พนักงานขาย');
  assert.match(record.work_experience[0]?.company || '', /ดี/);
});

test('fillMissingFromRawText parses multiple work jobs', () => {
  const record = { education: [], work_experience: [] };
  fillMissingFromRawText(record, [
    'ประวัติการทำงาน/ฝึกงาน',
    '2023 ข้อมูลบริษัท : บจก.เอ ตำแหน่งงาน : ช่าง ระยะเวลา : 1 ปี',
    '2021 ข้อมูลบริษัท : บจก.บี ตำแหน่งงาน : ช่างผู้ช่วย ระยะเวลา : 2 ปี',
    'ทักษะความรู้ Soft Skills',
  ].join(' '));
  assert.equal(record.work_experience.length, 2);
  assert.equal(record.work_experience[0]?.position, 'ช่าง');
  assert.equal(record.work_experience[1]?.position, 'ช่างผู้ช่วย');
});

test('classic #experience_page1 is materialized into work_experience', () => {
  const html = `
    <html><body>
      <div class="rsm-name"><span>นายทดสอบ เพจ</span></div>
      <div id="education_page1">มหาวิทยาลัยตัวอย่าง ปริญญาตรี</div>
      <div id="experience_page1">2021 ข้อมูลบริษัท บริษัท เอ จำกัด ตำแหน่งงาน พนักงานขับรถ ระยะเวลา 1 ปี</div>
    </body></html>
  `;
  const parsed = parseResumeHtml(html, { sourceUrl: 'https://www.jobbkk.com/resumes/preview/9', index: 1 });
  assert.equal(parsed.education[0]?.degree, 'ปริญญาตรี');
  assert.equal(parsed.work_experience[0]?.position, 'พนักงานขับรถ');
  assert.match(parsed.work_experience[0]?.company || '', /เอ/);
});
