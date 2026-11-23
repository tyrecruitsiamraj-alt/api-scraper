import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { makeZip, readZipEntry, crc32 } from '../src/core/zip.js';
import { addWorkLinesAiDropped, docxText, extractResumeText, fileKind, missingEssentials, normalizeParsed, workLinesFromText } from '../src/core/resume-upload.js';
import { diffCandidate, listLines } from '../src/core/resume-fields.js';

test('zip: เขียนแล้วอ่านกลับได้ ชื่อไฟล์ภาษาไทยได้', () => {
  const zip = makeZip([
    { name: 'สมชาย ใจดี.pdf', data: Buffer.from('%PDF-1.4 a') },
    { name: 'b.txt', data: Buffer.from('สวัสดี') },
  ]);
  assert.equal(readZipEntry(zip, 'b.txt').toString('utf8'), 'สวัสดี');
  assert.equal(readZipEntry(zip, 'สมชาย ใจดี.pdf').toString(), '%PDF-1.4 a');
  assert.equal(readZipEntry(zip, 'ไม่มี.txt'), null);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

/** .docx จริงบีบอัดแบบ deflate — ประกอบ zip เองให้เหมือนไฟล์จาก Word */
function fakeDocx(xml) {
  const name = Buffer.from('word/document.xml');
  const raw = Buffer.from(xml, 'utf8');
  const data = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(raw), 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(raw), 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

test('อ่านข้อความจาก .docx (ย่อหน้า → บรรทัด, &amp; → &)', () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>นายสมชาย ใจดี</w:t></w:r></w:p><w:p><w:r><w:t>โทร 081-234-5678</w:t><w:tab/><w:t>R&amp;D</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(docxText(fakeDocx(xml)), 'นายสมชาย ใจดี\nโทร 081-234-5678\tR&D');
});

test('ชนิดไฟล์ที่รับ', () => {
  assert.equal(fileKind('resume.PDF'), 'pdf');
  assert.equal(fileKind('cv.docx'), 'docx');
  assert.equal(fileKind('cv.doc'), 'doc');
  assert.equal(fileKind('รูป.jpeg'), 'image');
  assert.equal(fileKind('scan', 'image/png'), 'image');
  assert.equal(fileKind('a.xlsx'), null);
});

test('Word แบบเก่า (.doc) ตีกลับพร้อมบอกวิธีแก้', async () => {
  await assert.rejects(extractResumeText(Buffer.from('x'), 'doc'), /บันทึกเป็น \.docx หรือ PDF/);
});

test('จัดค่าที่ AI ตอบ: เบอร์ตัวเลขล้วน อีเมลผิดรูปทิ้ง แยกชื่อไทย ตัดแถวว่าง', () => {
  const p = normalizeParsed({
    full_name: 'นางสาว สุดา  มีสุข',
    phone: '081-234-5678',
    email: 'not-an-email',
    age: '28 ปี',
    education: [{ degree: 'ปริญญาตรี', institution: 'ม.เกษตรศาสตร์' }, { degree: '', institution: '' }],
    work_experience: [{ position: 'ธุรการ', company: 'บจก. เอ' }, {}],
    hard_skills: ['Excel', ''],
    language_skills: [{ language: 'อังกฤษ', level: 'พอใช้' }, { language: '' }],
  });
  assert.equal(p.phone, '0812345678');
  assert.equal(p.email, '');
  assert.equal(p.age, '28');
  assert.equal(p.first_name, 'สุดา');
  assert.equal(p.last_name, 'มีสุข');
  assert.equal(p.education.length, 1);
  assert.equal(p.work_experience.length, 1);
  assert.deepEqual(p.hard_skills, ['Excel']);
  assert.equal(p.language_skills.length, 1);
});

test('ต้องมีชื่อ และเบอร์หรืออีเมล', () => {
  assert.match(missingEssentials({ full_name: '', phone: '0812345678' }), /ชื่อ/);
  assert.match(missingEssentials({ full_name: 'สุดา มีสุข' }), /เบอร์โทรหรืออีเมล/);
  assert.equal(missingEssentials({ full_name: 'สุดา มีสุข', email: 'suda@gmail.com' }), null);
});

test('ตารางเทียบ: โชว์เฉพาะช่องที่ต่างและข้อมูลใหม่ไม่ว่าง · เบอร์เขียนต่างแบบถือว่าเหมือน', () => {
  const current = { full_name: 'สุดา มีสุข', phone: '+66812345678', province: 'กรุงเทพมหานคร', education: [{ degree: 'ปวส.', institution: 'วิทยาลัยเทคนิค' }] };
  const incoming = {
    full_name: 'สุดา มีสุข',
    phone: '0812345678',
    province: 'นนทบุรี',
    address: '',
    expected_salary: '18000',
    education: [{ degree: 'ปริญญาตรี', institution: 'ม.เกษตรศาสตร์' }],
    hard_skills: [],
  };
  const d = diffCandidate(current, incoming);
  assert.deepEqual(d.map((r) => r.key), ['province', 'expected_salary', 'education']);
  assert.deepEqual(d[0], { key: 'province', label: 'จังหวัด', kind: 'text', current: ['กรุงเทพมหานคร'], incoming: ['นนทบุรี'] });
  assert.deepEqual(d[1].current, []);
  assert.deepEqual(d[2].incoming, ['ปริญญาตรี · ม.เกษตรศาสตร์']);
  assert.deepEqual(listLines('work_experience', [{ position: 'ธุรการ', company: 'บจก. เอ', period: '2565-2567' }]), ['ธุรการ · บจก. เอ · 2565-2567']);
});

// 23 พ.ย. 2569: เรซูเม่ 9 งาน งานล่าสุดไม่มีบรรทัดตำแหน่ง AI ตอบมา 8 งาน
const NINE_JOBS = `สมศักดิ์ ตัวอย่าง

## ประวัติการทำงาน

*   **2549-2550** Plus property
    *   ตำแหน่ง ช่างเทคนิค ฝ่ายวิศวกรรม
*   **2551-2552** Muang Thai Management Co., Ltd.
    *   ตำแหน่ง ช่างซ่อมบำรุง
*   **2565-2566** First Pacific Harrison Co.,LTD
    *   ตำแหน่ง รองผู้ช่วยหัวหน้าช่างอาคาร
*   **2567-2568** CI Property Management Co.,LTD

## ข้อมูลส่วนตัว

*   **อายุ :** 44 ปี
*   จัดตั้ง : 2550-2551 ไม่ใช่งาน`;

test('a job the text lists but the AI dropped is added back, with its position when the next line has one', () => {
  const ai = {
    full_name: 'สมศักดิ์ ตัวอย่าง',
    work_experience: [
      { position: 'รองผู้ช่วยหัวหน้าช่างอาคาร', company: 'First Pacific Harrison Co.,LTD', period: '2565-2566' },
      { position: 'ช่างซ่อมบำรุง', company: 'Muang Thai Management Co., Ltd.', period: '2551 - 2552' },
      { position: 'ช่างเทคนิค ฝ่ายวิศวกรรม', company: 'Plus property', period: '2549-2550' },
    ],
  };
  const work = normalizeParsed(ai, NINE_JOBS).work_experience;
  assert.deepEqual(work.map((w) => w.period), ['2567-2568', '2565-2566', '2551 - 2552', '2549-2550']);
  assert.equal(work[0].company, 'CI Property Management Co.,LTD');
  assert.equal(work[0].position, '');
  assert.deepEqual(workLinesFromText(NINE_JOBS).map((w) => w.position), ['ช่างเทคนิค ฝ่ายวิศวกรรม', 'ช่างซ่อมบำรุง', 'รองผู้ช่วยหัวหน้าช่างอาคาร', '']);
});

test('no work heading in the text = nothing is guessed from year lines', () => {
  assert.deepEqual(workLinesFromText('ประวัติการศึกษา\n2550-2553 มหาวิทยาลัยตัวอย่าง'), []);
  const work = addWorkLinesAiDropped([], 'ประสบการณ์ทำงาน\n- 2560-2562 บริษัท เอ จำกัด\n  ติดต่อประสานงานลูกค้า\n- 2562-ปัจจุบัน บริษัท บี จำกัด\nการศึกษา\n2555-2559 มหาวิทยาลัยตัวอย่าง');
  assert.deepEqual(work.map((w) => w.company), ['บริษัท เอ จำกัด', 'บริษัท บี จำกัด']);
});
