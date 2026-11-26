import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyScrapeTaskResult, dailyRemaining, isNetworkError, networkRetryAt, nextQuotaReset, offlineWaitExpired, requireSuccessfulScrapeTaskResult } from '../src/core/scrape-task-result.js';
import { scrapeFailNote } from '../src/core/jarvis-scrape-status.js';

test('queue accepts a completed or partial scrape task result', () => {
  const done = { status: 'done', matchedTotal: 15, target: 15 };
  const partial = { status: 'partial', matchedTotal: 7, target: 15 };
  assert.equal(requireSuccessfulScrapeTaskResult(done), done);
  assert.equal(requireSuccessfulScrapeTaskResult(partial), partial);
});

test('แยกตลาดมีคนไม่พอออกจากระบบขัดข้อง', () => {
  assert.equal(classifyScrapeTaskResult({ status: 'done', matchedTotal: 15, target: 15 }), 'completed');
  assert.equal(classifyScrapeTaskResult({ status: 'partial', matchedTotal: 7, target: 15 }), 'market_insufficient');
  assert.equal(classifyScrapeTaskResult({ status: 'error', error: 'login failed' }), 'infrastructure_error');
});

test('queue rejects a scrape task that failed internally', () => {
  assert.throws(
    () => requireSuccessfulScrapeTaskResult({ status: 'error', error: 'search timeout' }),
    /search timeout/,
  );
});

test('คิวซ้ำของงานที่อีกช่องรันอยู่แล้ว: ปิดเงียบ ไม่ลองใหม่', () => {
  const dup = { skipped: true, reason: 'task_already_running' };
  assert.equal(requireSuccessfulScrapeTaskResult(dup), dup);
  assert.equal(classifyScrapeTaskResult(dup), 'already_running');
});

test('งานที่ข้ามด้วยเหตุอื่นยังนับว่าล้ม', () => {
  assert.throws(() => requireSuccessfulScrapeTaskResult({ skipped: true, reason: 'something_else' }), /something_else/);
});

test('บัญชีถูกพัก: คิวรอจนพ้นเวลาพัก ไม่ลองใหม่ทันที', () => {
  const until = '2026-10-29T10:00:00.000Z';
  try {
    requireSuccessfulScrapeTaskResult({ status: 'error', runStatus: 'cooldown', cooldownUntil: until, error: 'บัญชีถูกพัก' });
    assert.fail('ต้อง throw');
  } catch (e) {
    assert.equal(e.retryAt.toISOString(), until);
  }
});

test('คนกดปิดงานระหว่างรัน = หยุด ไม่ใช่ระบบขัดข้อง', () => {
  const stopped = { status: 'stopped', matchedTotal: 3 };
  assert.equal(requireSuccessfulScrapeTaskResult(stopped), stopped);
  assert.equal(classifyScrapeTaskResult(stopped), 'stopped');
});

// 20 พ.ย. 2569: โควต้า JobThai เต็ม 08:55 แล้วคำสั่ง 229 รายการถูกตีกลับ ลองซ้ำ 3 รอบทุกใบ — เจ้าของเคาะ: รอคิว ทำต่อวันถัดไปเอง
test('โควต้านับใหม่หลังเที่ยงคืนเวลาไทย 5 นาที', () => {
  assert.equal(nextQuotaReset(Date.parse('2026-11-20T08:55:00+07:00')).toISOString(), new Date('2026-11-21T00:05:00+07:00').toISOString());
  assert.equal(nextQuotaReset(Date.parse('2026-11-20T23:59:30+07:00')).toISOString(), new Date('2026-11-21T00:05:00+07:00').toISOString());
  assert.equal(nextQuotaReset(Date.parse('2026-11-21T00:01:00+07:00')).toISOString(), new Date('2026-11-22T00:05:00+07:00').toISOString());
});

// 26 พ.ย. 2569: โควต้าเต็มแล้วเก็บไว้ในคิว Jarvis ขึ้นแค่ "กำลังทำ" คนสั่งไม่รู้ว่าต่อคิวอยู่ → ตีกลับทันทีพร้อมเหตุ
test('โควต้าเต็ม = จบคิวทันที ไม่ลองซ้ำ ตีกลับใบใน Jarvis · บัญชีถูกพัก = รอแบบเดิม', () => {
  const thrown = (result) => {
    try {
      requireSuccessfulScrapeTaskResult(result);
    } catch (e) {
      return e;
    }
    return null;
  };
  const quota = thrown({ status: 'error', runStatus: 'quota_full', error: 'โควต้าค้นหาวันนี้เต็มแล้ว ไม่ได้ค้น (provider daily cap reached for jobthai (1003/1000))' });
  assert.equal(quota.final, true);
  assert.equal(quota.waiting, undefined);
  assert.equal(quota.retryAt, undefined);
  assert.equal(scrapeFailNote(quota.message), 'โควต้าค้นหาวันนี้เต็มแล้ว ยังไม่ได้ค้น ให้สั่ง Scrap ใหม่พรุ่งนี้');
  const paused = thrown({ status: 'error', runStatus: 'cooldown', cooldownUntil: '2026-11-21T00:05:00+07:00', error: 'x' });
  assert.equal(paused.waiting, false);
  assert.equal(paused.final, undefined);
  const runner = fs.readFileSync(new URL('../workers/runner.js', import.meta.url), 'utf8');
  assert.match(runner, /const attempts = final \? Math\.max\(maxAttempts/, 'final ข้ามรอบลองใหม่');
  assert.match(runner, /retryOrFail\(job, errMsg, retryAt, \{ waiting: !final && waiting, final \}\)/);
  const pipeline = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(pipeline, /waitReason = 'daily_cap';/);
  const worker = fs.readFileSync(new URL('../src/tasks-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /r\.waitReason === 'daily_cap'\) \{[\s\S]*?finishTask\(t\.id, \{ status: 'error', phase: 'error'[\s\S]*?runStatus: 'quota_full'/);
});

// 26 พ.ย. 2569 เจ้าของ: "เต็มแล้วไม่ควรสั่งได้" — รับใบจาก Jarvis ตอนโควต้าเต็ม = ตีกลับทันที ไม่สร้างงานค้น
test('รับใบ Scrap จาก Jarvis ตอนโควต้าเต็ม: ไม่เข้าคิว ตีกลับพร้อมเหตุ', () => {
  const start = fs.readFileSync(new URL('../web/lib/jarvis-start.ts', import.meta.url), 'utf8');
  const repo = fs.readFileSync(new URL('../web/lib/repo.ts', import.meta.url), 'utf8');
  assert.match(start, /const quota = await connectorQuotaToday\(id\);\s+if \(quota && quota\.remaining <= 0\) \{[\s\S]*?continue;/);
  assert.match(start, /if \(quotaFull\) \{[\s\S]*?SET status = 'rejected'[\s\S]*?r\.status = 'pending'[\s\S]*?scrapeFailNote\('โควต้าค้นหาวันนี้เต็ม'\)/);
  assert.ok(start.indexOf('connectorQuotaToday(id)') < start.indexOf('createScrapeTaskFromSoRecruit(requestNo'), 'เช็กโควต้าก่อนสร้างงาน');
  assert.match(repo, /export async function connectorQuotaToday[\s\S]*?dailyRemaining\(/, 'นิยามโควต้าเดียวกับตัวค้น');
  assert.equal(scrapeFailNote('โควต้าค้นหาวันนี้เต็ม'), 'โควต้าค้นหาวันนี้เต็มแล้ว ยังไม่ได้ค้น ให้สั่ง Scrap ใหม่พรุ่งนี้');
});

// 23 พ.ย. 2569: ตั้ง JobThai 1,000 ในแท็บโควต้า แต่ระบบหยุดที่เพดานบัญชี 200
test('the quota-tab limit is the real daily limit; the account limit only applies when the tab has none', () => {
  assert.deepEqual(
    dailyRemaining({ connectorCap: 200, connectorToday: 207, providerCap: 1000, platformToday: 207 }),
    { remaining: 793, cap: 1000, used: 207, by: 'provider' },
  );
  assert.equal(dailyRemaining({ connectorCap: 200, connectorToday: 0, providerCap: 1000, platformToday: 1000 }).remaining, 0);
  assert.deepEqual(
    dailyRemaining({ connectorCap: 200, connectorToday: 150, providerCap: null, platformToday: 0 }),
    { remaining: 50, cap: 200, used: 150, by: 'connector' },
  );
});

// ข้อความจริงจากเครื่อง RM009 คืน 25 พ.ย. 2569
const CERT_ERROR = 'page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://auth.jobthai.com/companies/login?client_id=x&response_type=code\nCall log:\n  - navigating to "https://auth.jobthai.com/companies/login", waiting until "domcontentloaded"';

test('เครื่องเข้าเว็บไม่ได้ = ปัญหาเน็ต ไม่ใช่ใบขอผิด', () => {
  assert.equal(isNetworkError(CERT_ERROR), true);
  assert.equal(isNetworkError('page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://www.facebook.com/'), true);
  assert.equal(isNetworkError('page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.jobthai.com/'), true);
  assert.equal(isNetworkError('page.goto: net::ERR_INTERNET_DISCONNECTED'), true);
  assert.equal(isNetworkError('locator.click: Timeout 15000ms exceeded'), false);
  assert.equal(isNetworkError('CONTACT_REVEAL_BLOCKED: JobThai-LBA ไม่เปิดเบอร์'), false);
  assert.equal(isNetworkError('รหัสผ่านไม่ถูกต้อง'), false);
});

test('งานที่เข้าเว็บไม่ได้ รอคิวลองใหม่ ไม่ตีกลับ', () => {
  const retryAt = networkRetryAt(Date.parse('2026-11-25T00:05:00+07:00'));
  assert.equal(retryAt.toISOString(), '2026-11-24T17:35:00.000Z');
  const result = { status: 'error', runStatus: 'offline', cooldownUntil: retryAt.toISOString(), error: 'รอคิว: เครื่องค้นหาเข้าเว็บหางานไม่ได้ จะลองใหม่เอง 25 พ.ย. 00:35' };
  assert.throws(() => requireSuccessfulScrapeTaskResult(result), (e) => {
    assert.equal(e.waiting, true);
    assert.equal(e.offline, true);
    assert.equal(e.retryAt.toISOString(), retryAt.toISOString());
    return true;
  });
});

test('รอเน็ตได้ไม่เกิน 3 วัน แล้วตีกลับพร้อมเหตุที่คนอ่านรู้เรื่อง', () => {
  const now = Date.parse('2026-11-25T08:00:00+07:00');
  assert.equal(offlineWaitExpired('2026-11-24T23:00:00+07:00', now), false);
  assert.equal(offlineWaitExpired('2026-11-21T23:00:00+07:00', now), true);
  assert.equal(offlineWaitExpired(null, now), false);
  const note = scrapeFailNote(CERT_ERROR);
  assert.match(note, /เครื่องค้นหาเข้าเว็บหางานไม่ได้/);
  assert.doesNotMatch(note, /ERR_|page\.goto/);
});
