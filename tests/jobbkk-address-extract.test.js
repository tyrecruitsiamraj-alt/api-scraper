import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAddressFromText,
  finalizeCandidateRecord,
  isJunkPersonalField,
  sanitizeWorkExperience,
} from '../src/providers/jobbkk/parser.js';

const RAW_GLUED_FB = [
  'ฐปนัท นาดี0814545391sign.nadee@gmail.comsai6463',
  'https://www.facebook.com/sandy.nana.7393/77/8 หมู่บ้านพระยาสุเรนทร์ ซอยพระยาสุเรนทร์ 30 แยก 5',
  'แขวงบางชัน เขตคลองสามวา กรุงเทพมหานคร 10510 ประเทศไทยแนะนำตัวผู้จัดการแผนกบัญชี',
].join('');

test('extractAddressFromText recovers address glued after facebook URL', () => {
  const addr = extractAddressFromText(RAW_GLUED_FB);
  assert.match(addr, /หมู่บ้านพระยาสุเรนทร์/);
  assert.match(addr, /10510/);
  assert.ok(!/facebook|แนะนำตัว/i.test(addr));
});

test('finalizeCandidateRecord fills empty address from glued facebook raw_text', () => {
  const parsed = finalizeCandidateRecord({
    name: 'ฐปนัท นาดี',
    address: '',
    marital_status: 'วันเกิด18/08/2518 (51 ปี)',
    military_status: 'ได้รับการยกเว้นยานพาหนะที่มีรถยนต์Hard Skill- Express',
    work_experience: [{
      year: '2568',
      company: 'บี ออฟดิเอิร์ธ จำกัด- กรกฎาคม 2568 ถึง ปัจจุบัน (1 ปี 2 เดือน)',
      position: 'ผู้จัดการแผนกบัญชีและการเงิน',
      salary: ',',
      business_type: 'ธุรกิจอื่นๆที่อยู่:573/132 ซอยรมคำแหง',
      responsibilities: 'ดูแลบัญชี',
    }],
    raw_text: [
      RAW_GLUED_FB,
      'สถานะสมรสสถานภาพทางทหารได้รับการยกเว้น',
    ].join(''),
  });
  assert.match(parsed.address || '', /พระยาสุเรนทร์|10510/);
  assert.equal(isJunkPersonalField(parsed.marital_status), false);
  assert.ok(!/วันเกิด|Hard Skill/i.test(parsed.marital_status || ''));
  assert.ok(!/Hard Skill|ยานพาหนะที่มีรถยนต์Hard/i.test(parsed.military_status || ''));
  const work = sanitizeWorkExperience(parsed.work_experience);
  assert.equal(work[0].salary, '');
  assert.match(work[0].company, /บี ออฟดิเอิร์ธ จำกัด$/);
  assert.ok(!/ที่อยู่/.test(work[0].business_type || ''));
});
