/**
 * Pure, deterministic operational readiness evaluation.
 * No network and no database access here, so the same policy is testable.
 */

function item(code, label, status, message) {
  return { code, label, status, message };
}

/**
 * @param {{
 *  workers?: Array<{kind?:string, online?:boolean, meta?:Record<string,any>|null}>,
 *  facebookAccounts?: Array<{group_count?:number}>,
 *  queue?: {queued?:number, oldest_queued_minutes?:number|null, stale_running?:number, errors_24h?:number},
 *  postQueue?: {queued?:number, running?:number, failed_24h?:number},
 *  inconsistentCampaigns?: number,
 *  lastSelftest?: {status?:string, finished_at?:string|null, last_error?:string|null}|null
 * }} input
 */
export function evaluateWorkflowReadiness(input = {}) {
  const workers = input.workers ?? [];
  const accounts = input.facebookAccounts ?? [];
  const queue = input.queue ?? {};
  const postQueue = input.postQueue ?? {};
  const checks = [];

  const contentWorker = workers.some((worker) => {
    if (!worker.online) return false;
    const types = Array.isArray(worker.meta?.types) ? worker.meta.types : [];
    return types.includes('draft') || worker.kind === 'scraper' || worker.kind === 'orchestrator';
  });
  checks.push(contentWorker
    ? item('content_worker', 'เครื่องสร้างประกาศ', 'pass', 'พร้อมรับงานสร้างประกาศ')
    : item('content_worker', 'เครื่องสร้างประกาศ', 'fail', 'ยังไม่มีเครื่องออนไลน์ งานสร้างประกาศใหม่จะรอ'));

  const postWorker = workers.some((worker) => worker.online && worker.kind === 'autopost');
  checks.push(postWorker
    ? item('post_worker', 'เครื่องเผยแพร่ Facebook', 'pass', 'พร้อมรับงานเผยแพร่')
    : item('post_worker', 'เครื่องเผยแพร่ Facebook', 'fail', 'ยังไม่มีเครื่องเผยแพร่ Facebook ออนไลน์'));

  const readyAccounts = accounts.filter((account) => Number(account.group_count || 0) > 0).length;
  checks.push(readyAccounts > 0
    ? item('facebook_account', 'บัญชีและกลุ่ม Facebook', 'pass', `พร้อมใช้งาน ${readyAccounts} บัญชี`)
    : item('facebook_account', 'บัญชีและกลุ่ม Facebook', 'fail', 'ยังไม่มีบัญชีที่ผูกกลุ่มสำหรับเผยแพร่'));

  const queued = Number(queue.queued || 0);
  const oldestMinutes = Number(queue.oldest_queued_minutes || 0);
  const staleRunning = Number(queue.stale_running || 0);
  if (staleRunning > 0) {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'fail', `พบงานกำลังทำที่ไม่มีการตอบสนอง ${staleRunning} งาน`));
  } else if (queued > 0 && oldestMinutes >= 10) {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'fail', `มีงานรอนานเกิน 10 นาที ${queued} งาน (นานสุด ${Math.round(oldestMinutes)} นาที)`));
  } else if (queued > 0) {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'warning', `มีงานรอดำเนินการ ${queued} งาน`));
  } else {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'pass', 'ไม่มีงานค้าง'));
  }

  const failed = Number(queue.errors_24h || 0) + Number(postQueue.failed_24h || 0);
  checks.push(failed > 0
    ? item('recent_errors', 'งานผิดพลาดล่าสุด', 'warning', `มีงานผิดพลาดใน 24 ชั่วโมง ${failed} งาน`)
    : item('recent_errors', 'งานผิดพลาดล่าสุด', 'pass', 'ไม่พบงานผิดพลาดใน 24 ชั่วโมง'));

  const inconsistent = Number(input.inconsistentCampaigns || 0);
  checks.push(inconsistent > 0
    ? item('source_alignment', 'สถานะเทียบระบบต้นทาง', 'fail', `พบงานที่สถานะไม่ตรงกับ So Recruit ${inconsistent} งาน`)
    : item('source_alignment', 'สถานะเทียบระบบต้นทาง', 'pass', 'สถานะงานตรงกับระบบต้นทาง'));

  const selftest = input.lastSelftest;
  checks.push(selftest?.status === 'done'
    ? item('selftest', 'การทดสอบเส้นทางระบบ', 'pass', `ทดสอบล่าสุดสำเร็จ${selftest.finished_at ? ` ${new Date(selftest.finished_at).toLocaleString('th-TH')}` : ''}`)
    : selftest?.status === 'error'
      ? item('selftest', 'การทดสอบเส้นทางระบบ', 'fail', `ทดสอบล่าสุดไม่สำเร็จ: ${selftest.last_error || 'ไม่ทราบสาเหตุ'}`)
      : item('selftest', 'การทดสอบเส้นทางระบบ', 'warning', 'ยังไม่เคยทดสอบ Web → Queue → Worker'));

  const failures = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warning');
  const score = Math.round((checks.reduce((sum, check) => sum + (check.status === 'pass' ? 1 : check.status === 'warning' ? 0.5 : 0), 0) / checks.length) * 100);
  const status = failures.length ? 'blocked' : warnings.length ? 'degraded' : 'ready';
  const summary = failures.length
    ? `ระบบยังไม่พร้อมทำงานครบเส้น: ${failures.map((check) => check.label).join(', ')}`
    : warnings.length
      ? `ระบบทำงานได้ แต่ควรตรวจเพิ่ม: ${warnings.map((check) => check.label).join(', ')}`
      : 'ระบบพร้อมตั้งแต่รับงานจนถึงเผยแพร่และติดตามผล';
  return { status, score, summary, checks };
}
