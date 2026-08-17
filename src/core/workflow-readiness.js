/**
 * Pure, deterministic operational readiness evaluation.
 * No network and no database access here, so the same policy is testable.
 */

function item(code, label, status, message) {
  return { code, label, status, message };
}

/**
 * @param {{
 *  requiredBuildSha?: string,
 *  workers?: Array<{kind?:string, online?:boolean, meta?:Record<string,any>|null}>,
 *  facebookAccounts?: Array<{group_count?:number}>,
 *  queue?: {queued?:number, oldest_queued_minutes?:number|null, stale_running?:number, stalled_progress?:number, errors_24h?:number},
 *  postQueue?: {queued?:number, running?:number, failed_24h?:number},
 *  contentOutput?: {passing_with_image?:number, verified_generation?:number, failed_quality?:number},
 *  scrapeOutput?: {completed?:number, partial?:number, error?:number},
 *  recentPostRuns?: Array<{status?:string, mode?:string}>,
 *  inconsistentCampaigns?: number,
 *  lastSelftest?: {status?:string, finished_at?:string|null, last_error?:string|null}|null
 * }} input
 */
export function evaluateWorkflowReadiness(input = {}) {
  const requiredBuildSha = String(input.requiredBuildSha || '').trim();
  const workers = (input.workers ?? []).filter((worker) => (
    !requiredBuildSha || String(worker.meta?.build_sha || '') === requiredBuildSha
  ));
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
  const contentCapability = workers.find((worker) => {
    if (!worker.online) return false;
    const types = Array.isArray(worker.meta?.types) ? worker.meta.types : [];
    return types.includes('draft');
  })?.meta?.image_generation;
  if (contentCapability && !contentCapability.configured) {
    checks.push(item('image_provider', 'สิทธิ์สร้างรูป AI', 'fail', 'เครื่องสร้าง Content ยังไม่มี OPENAI_API_KEY จึงสร้างรูปตามตำแหน่งไม่ได้'));
  } else if (contentCapability?.configured) {
    checks.push(item('image_provider', 'สิทธิ์สร้างรูป AI', 'pass', `พร้อมสร้างรูปด้วย ${contentCapability.model || contentCapability.provider}`));
  } else {
    // Missing provenance means this is an old worker. Treat it as unavailable,
    // not degraded: it lacks the search timeout/content-image contracts required
    // by the Golden Flow and can otherwise keep a task alive forever.
    checks.push(item('image_provider', 'สิทธิ์สร้างรูป AI', 'fail', 'Worker รุ่นเดิมยังไม่รายงานความพร้อมของรูปและ Golden Flow กรุณารีเฟรช Worker ก่อนรับงานใหม่'));
  }

  const postWorker = workers.some((worker) => worker.online && worker.kind === 'autopost');
  checks.push(postWorker
    ? item('post_worker', 'เครื่องเผยแพร่ Facebook', 'pass', 'พร้อมรับงานเผยแพร่')
    : item('post_worker', 'เครื่องเผยแพร่ Facebook', 'fail', 'ยังไม่มีเครื่องเผยแพร่ Facebook ออนไลน์'));
  const preflightWorker = workers.some((worker) => (
    worker.online
    && worker.kind === 'autopost'
    && Array.isArray(worker.meta?.capabilities)
    && worker.meta.capabilities.includes('preflight')
  ));
  checks.push(preflightWorker
    ? item('facebook_preflight', 'การทดสอบ Facebook แบบไม่โพสต์จริง', 'pass', 'Worker รองรับการตรวจ session และกลุ่มโดยไม่เผยแพร่โพสต์')
    : item('facebook_preflight', 'การทดสอบ Facebook แบบไม่โพสต์จริง', 'fail', 'Worker ยังเป็นรุ่นเดิม กรุณารีเฟรช Worker ก่อนทดสอบ Facebook'));

  const readyAccounts = accounts.filter((account) => Number(account.group_count || 0) > 0).length;
  checks.push(readyAccounts > 0
    ? item('facebook_account', 'บัญชีและกลุ่ม Facebook', 'pass', `พร้อมใช้งาน ${readyAccounts} บัญชี`)
    : item('facebook_account', 'บัญชีและกลุ่ม Facebook', 'fail', 'ยังไม่มีบัญชีที่ผูกกลุ่มสำหรับเผยแพร่'));

  const contentOutput = input.contentOutput ?? {};
  const passingWithImage = Number(contentOutput.passing_with_image || 0);
  const verifiedGeneration = Number(contentOutput.verified_generation || 0);
  if (verifiedGeneration > 0) {
    checks.push(item('content_output', 'ผลลัพธ์ข้อความและรูป', 'pass', `มีร่างที่ผ่านข้อมูล มีรูปจริง และตรวจที่มาของรูปแล้ว ${verifiedGeneration} ร่าง`));
  } else if (passingWithImage > 0) {
    checks.push(item('content_output', 'ผลลัพธ์ข้อความและรูป', 'warning', 'มีร่างเก่าที่ผ่านและมีรูป แต่ยังไม่ได้บันทึกหลักฐานการสร้างรูปแบบใหม่ กรุณาทดสอบสร้าง Content ใหม่ 1 งาน'));
  } else {
    checks.push(item('content_output', 'ผลลัพธ์ข้อความและรูป', 'fail', 'ยังไม่มีร่างที่ผ่านด่านข้อเท็จจริงและมีรูปพร้อมใช้'));
  }

  const scrapeOutput = input.scrapeOutput ?? {};
  const completedScrapes = Number(scrapeOutput.completed || 0);
  const partialScrapes = Number(scrapeOutput.partial || 0);
  const scrapeErrors = Number(scrapeOutput.error || 0);
  if (completedScrapes <= 0) {
    checks.push(item('scrape_output', 'ผลค้นหาผู้สมัคร', 'fail', 'ยังไม่มีงานล่าสุดที่ได้ Resume ผ่านเกณฑ์ครบจำนวนเป้าหมาย'));
  } else if (partialScrapes > 0 || scrapeErrors > 0) {
    checks.push(item('scrape_output', 'ผลค้นหาผู้สมัคร', 'warning', `มีงานได้ครบ ${completedScrapes} งาน · ยังไม่ครบตลาด ${partialScrapes} งาน · ระบบขัดข้อง ${scrapeErrors} งาน`));
  } else {
    checks.push(item('scrape_output', 'ผลค้นหาผู้สมัคร', 'pass', `งานค้นหาล่าสุดได้ Resume ครบเป้าหมาย ${completedScrapes} งาน`));
  }

  const queued = Number(queue.queued || 0);
  const oldestMinutes = Number(queue.oldest_queued_minutes || 0);
  const staleRunning = Number(queue.stale_running || 0);
  const stalledProgress = Number(queue.stalled_progress || 0);
  if (stalledProgress > 0) {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'fail', `พบงานค้นหาที่ heartbeat ยังมา แต่ไม่มี Resume ใหม่เกิน 10 นาที ${stalledProgress} งาน`));
  } else if (staleRunning > 0) {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'fail', `พบงานกำลังทำที่ไม่มีการตอบสนอง ${staleRunning} งาน`));
  } else if (queued > 0 && oldestMinutes >= 10) {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'fail', `มีงานรอนานเกิน 10 นาที ${queued} งาน (นานสุด ${Math.round(oldestMinutes)} นาที)`));
  } else if (queued > 0) {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'warning', `มีงานรอดำเนินการ ${queued} งาน`));
  } else {
    checks.push(item('work_queue', 'คิวงานเบื้องหลัง', 'pass', 'ไม่มีงานค้าง'));
  }

  const failed = Number(queue.errors_24h || 0) + Number(postQueue.failed_24h || 0);
  // A successful preflight proves only session/group access and must never
  // hide a streak of real publish failures.
  const recentPostRuns = (input.recentPostRuns ?? []).filter((run) => String(run.mode || 'post') === 'post');
  const postFailureStreak = recentPostRuns.length > 0 && recentPostRuns.every((run) => ['failed', 'cancelled'].includes(String(run.status || '')));
  checks.push(postFailureStreak
    ? item('recent_errors', 'งานผิดพลาดล่าสุด', 'fail', `การเผยแพร่ Facebook ล่าสุดล้มเหลวติดต่อกัน ${recentPostRuns.length} ครั้ง ห้ามรายงานว่าระบบพร้อม`)
    : failed > 0
      ? item('recent_errors', 'งานผิดพลาดล่าสุด', 'warning', `มีงานผิดพลาดใน 24 ชั่วโมง ${failed} งาน`)
    : item('recent_errors', 'งานผิดพลาดล่าสุด', 'pass', 'ไม่พบงานผิดพลาดใน 24 ชั่วโมง'));

  const inconsistent = Number(input.inconsistentCampaigns || 0);
  checks.push(inconsistent > 0
    ? item('source_alignment', 'สถานะเทียบระบบต้นทาง', 'fail', `พบงานที่สถานะไม่ตรงกับ So Recruit ${inconsistent} งาน`)
    : item('source_alignment', 'สถานะเทียบระบบต้นทาง', 'pass', 'สถานะงานตรงกับระบบต้นทาง'));

  const selftest = input.lastSelftest;
  checks.push(selftest?.status === 'done'
    ? item('selftest', 'การทดสอบ Web → คิว → Worker', 'pass', `ทดสอบระบบคิวล่าสุดสำเร็จ${selftest.finished_at ? ` ${new Date(selftest.finished_at).toLocaleString('th-TH')}` : ''} (ไม่ใช่การทดสอบ Facebook จริง)`)
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
