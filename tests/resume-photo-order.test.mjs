import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePhotoBox } from '../src/core/resume-photo.js';
import { orderWork } from '../src/core/resume-upload.js';

// 19 พ.ย. 2569: เรซูเม่รูปอ่านผ่านแล้วแต่ฟอร์มไม่มีรูป · งานล่าสุดหายตรงรอยตัดแถบ / ไปอยู่ท้ายรายการ
test('กรอบรูปหน้าคนจาก AI: ใช้ได้เฉพาะกรอบที่สมเหตุสมผล', () => {
  assert.deepEqual(parsePhotoBox('```json\n{"found": true, "box": [90, 272, 259, 391]}\n```'), [90, 272, 259, 391]);
  assert.equal(parsePhotoBox('{"found": false}'), null);
  assert.equal(parsePhotoBox('{"found": true, "box": [0, 0, 1000, 1000]}'), null, 'ทั้งหน้า ไม่ใช่รูปคน');
  assert.equal(parsePhotoBox('{"found": true, "box": [10, 10, 30, 30]}'), null, 'เล็กเกินไป');
  assert.equal(parsePhotoBox('{"found": true, "box": [100, 100, 900, 130]}'), null, 'แถบยาวบาง');
  assert.equal(parsePhotoBox('{"found": true, "box": [300, 300, 200, 400]}'), null);
  assert.equal(parsePhotoBox('ไม่พบรูป'), null);
});

const W = (company, period, position = '') => ({ company, period, position, salary: '', responsibilities: '' });

test('งานเรียงล่าสุดก่อน · ปัจจุบันบนสุด · งานซ้ำเหลืออันเดียว · งานไม่มีปีอยู่ใต้งานก่อนหน้า', () => {
  const out = orderWork([
    W('First Pacific Harrison', '2565-2566', 'รองผู้ช่วยหัวหน้าช่างอาคาร'),
    W('Plus property', '2549-2550', 'ช่างเทคนิค'),
    W('C1 Property Management', '2567-2568', 'หัวหน้าช่างอาคาร'),
    W('First Pacific Harrison', '2565 - 2566', ''),
    W('บริษัทใหม่', '2023 - ปัจจุบัน', 'หัวหน้า'),
    W('ไม่ระบุปี', '', 'พนักงาน'),
  ]);
  assert.deepEqual(out.map((w) => w.company), ['บริษัทใหม่', 'ไม่ระบุปี', 'C1 Property Management', 'First Pacific Harrison', 'Plus property']);
  assert.equal(out.find((w) => w.company === 'First Pacific Harrison').position, 'รองผู้ช่วยหัวหน้าช่างอาคาร');
});

test('AI ไม่ตัดงานที่ไม่มีตำแหน่ง · แถบซ้อนกัน 8% · บันทึกรูปหน้าคนเป็นรูปโปรไฟล์', () => {
  const src = fs.readFileSync(new URL('../src/core/resume-upload.js', import.meta.url), 'utf8');
  assert.match(src, /งานที่มีบริษัทหรือช่วงเวลาแต่ไม่เห็นตำแหน่ง ให้ใส่ด้วย position เว้นว่าง ห้ามตัดทิ้ง/);
  const strips = fs.readFileSync(new URL('../src/core/image-strips.js', import.meta.url), 'utf8');
  assert.match(strips, /overlapRatio = 0\.08/);
  const db = fs.readFileSync(new URL('../src/db/resume-uploads.js', import.meta.url), 'utf8');
  assert.match(db, /kind: 'profile',\n\s+title: 'รูปจากเรซูเม่ที่อัปโหลด'/);
  // คนเดิมที่ยังไม่มีรูป ได้รูปจากไฟล์ที่อัปซ้ำ · มีรูปแล้วไม่ทับ
  assert.match(db, /WHERE candidate_id = \$1 AND kind = 'profile' AND download_status = 'success' LIMIT 1/);
  assert.match(db, /await addPhotoIfMissing\(existing, row, kind\)/);
  const models = fs.readFileSync(new URL('../src/core/ai-models.js', import.meta.url), 'utf8');
  assert.match(models, /filter\(\(m\) => !isCloudModel\(m\) && !isOcrModel\(m\)/, 'รูปผู้สมัครห้ามส่งไป cloud');
});
