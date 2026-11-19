import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOcrText, ocrLooksCut } from '../src/core/ollama.js';
import { imageMime, stripBounds } from '../src/core/image-strips.js';

// 19 พ.ย. 2569: เรซูเม่รูป 2 คอลัมน์ อ่านทั้งหน้าได้แค่ชื่อบนสุด + แบบฟอร์มที่โมเดลจำมา (107 ตัว) → อ่านชื่อไม่ได้
const CUT = 'นวพรรณ์ ดิษฐบริรักษ์\nNA\nRAW_TEXT_START\nPage dimensions: 1240.5x2376.8\n[Image 0x0 to 1240x2377]\nRAW_TEXT_END';

test('ตัดบรรทัดขยะของโมเดลอ่านรูป เก็บตัวหนังสือในเอกสาร', () => {
  assert.equal(cleanOcrText(CUT), 'นวพรรณ์ ดิษฐบริรักษ์');
  const echo = '**Extract all text from the image.\n\nInstructions:\n- Only return the clean Markdown.\n- Do not include any explanation or extra text.\n- ตำแหน่ง ช่างอาคาร';
  assert.equal(cleanOcrText(echo), '- ตำแหน่ง ช่างอาคาร');
  assert.equal(cleanOcrText('ชื่อ สมชาย\nโทร 081'), 'ชื่อ สมชาย\nโทร 081');
});

test('อ่านซ้ำเป็นแถบเมื่อเจอขยะหรือแทบไม่ได้ตัวหนังสือ · ไฟล์ตัวหนังสือน้อยแต่ครบไม่อ่านซ้ำ', () => {
  assert.equal(ocrLooksCut(CUT, cleanOcrText(CUT)), true);
  assert.equal(ocrLooksCut('', ''), true);
  const card = 'บัตรประจำตัวประชาชน ชื่อ นายสมชาย ใจดี เกิดวันที่ 1 ม.ค. 2530';
  assert.equal(ocrLooksCut(card, cleanOcrText(card)), false);
  assert.equal(ocrLooksCut('ชื่อ\nNA\nโทร 081 234 5678 อีเมล somchai@example.com', 'ชื่อ\nโทร 081 234 5678 อีเมล somchai@example.com'), false, 'NA บรรทัดเดียวไม่นับเป็นขยะ');
});

test('แถบซ้อนกันเล็กน้อยและครอบทั้งรูป', () => {
  const s = stripBounds(1522, 3);
  assert.equal(s.length, 3);
  assert.equal(s[0].top, 0);
  assert.equal(s[2].top + s[2].height, 1522);
  for (let i = 1; i < s.length; i += 1) assert.ok(s[i].top < s[i - 1].top + s[i - 1].height, 'ต้องซ้อนกัน');
});

test('ชนิดรูปจากหัวไฟล์', () => {
  assert.equal(imageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(imageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'image/png');
  assert.equal(imageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'image/webp');
});
