import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_CANDIDATE, applyResumeFields, buildResumeHtml, defaultResumeFields, parseResumeFields } from '../web/lib/resume-template.ts';

// 19 พ.ย. 2569: เจ้าของอยากเลือกทีละช่องตอนโหลดว่าจะโชว์อะไรใน Resume
const PROFILE = { layout: 'profile', headingLang: 'en', showContacts: false, showPhoto: true, sections: ['intro', 'work', 'education', 'skills', 'personal'] };
const C = { ...SAMPLE_CANDIDATE, age: '44', religion: 'พุทธ', phone: '0621234567', line_id: 'testline', address: '10/3 ซอยทดสอบ', intro: '' };

test('ค่าตั้งต้นตามแบบฟอร์ม: แบบแถบขวาโชว์ข้อมูลส่วนตัว ไม่โชว์เบอร์/ที่อยู่', () => {
  const d = defaultResumeFields(PROFILE);
  for (const k of ['work', 'education', 'skills', 'photo', 'age', 'religion']) assert.ok(d.includes(k), k);
  for (const k of ['phone', 'line_id', 'email', 'address', 'wanted']) assert.ok(!d.includes(k), k);
});

test('ไม่ติ๊กศาสนา = ไม่ขึ้น · ติ๊กเบอร์ = ขึ้นเฉพาะเบอร์ ไม่พา LINE/ที่อยู่มาด้วย', () => {
  const shown = new Set(defaultResumeFields(PROFILE).filter((k) => k !== 'religion').concat('phone'));
  const { candidate, settings } = applyResumeFields(C, PROFILE, shown);
  const html = buildResumeHtml(candidate, null, settings);
  assert.match(html, /อายุ: 44 ปี/);
  assert.doesNotMatch(html, /ศาสนา: พุทธ/);
  assert.match(html, /0621234567/);
  assert.doesNotMatch(html, /testline/);
  assert.doesNotMatch(html, /ซอยทดสอบ/);
});

test('ติ๊กที่อยู่ในแบบแถบขวา = ขึ้นในข้อมูลส่วนตัว · เอาหัวข้อออกได้', () => {
  const shown = new Set(['education', 'age', 'address']);
  const { candidate, settings } = applyResumeFields(C, PROFILE, shown);
  assert.deepEqual(settings.sections, ['education', 'personal']);
  const html = buildResumeHtml(candidate, null, settings);
  assert.match(html, /ซอยทดสอบ/);
  assert.doesNotMatch(html, /0621234567/);
  assert.equal(settings.showPhoto, false);
});

test('ไม่ส่ง ?fields = ใช้ตามแบบฟอร์ม · ช่องที่ไม่รู้จักถูกทิ้ง', () => {
  assert.equal(parseResumeFields(new URLSearchParams('template=profile')), null);
  assert.deepEqual([...parseResumeFields(new URLSearchParams('fields=age,bogus,phone'))], ['age', 'phone']);
  assert.deepEqual([...parseResumeFields(new URLSearchParams('fields='))], []);
});
