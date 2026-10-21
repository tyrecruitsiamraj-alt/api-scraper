/**
 * ขั้นของงาน Scrap หนึ่งงาน คำนวณจากฟิลด์ใน scrape_tasks เท่านั้น
 * (pure function ไม่แตะ DB จึง import ได้ทั้ง server และ client component).
 *
 * ค่า phase ที่ worker เขียนจริง (src/tasks-worker.js, src/pipeline.js):
 *   idle → starting → planning → login → scraping → ocr → enrich → done | partial | error
 * status: idle | queued | running | done | partial | error
 * review_status: not_required (งานที่สร้างเอง) | pending | approved | rejected (งานจาก Jarvis)
 */

export const SCRAP_STAGES = [
  { key: 'intake', label: 'รับคำขอ' },
  { key: 'queue', label: 'รอคิว' },
  { key: 'login', label: 'ล็อกอิน' },
  { key: 'search', label: 'ค้นหาและคัดโปรไฟล์' },
  { key: 'ocr', label: 'อ่านเอกสาร (OCR)' },
  { key: 'enrich', label: 'เติมข้อมูล' },
  { key: 'review', label: 'ตรวจรับ' },
] as const;

export type ScrapStageKey = (typeof SCRAP_STAGES)[number]['key'];
export type ScrapStageState = 'done' | 'current' | 'failed' | 'upcoming';

/** กลุ่มที่ใช้แบ่งแท็บในหน้ารายการ */
export type ScrapTaskGroup = 'working' | 'review' | 'attention' | 'done' | 'idle';

export const SCRAP_GROUP_LABEL: Record<ScrapTaskGroup, string> = {
  working: 'กำลังทำ',
  review: 'ต้องตรวจรับ',
  attention: 'ติดปัญหา',
  done: 'เสร็จแล้ว',
  idle: 'ยังไม่เริ่ม',
};

export type ScrapStageInput = {
  status: string;
  phase?: string | null;
  review_status?: string | null;
  assessed_total?: number | null;
  last_error?: string | null;
};

export type ScrapStageStep = {
  key: ScrapStageKey;
  label: string;
  state: ScrapStageState;
};

export type ScrapStageResult = {
  steps: ScrapStageStep[];
  /** ขั้นที่งานอยู่ตอนนี้ (หรือขั้นที่ล้ม) */
  current: ScrapStageKey;
  /** 1-based, ใช้แสดง "ขั้น 4/7" */
  stepNumber: number;
  totalSteps: number;
  /** เครื่องกำลังทำขั้นนี้อยู่ (ใช้แสดง spinner) */
  running: boolean;
  /** ทุกขั้นเสร็จ ไม่ต้องทำอะไรต่อ */
  complete: boolean;
  group: ScrapTaskGroup;
  /** ป้ายสถานะสั้นสำหรับ Badge */
  statusLabel: string;
  /** "ขั้น 4/7 · ค้นหาและคัดโปรไฟล์" */
  stepText: string;
  /** รายละเอียดสั้นของขั้นปัจจุบัน เช่น "กำลังเตรียมคำค้น" */
  note: string | null;
};

const LOGIN_ERROR_HINTS = [
  'resume search talent',
  '/resumes/premium',
  'password',
  'รหัสผ่าน',
  'employer session',
  'jobbkk-postlogin',
  'employer_login',
  'captcha',
  'checkpoint',
  'ยืนยันตัวตน',
  'login',
  'session',
  'connector missing',
];

const QUEUE_ERROR_HINTS = [
  'ยังไม่มีเครื่อง',
  'ไม่มีเครื่องค้นหา',
  'ไม่มีงานรอในคิว',
  'worker ยังไม่พร้อม',
  'daily cap',
  'cooldown',
];

/** เดาขั้นที่ล้มจากข้อความ error เพราะตอน error worker เขียน phase='error' ทับขั้นเดิม */
export function failedStageFromError(lastError: string | null | undefined, assessedTotal = 0): ScrapStageKey {
  const lower = String(lastError ?? '').toLowerCase();
  if (assessedTotal <= 0 && QUEUE_ERROR_HINTS.some((hint) => lower.includes(hint))) return 'queue';
  if (assessedTotal <= 0 && LOGIN_ERROR_HINTS.some((hint) => lower.includes(hint))) return 'login';
  return 'search';
}

const PHASE_TO_STAGE: Record<string, ScrapStageKey> = {
  idle: 'queue',
  starting: 'login',
  planning: 'login',
  login: 'login',
  scraping: 'search',
  ocr: 'ocr',
  enrich: 'enrich',
  done: 'review',
  partial: 'review',
};

function indexOfStage(key: ScrapStageKey) {
  return SCRAP_STAGES.findIndex((stage) => stage.key === key);
}

function buildSteps(currentIdx: number, currentState: ScrapStageState, extraDone: number[] = []): ScrapStageStep[] {
  return SCRAP_STAGES.map((stage, idx) => {
    let state: ScrapStageState;
    if (idx < currentIdx || extraDone.includes(idx)) state = 'done';
    else if (idx === currentIdx) state = currentState;
    else state = 'upcoming';
    return { key: stage.key, label: stage.label, state };
  });
}

export function deriveScrapStage(input: ScrapStageInput): ScrapStageResult {
  const status = String(input.status ?? 'idle');
  const phase = String(input.phase ?? 'idle');
  const review = String(input.review_status ?? 'not_required');
  const assessed = Number(input.assessed_total ?? 0);
  const total = SCRAP_STAGES.length;
  const reviewIdx = indexOfStage('review');

  let currentIdx: number;
  let steps: ScrapStageStep[];
  let running = false;
  let complete = false;
  let group: ScrapTaskGroup = 'working';
  let statusLabel = 'กำลังทำ';
  let note: string | null = null;

  if (status === 'queued') {
    currentIdx = indexOfStage('queue');
    steps = buildSteps(currentIdx, 'current');
    running = true;
    statusLabel = 'รอคิว';
    note = 'รอเครื่องค้นหารับงาน';
  } else if (status === 'running') {
    currentIdx = indexOfStage(PHASE_TO_STAGE[phase] ?? 'login');
    steps = buildSteps(currentIdx, 'current');
    running = true;
    statusLabel = 'กำลังทำ';
    if (phase === 'starting') note = 'เครื่องรับงานแล้ว กำลังเริ่ม';
    else if (phase === 'planning') note = 'กำลังเตรียมคำค้นจากเนื้องาน';
  } else if (status === 'done') {
    if (review === 'pending') {
      currentIdx = reviewIdx;
      steps = buildSteps(currentIdx, 'current');
      group = 'review';
      statusLabel = 'รอตรวจรับ';
      note = 'ได้ผู้สมัครครบแล้ว รอคนตรวจรับ';
    } else if (review === 'rejected') {
      currentIdx = reviewIdx;
      steps = buildSteps(currentIdx, 'failed');
      group = 'attention';
      statusLabel = 'ไม่รับผล';
      note = 'ผลการค้นหาถูกตีกลับ';
    } else {
      currentIdx = reviewIdx;
      steps = buildSteps(total, 'done');
      complete = true;
      group = 'done';
      statusLabel = 'เสร็จแล้ว';
      note = review === 'approved' ? 'ตรวจรับแล้ว' : null;
    }
  } else if (status === 'partial') {
    // ค้นครบทุกคำค้นแล้วแต่ไม่ถึงเป้า ขั้น OCR/เติมข้อมูลยังทำกับคนที่ได้มา
    currentIdx = indexOfStage('search');
    steps = buildSteps(currentIdx, 'failed', [indexOfStage('ocr'), indexOfStage('enrich')]);
    group = 'attention';
    statusLabel = 'ได้ไม่ครบเป้า';
    note = 'ค้นครบแล้วแต่ยังได้คนไม่ครบเป้า';
  } else if (status === 'error') {
    currentIdx = indexOfStage(failedStageFromError(input.last_error, assessed));
    steps = buildSteps(currentIdx, 'failed');
    group = 'attention';
    statusLabel = 'ไม่สำเร็จ';
  } else {
    // idle: บันทึกไว้แล้วแต่ยังไม่สั่งรัน
    currentIdx = indexOfStage('queue');
    steps = buildSteps(currentIdx, 'current');
    statusLabel = 'ยังไม่เริ่ม';
    note = 'ยังไม่ได้กดรัน';
    group = 'idle';
  }

  const current = SCRAP_STAGES[currentIdx].key;
  const stepNumber = complete ? total : currentIdx + 1;
  const stepText = complete
    ? `ครบ ${total}/${total} ขั้น`
    : `ขั้น ${stepNumber}/${total} · ${SCRAP_STAGES[currentIdx].label}`;

  return { steps, current, stepNumber, totalSteps: total, running, complete, group, statusLabel, stepText, note };
}
