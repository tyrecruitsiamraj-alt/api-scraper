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
  assert.equal(t.watermarkOpacity, 60);
  assert.deepEqual(t.sections, ['work', 'education']);
});

test('ซ่อนเบอร์ = ไม่มีเบอร์/อีเมลในเรซูเม่ · หัวข้อที่ปิดไม่แสดง · ลำดับตามที่ตั้ง', () => {
  const c = { ...SAMPLE_CANDIDATE, phone: '080-000-0000', email: 'sample@example.com', gender: 'หญิง' };
  const html = buildResumeHtml(c, null, { showContacts: false, sections: ['work', 'education'], footerText: 'ส่งลูกค้า' });
  assert.ok(!html.includes('080-000-0000'));
  assert.ok(!html.includes('sample@example.com'));
  assert.ok(!html.includes('<h2>ข้อมูลส่วนตัว</h2>'));
  assert.ok(html.indexOf('ประสบการณ์ทำงาน') < html.indexOf('การศึกษา'));
  assert.ok(html.includes('ส่งลูกค้า · Watcharaporn Promwong'));
});

test('ข้อความจากผู้ใช้ถูก escape (ชื่อแบบฟอร์ม/ลายน้ำ/ข้อมูลผู้สมัคร)', () => {
  const html = buildResumeHtml({ ...SAMPLE_CANDIDATE, full_name: '<script>x</script>' }, null, { watermark: 'text', watermarkText: '<b>wm</b>' });
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;b&gt;wm&lt;/b&gt;'));
});

test('แบบแถบขวา: ทักษะ/ภาษา/ข้อมูลส่วนตัวอยู่แถบขวา งานกับการศึกษาอยู่ซ้าย · ลายน้ำซ้ำเต็มหน้า', () => {
  const html = buildResumeHtml({ ...SAMPLE_CANDIDATE, gender: 'หญิง' }, null, { layout: 'profile', watermark: 'text', watermarkText: 'SO', watermarkTile: true });
  const side = html.slice(html.indexOf('<aside class="pf-side">'));
  const main = html.slice(html.indexOf('<main>'), html.indexOf('<aside class="pf-side">'));
  assert.ok(side.includes('Coordination &amp; documentation') && side.includes('เพศ: หญิง'));
  assert.ok(main.includes('ประสบการณ์ทำงาน') && main.includes('การศึกษา'));
  assert.ok(html.includes('Tourism Marketing  |  Travel Agent Relations  |  Customer Service'));
  assert.equal((html.match(/<span style="left:[\d.]+%;top:[\d.]+%">SO<\/span>/g) ?? []).length, 18);
});

test('แบบที่บันทึกก่อนมีรูปลายน้ำแยก: ลายน้ำโลโก้ยังใช้โลโก้เดิม · ตั้งรูปลายน้ำเองได้แยกจากโลโก้', () => {
  const logo = 'data:image/png;base64,AAAA';
  const old = normalizeTemplateSettings({ logo, watermark: 'both', watermarkOpacity: 14 });
  assert.equal(old.watermarkImage, logo);
  assert.equal(old.watermarkImageOpacity, 14);
  const own = normalizeTemplateSettings({ logo, watermark: 'logo', watermarkImage: 'data:image/svg+xml;base64,BBBB', watermarkImageSize: 29, watermarkImageOpacity: 17 });
  const html = buildResumeHtml(SAMPLE_CANDIDATE, null, own);
  assert.ok(html.includes('<div class="wm wm-img"><img src="data:image/svg+xml;base64,BBBB"'));
  assert.ok(html.includes('.wm-img { opacity: 0.17; }') && html.includes('width: 29%'));
  assert.equal(normalizeTemplateSettings({ watermark: 'logo', watermarkImage: '' }).watermark, 'none', 'เลือกลายน้ำรูปแต่ไม่มีรูป = ไม่มีลายน้ำ');
});

test('แบบแถบขวา: หัวข้ออังกฤษ · ใต้ชื่อเป็น headline (ไม่มี = ตำแหน่งงานล่าสุด) · กิจกรรม/ความเชี่ยวชาญ/จุดเด่นอยู่แถบขวา', () => {
  const html = buildResumeHtml(SAMPLE_CANDIDATE, null, { layout: 'profile', headingLang: 'en', sections: ['intro', 'work', 'education', 'skills'] });
  for (const h of ['Profile', 'Work Experience', 'Education', 'Languages', 'Activity', 'Expertise', 'Strengths']) assert.ok(html.includes(`<h2>${h}</h2>`), h);
  assert.ok(html.includes('<div class="pf-sub">Tourism Marketing / Travel Agent Relations (Senior Officer)</div>'));
  assert.ok(html.includes('Class of 2012'));
  const side = html.slice(html.indexOf('<aside class="pf-side">'));
  // ลำดับตามรูปตัวอย่าง: Languages → Activity → Expertise → Strengths
  const at = (x) => side.indexOf(x);
  assert.ok(at('TOEIC score 805') < at('Cobra Gold 2018') && at('Cobra Gold 2018') < at('Leadership') && at('Leadership') < at('Customer &amp; guest service'));
  const noHeadline = buildResumeHtml({ ...SAMPLE_CANDIDATE, headline: '', activities: [] }, null, { layout: 'profile', headingLang: 'th' });
  assert.ok(noHeadline.includes('<div class="pf-sub">Travel Agent Relations / Tourism Marketing (Senior Officer)</div>'));
  assert.ok(!noHeadline.includes('<h2>กิจกรรม</h2>'), 'ไม่มีกิจกรรม = ไม่มีหัวข้อ');
  assert.ok(noHeadline.includes('<h2>ทักษะเฉพาะทาง</h2>'), 'หัวข้อไทยตามแบบ 12 พ.ย.');
});

test('ตัดให้จบหน้าเดียว: เอางานตามลำดับที่ติ๊กออก · ซ่อนรายละเอียดหน้าที่ · ไม่แก้ข้อมูลเดิม', async () => {
  const { parseResumeTrim, trimResumeCandidate } = await import('../web/lib/resume-template.ts');
  const trim = parseResumeTrim(new URLSearchParams('hide_work=6,1,1,x,-2,500&details=0'));
  assert.deepEqual(trim, { hideWork: [6, 1], hideDetails: true });
  const out = trimResumeCandidate(SAMPLE_CANDIDATE, trim);
  assert.deepEqual(out.work_experience.map((w) => w.position), [
    'Travel Agent Relations / Tourism Marketing (Senior Officer)', 'Administrator', 'Student Services and Housing Coordinator', 'Passenger Service Agent', 'English Program Academician',
  ]);
  assert.ok(out.work_experience.every((w) => !w.responsibilities));
  assert.equal(SAMPLE_CANDIDATE.work_experience.length, 7, 'ข้อมูลเดิมไม่ถูกแก้');
  assert.ok(SAMPLE_CANDIDATE.work_experience[0].responsibilities);
  assert.equal(trimResumeCandidate(SAMPLE_CANDIDATE, parseResumeTrim(new URLSearchParams(''))), SAMPLE_CANDIDATE, 'ไม่ส่ง = ไม่ตัด');
  const html = buildResumeHtml(out, null, { layout: 'profile' });
  assert.ok(!html.includes('Waitress, Rooftop Bar') && !html.includes('Taking orders'));
});
