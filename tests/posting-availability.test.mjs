import test from 'node:test';
import assert from 'node:assert/strict';
import { postingAvailability } from '../src/core/posting-availability.js';

const now = Date.parse('2026-11-09T04:30:00Z');

// สภาพจริงเช้า 9 พ.ย. 2569: ว่าง 0 · กำลังโพสต์ 3 (โควต้าเต็ม) · พัก 24 · รอยืนยัน 7
test('ไม่มีบัญชีโพสต์ได้: บอกว่าสั่งไม่ได้ เพราะอะไร และบัญชีแรกกลับมาเมื่อไร', () => {
  const accounts = [
    ...Array.from({ length: 3 }, () => ({ status: 'busy', remaining_today: 0, paused_until: null })),
    ...Array.from({ length: 24 }, (_, i) => ({ status: 'paused', remaining_today: 0, paused_until: new Date(Date.parse('2026-11-12T01:20:00Z') + i * 3_600_000).toISOString() })),
    ...Array.from({ length: 7 }, () => ({ status: 'needs_verification', remaining_today: 4, paused_until: null })),
  ];
  const a = postingAvailability(accounts, now);
  assert.equal(a.can_order, false);
  assert.equal(a.next_available_at, '2026-11-12T01:20:00.000Z');
  assert.equal(
    a.message,
    'สั่งโพสต์ไม่ได้ตอนนี้ เพราะไม่มีบัญชีที่โพสต์ได้: Facebook จำกัดแล้วระบบพักไว้ 24 บัญชี (บัญชีแรกกลับมา 12 พ.ย. 08:20) · รอยืนยันตัวตนที่เครื่อง 7 บัญชี · กำลังโพสต์งานอื่นและโควต้าวันนี้เต็มแล้ว 3 บัญชี',
  );
});

test('มีบัญชีกำลังโพสต์แต่ยังเหลือโควต้า = สั่งได้ (ต่อคิว) ไม่มีข้อความ', () => {
  const a = postingAvailability([
    { status: 'busy', remaining_today: 2, paused_until: null },
    { status: 'paused', remaining_today: 0, paused_until: '2026-11-12T01:20:00Z' },
  ], now);
  assert.equal(a.can_order, true);
  assert.equal(a.orderable_accounts, 1);
  assert.equal(a.room_today, 2);
  assert.equal(a.message, null);
});

test('พักที่หมดเวลาแล้วไม่นับเป็นบัญชีแรกที่จะกลับมา', () => {
  const a = postingAvailability([{ status: 'paused', remaining_today: 0, paused_until: '2026-11-08T01:00:00Z' }], now);
  assert.equal(a.next_available_at, null);
  assert.equal(a.message, 'สั่งโพสต์ไม่ได้ตอนนี้ เพราะไม่มีบัญชีที่โพสต์ได้: Facebook จำกัดแล้วระบบพักไว้ 1 บัญชี');
});

test('เลิกใช้โพสต์นับแยกจากพัก และไม่เอาปี 2099 ไปบอกว่าบัญชีแรกกลับมาเมื่อไร', () => {
  const now = Date.parse('2026-11-13T10:00:00+07:00');
  const r = postingAvailability([
    { status: 'paused', remaining_today: 0, paused_until: '2099-12-31T00:00:00Z', pause_reason: 'เลิกใช้โพสต์ — Facebook จำกัดการโพสต์ครบ 4 ครั้ง' },
    { status: 'paused', remaining_today: 0, paused_until: '2026-11-16T09:00:00+07:00', pause_reason: 'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 1 ใน 30 วัน) — พัก 7 วัน' },
  ], now);
  assert.equal(r.counts.retired, 1);
  assert.equal(r.counts.paused, 1);
  assert.equal(r.next_available_at, new Date('2026-11-16T09:00:00+07:00').toISOString());
  assert.match(r.message, /เลิกใช้โพสต์แล้ว 1 บัญชี/);
});
