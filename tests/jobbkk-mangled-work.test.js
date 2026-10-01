import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finalizeCandidateRecord,
  hasUsefulWorkExperience,
  isJunkEducationRow,
  isMangledWorkRow,
  normalizeWorkRow,
  sanitizeWorkExperience,
  stripJobbkkSiteChrome,
} from '../src/providers/jobbkk/parser.js';

test('detects glued salary/business labels as mangled work', () => {
  assert.equal(isMangledWorkRow({
    company: 'บริษัท อักษรโลจิสติกส์ จำกัดตำแหน่งงาน : ผู้ช่วยผู้จัดการ',
    position: 'ผู้ช่วยผู้จัดการประเภทธุรกิจ : ขนส่งระยะเวลา : เมษายน',
  }), true);
  assert.equal(isMangledWorkRow({
    company: '',
    position: 'Store Keeperเงินเดือน(บาท):17,000ประเภทธุรกิจ:ขนส่งรายละเอียดงานรับของ',
  }), true);
  assert.equal(isMangledWorkRow({
    company: 'บจก.ดี',
    position: 'พนักงานขาย',
  }), false);
});

test('strips Resume Credit meter from work text', () => {
  const raw = 'barista the summer coffee ตำแหน่ง barista สามารถดูหรือติดต่อได้ : Resume - View Credit Credit ที่ใช้แล้ว คงเหลือ 2,665';
  const stripped = stripJobbkkSiteChrome(raw);
  assert.ok(!/Resume|Credit|สามารถดูหรือติดต่อได้/i.test(stripped));
  assert.match(stripped, /barista/i);
});

test('normalizeWorkRow splits glued company/position labels', () => {
  const row = normalizeWorkRow({
    company: 'Raffles International Collegeตำแหน่งงาน : Marketing Managerประเภทธุรกิจ',
    position: 'Marketing Managerประเภทธุรกิจ : การศึกษาระยะเวลา :',
  });
  assert.ok(row);
  assert.match(row.company, /Raffles/i);
  assert.match(row.position, /Marketing Manager/i);
  assert.ok(!/ประเภทธุรกิจ|ระยะเวลา/.test(row.position));
  assert.equal(isMangledWorkRow(row), false);
});

test('normalizeWorkRow recovers short title from credit-bloated position', () => {
  const row = normalizeWorkRow({
    company: '',
    position: 'เสิร์ฟ โอโตยะ ตำแหน่ง เสิร์ฟ สามารถดูหรือติดต่อได้ : Resume - View Credit Credit ที่ใช้แล้ว คงเหลือ 2,667',
  });
  assert.ok(row);
  assert.equal(row.position, 'เสิร์ฟ');
  assert.match(row.company, /โอโตยะ/);
});

test('sanitizeWorkExperience cleans a mixed list', () => {
  const rows = sanitizeWorkExperience([
    {
      company: 'บริษัท แร็คกิ้ง เซอร์วิส แอนด์สเปคชั่น จำกัดตำแหน่งงาน :',
      position: 'ควบคุมและวางแผนการผลิตประเภทธุรกิจ : อุตสาหกรรมโลหะระยะเวลา : ตุลาคม',
    },
    {
      company: 'บริษัท ดี จำกัด',
      position: 'พนักงานขาย',
    },
  ]);
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((row) => !isMangledWorkRow(row)));
  assert.equal(hasUsefulWorkExperience(rows), true);
});

test('finalizeCandidateRecord repairs mangled work from raw_text', () => {
  const parsed = finalizeCandidateRecord({
    name: 'นายทดสอบ',
    work_experience: [{
      company: '',
      position: 'IT SUPPORTเงินเดือน(บาท):-ประเภทธุรกิจ:ราชการรายละเอียดงานดูแลระบบ',
    }],
    raw_text: [
      'ประวัติการทำงาน',
      '2022 ข้อมูลบริษัท : บริษัท โอ จำกัด ตำแหน่งงาน : IT Support Soft Skills',
    ].join(' '),
  });
  assert.equal(hasUsefulWorkExperience(parsed.work_experience), true);
  assert.ok(parsed.work_experience.every((row) => !isMangledWorkRow(row)));
  assert.ok(
    parsed.work_experience.some((row) => /โอ/.test(row.company) || /IT Support/i.test(row.position)),
  );
});

test('isJunkEducationRow rejects JOBBKK.COM test majors', () => {
  assert.equal(isJunkEducationRow({
    institution: 'JOBBKK',
    faculty: 'JOBBKK.COM',
    major: 'JOBBKK.COM',
    degree: 'ปริญญาตรี',
  }), true);
  assert.equal(isJunkEducationRow({
    institution: 'มหาวิทยาลัยเกษตรศาสตร์',
    major: 'บริหารธุรกิจ',
    degree: 'ปริญญาตรี',
  }), false);
});

test('finalizeCandidateRecord clears JOBBKK test address/desired/education', () => {
  const parsed = finalizeCandidateRecord({
    name: 'JOBBKK DOT COM',
    address: 'JOBBKK TEST (เทสระบบสมัครงาน) JOBBKK.COM แขวงวังทองหลาง',
    desired_positions: 'เรซูเม่นี้สำหรับใช้ทดสอบระบบสมัครงานเท่านั้น',
    education: [{
      institution: 'JOBBKK',
      faculty: 'JOBBKK.COM',
      major: 'JOBBKK.COM',
      degree: 'ปริญญาตรี',
    }],
    work_experience: [],
    raw_text: 'ชื่อ JOBBKK DOT COM',
  });
  assert.equal(parsed.address, '');
  assert.equal(parsed.desired_positions, '');
  assert.equal(parsed.education.length, 0);
});
