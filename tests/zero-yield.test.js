import test from 'node:test';
import assert from 'node:assert/strict';
import { isZeroYieldRound, zeroYieldNote, ZERO_YIELD_MIN_OPENED } from '../src/core/zero-yield.js';

// เคสจริง LAM6909001 2 พ.ย. 2569: อายุ 20–20 เปิด 60 ผ่าน 0 แล้ววนตำแหน่งถัดไปอีก 3 รอบจนชนเพดานวัน
const lam = { status: 'partial', found: 105, opened: 60, qualified: 0, needsReview: 0, error: 'เว็บให้มา 105 คน เปิดดู 60 คน แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไข · อายุไม่อยู่ในช่วง 23' };

test('เปิดเยอะแล้วผ่าน 0 = หยุดวนตำแหน่ง', () => {
  assert.equal(isZeroYieldRound(lam, 20), true);
});

test('มีคนผ่านหรือรอตรวจแม้คนเดียว ยังค้นต่อได้', () => {
  assert.equal(isZeroYieldRound({ ...lam, qualified: 1 }, 20), false);
  assert.equal(isZeroYieldRound({ ...lam, needsReview: 2 }, 20), false);
});

test('เปิดน้อยกว่าเป้ายังสรุปไม่ได้ว่าเงื่อนไขผิด', () => {
  assert.equal(isZeroYieldRound({ ...lam, opened: 5 }, 20), false);
  assert.equal(isZeroYieldRound({ ...lam, opened: ZERO_YIELD_MIN_OPENED }, 3), true);
});

test('รอบที่ชนเพดาน/ล้ม/ถูกปิด ไม่นับเป็นเงื่อนไขผิด', () => {
  assert.equal(isZeroYieldRound({ ...lam, status: 'cooldown', opened: 0 }, 20), false);
  assert.equal(isZeroYieldRound({ ...lam, status: 'failed' }, 20), false);
  assert.equal(isZeroYieldRound({ ...lam, status: 'stopped' }, 20), false);
});

test('ข้อความบนจอบอกเหตุที่ตกและบอกให้รอแก้เงื่อนไข', () => {
  const note = zeroYieldNote(lam);
  assert.match(note, /ถูกคัดออกทั้งหมดด้วยเงื่อนไข/);
  assert.match(note, /อายุไม่อยู่ในช่วง 23/);
  assert.match(note, /รอแก้เงื่อนไข/);
  assert.match(zeroYieldNote({ opened: 60 }), /เปิด Resume 60 ใบ/);
});
