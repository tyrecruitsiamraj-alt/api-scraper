import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finalizeCandidateRecord,
  isJunkAddress,
  stripJobbkkSiteChrome,
} from '../src/providers/jobbkk/parser.js';
import { needsRepair } from '../src/core/repair-incomplete-candidates.js';

const ADDRESS_I18N = [
  '\\",\\"address_placeholder\\":\\"ที่อยู่\\",\\"country\\":\\"ประเทศ\\",\\"thailand\\":\\"ประเทศไทย\\"',
  '\\",\\"other_country\\":\\"ต่างประเทศ\\",\\"province\\":\\"จังหวัด\\",\\"district\\":\\"เขต/อำเภอ\\"',
  '\\",\\"subdistrict\\":\\"แขวง/ตำบล\\",\\"postal_code\\":\\"รหัสไปรษณีย์\\"',
  '\\",\\"introduce_yourself_label\\":\\"แนะนำตัวเอง\\",\\"introduce_yourself_placeholder\\":\\"โปรดเขียนแนะนำตัวเองสั้น ๆ เกี่ยวกับประสบการณ์ ทักษะ และเหตุผลที่สนใจสมัครงาน',
].join('');

test('isJunkAddress detects JobBKK address form i18n', () => {
  assert.equal(isJunkAddress(ADDRESS_I18N), true);
  assert.equal(isJunkAddress('9/30 ซอยสุขาภิบาล 5 เขตสายไหม กรุงเทพมหานคร 10220'), false);
});

test('stripJobbkkSiteChrome clears address form i18n blob', () => {
  const stripped = stripJobbkkSiteChrome(ADDRESS_I18N);
  assert.ok(!/address_placeholder|postal_code|introduce_yourself/i.test(stripped));
  assert.ok(stripped.length < 40);
});

test('finalizeCandidateRecord clears junk address and can refill from raw_text', () => {
  const parsed = finalizeCandidateRecord({
    name: 'นายทดสอบ',
    address: ADDRESS_I18N,
    raw_text: [
      'เพศ : ชาย อายุ 27 ปี',
      'ที่อยู่ปัจจุบัน นนทบุรี 11000 ประเทศไทย',
      'เบอร์โทรศัพท์ 0844444444 Soft Skills',
    ].join(' '),
  });
  assert.ok(!/address_placeholder|postal_code/i.test(parsed.address || ''));
  assert.match(parsed.address || '', /นนทบุรี|11000/);
  assert.ok(!/เบอร์โทรศัพท์|Soft Skills/i.test(parsed.address || ''));
});

test('isJunkAddress keeps short real addresses', () => {
  assert.equal(isJunkAddress('นนทบุรี'), false);
  assert.equal(isJunkAddress('กรุงเทพมหานคร'), false);
});

test('needsRepair treats address i18n as incomplete', () => {
  assert.equal(needsRepair({
    phone: '0811111111',
    email: 'a@b.com',
    gender: 'ชาย',
    age: '30',
    address: ADDRESS_I18N,
    province: 'นนทบุรี',
    desired_positions: 'พนักงานขับรถ',
    expected_salary: '18000',
    education: [{ institution: 'มหาวิทยาลัยก', degree: 'ปริญญาตรี' }],
    work_experience: [{ company: 'บริษัท ก', position: 'ขาย' }],
  }), true);
});
