import test from 'node:test';
import assert from 'node:assert/strict';
import { cutRepeatedTail } from '../src/core/ollama.js';

// 16 พ.ย. 2569: โมเดลอ่านรูปวนพิมพ์บรรทัดเดิมจนเซิร์ฟเวอร์ตัดทิ้ง — เก็บส่วนที่อ่านได้ก่อนวน
test('ตัดท้ายที่วนซ้ำ เก็บส่วนที่อ่านได้จริง', () => {
  const read = 'ชื่อ สมชาย ใจดี\nโทร 081 234 5678\nการศึกษา';
  assert.equal(cutRepeatedTail(`${read}\nปริญญาตรี\nปริญญาตรี\nปริญญาตรี\nปริญญาตรี\nปริญญาตรี`), `${read}\nปริญญาตรี\nปริญญาตรี`);
  assert.equal(cutRepeatedTail(read), read, 'ไม่วน = ไม่ตัด');
  assert.equal(cutRepeatedTail('ก\n\n\n\nข'), 'ก\n\n\n\nข', 'บรรทัดว่างซ้ำไม่นับว่าวน');
  assert.equal(cutRepeatedTail('ก\nข\nก\nข'), 'ก\nข\nก\nข', 'ซ้ำแต่ไม่ติดกันไม่ตัด');
});
