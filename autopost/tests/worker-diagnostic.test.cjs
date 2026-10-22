const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFailure, describeWorkerFailure } = require('../server/worker-diagnostic');

// รูปแบบเดียวกับ output ของ Playwright (list reporter) บน RM009 ตอนล็อกอินไม่ผ่าน
const LOGIN_FAIL = [
  '\u001b[1A\u001b[2KRunning 1 test using 1 worker',
  '⏳ กำลังโหลด Assignments จากฐานข้อมูล...',
  '🗓️ [Tyni Aiit] แผนวันนี้ 10 โพสต์ (โควต้า 5/วัน โพสต์แล้ว 5)',
  '✅ [Tyni Aiit] พบ session เดิมแล้ว ตรวจสอบสถานะก่อนโพสต์...',
  '⚠️ [Tyni Aiit] session เดิมไม่พร้อม — อาจต้องยืนยันตัวตน (รอ ~5 นาที)',
  '  1) [GoogleChrome] › tests\\postAll.spec.ts:45:5 › Dynamic Post: รันโพสต์ตาม Assignments ─────',
  '',
  '    Error: session หมดอายุหรือยังไม่ผ่านการยืนยัน — ใช้ปุ่มล็อกอิน Facebook ใน Users แล้วทำขั้นตอนใน Chrome ให้ครบ',
  '',
  '      187 |         if (!ok) {',
  '    > 189 |           throw new Error(',
  '        at facebookLogin (C:\\so\\autopost\\src\\helpers\\facebookLogin.ts:189:17)',
  '',
  '    attachment #1: trace (application/zip) ─────',
  '    test-results\\postAll-Dynamic-Post-รันโพสต์ตาม-Assignments-GoogleChrome\\trace.zip',
  '    Usage:',
  '        npx playwright show-trace test-results\\postAll-Dynamic-Post\\trace.zip',
  '  Slow test file: [GoogleChrome] › tests\\postAll.spec.ts (6.7m)',
  '  1 failed',
  '    [GoogleChrome] › tests\\postAll.spec.ts:45:5 › Dynamic Post: รันโพสต์ตาม Assignments ─────',
].join('\r\n');

test('picks the thrown error, not the Playwright summary', () => {
  const { reason, lastSteps } = extractFailure(LOGIN_FAIL);
  assert.match(reason, /^session หมดอายุหรือยังไม่ผ่านการยืนยัน/);
  assert.equal(lastSteps.length, 3);
  assert.match(lastSteps[2], /session เดิมไม่พร้อม/);
});

test('message for the task page starts with the reason', () => {
  const msg = describeWorkerFailure(1, LOGIN_FAIL);
  assert.match(msg.split('\n')[0], /^session หมดอายุ/);
  assert.match(msg, /ขั้นสุดท้ายก่อนหยุด:\n/);
  assert.doesNotMatch(msg, /trace\.zip|1 failed/);
});

test('Playwright timeout errors keep their text', () => {
  const out = [
    '  1) [GoogleChrome] › tests\\postAll.spec.ts:45:5 › x',
    '    TimeoutError: page.goto: Timeout 120000ms exceeded.',
  ].join('\n');
  assert.equal(extractFailure(out).reason, 'page.goto: Timeout 120000ms exceeded.');
});

test('whole-test timeout becomes minutes', () => {
  const out = '  1) [GoogleChrome] › tests\\postAll.spec.ts:45:5 › x\n    Test timeout of 1500000ms exceeded.';
  assert.equal(extractFailure(out).reason, 'หมดเวลาของรอบ (25 นาที)');
});

test('no error line: falls back to the output tail', () => {
  const msg = describeWorkerFailure(3, 'npm ERR! missing script\nsomething else');
  assert.match(msg, /^เครื่องหยุดทำงานกลางคัน \(exit code 3\)/);
  assert.match(msg, /something else/);
});
