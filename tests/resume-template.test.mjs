import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RESUME_TEMPLATE, SAMPLE_CANDIDATE, buildResumeHtml, normalizeTemplateSettings } from '../web/lib/resume-template.ts';

test('ค่าแปลกจากฟอร์ม/ฐาน กลับเป็นค่าที่ใช้ได้', () => {
  const t = normalizeTemplateSettings({
    layout: 'x', font: 'Comic Sans', textColor: 'red', accentColor: '#7F1D1D', logo: 'javascript:alert(1)',
    watermark: 'logo', watermarkOpacity: 99, sections: ['work', 'bogus', 'work', 'education'], footerText: 'ท้าย',
  });
  assert.equal(t.layout, 'classic');
  assert.equal(t.font, 'Kanit');
  assert.equal(t.textColor, DEFAULT_RESUME_TEMPLATE.textColor);
  assert.equal(t.accentColor, '#7F1D1D');
  assert.equal(t.logo, '', 'โลโก้ต้องเป็นรูปเท่านั้น');
  assert.equal(t.watermark, 'none', 'ลายน้ำโลโก้แต่ไม่มีโลโก้ = ไม่มีลายน้ำ');
  assert.equal(t.watermarkOpacity, 30);
  assert.deepEqual(t.sections, ['work', 'education']);
});

test('ซ่อนเบอร์ = ไม่มีเบอร์/อีเมลในเรซูเม่ · หัวข้อที่ปิดไม่แสดง · ลำดับตามที่ตั้ง', () => {
  const html = buildResumeHtml(SAMPLE_CANDIDATE, null, { showContacts: false, sections: ['work', 'education'], footerText: 'ส่งลูกค้า' });
  assert.ok(!html.includes('080-000-0000'));
  assert.ok(!html.includes('sample@example.com'));
  assert.ok(!html.includes('<h2>ข้อมูลส่วนตัว</h2>'));
  assert.ok(html.indexOf('ประสบการณ์ทำงาน') < html.indexOf('การศึกษา'));
  assert.ok(html.includes('ส่งลูกค้า · นางสาวตัวอย่าง ใจดี'));
});

test('ข้อความจากผู้ใช้ถูก escape (ชื่อแบบฟอร์ม/ลายน้ำ/ข้อมูลผู้สมัคร)', () => {
  const html = buildResumeHtml({ ...SAMPLE_CANDIDATE, full_name: '<script>x</script>' }, null, { watermark: 'text', watermarkText: '<b>wm</b>' });
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;b&gt;wm&lt;/b&gt;'));
});
