/**
 * สถานะของงานโพสต์ 1 รอบ (post_run_queue 1 แถว) แยกรายกลุ่ม — ใช้บนหน้าเว็บ
 *
 * worker เขียน run_logs ต่อรอบ:
 *   info  meta.kind='plan'        → ลำดับกลุ่มที่จะโพสต์ในรอบนี้ (meta.items[].group_id = fb group id)
 *   info  meta.kind='group_start' → เริ่มโพสต์กลุ่มนี้
 *   success                        → กดโพสต์สำเร็จ
 *   warn / error (มี group_id)     → โพสต์ไม่สำเร็จ
 * post_logs (ต่อกลุ่ม) มีลิงก์ สถานะในกลุ่ม และยอดคอมเมนต์/ไลก์/แชร์ที่เก็บได้ภายหลัง
 */

const RESULT_LEVELS = new Set(['success', 'warn', 'error']);

function ts(value) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} input
 * @param {Array<{group_id: string}>} input.plan กลุ่มตามลำดับที่จะโพสต์ (จาก log แผน หรือจาก assignment ถ้ารอบเก่าไม่มีแผน)
 * @param {Array<{group_id: string|null, level: string, kind?: string|null, message?: string|null, at: string}>} input.attempts run_logs ของรอบนี้ (kind=join = ข้ามเพราะยังไม่ได้เป็นสมาชิก)
 * @param {Array<object>} input.postLogs post_logs ของรอบนี้
 * @param {string} input.runStatus queued | running | completed | failed | cancelled
 * @param {(fbGroupId: string) => string} [input.groupName]
 */
export function buildPostTaskGroups({ plan = [], attempts = [], postLogs = [], runStatus = 'queued', groupName = (id) => id }) {
  const order = [];
  const seen = new Set();
  const add = (id) => {
    const key = String(id ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    order.push(key);
  };
  for (const item of plan) add(item?.group_id);
  // รอบเก่าที่ไม่มี log แผน: กลุ่มที่เคยลองโพสต์ก็นับเป็นแผนด้วย
  for (const a of [...attempts].sort((x, y) => ts(x.at) - ts(y.at))) if (a.group_id) add(a.group_id);

  const active = runStatus === 'queued' || runStatus === 'running';
  const groups = order.map((groupId, index) => {
    const mine = attempts.filter((a) => String(a.group_id ?? '') === groupId).sort((x, y) => ts(y.at) - ts(x.at));
    const result = mine.find((a) => RESULT_LEVELS.has(a.level)) ?? null;
    const start = mine.find((a) => a.level === 'info' && a.kind === 'group_start') ?? null;
    const log = [...postLogs]
      .filter((l) => String(l.group_id ?? '') === groupId)
      .sort((x, y) => ts(y.created_at) - ts(x.created_at))[0] ?? null;

    let status;
    let error = null;
    if (result && (!start || ts(result.at) >= ts(start.at))) {
      // warn ที่มาจากการตรวจสมาชิกกลุ่ม (meta.kind=join) = ยังไม่ได้เข้ากลุ่ม ไม่ใช่โพสต์พัง
      status = result.level === 'success' ? 'posted' : result.kind === 'join' ? 'not_member' : 'failed';
      if (status !== 'posted') error = result.message ?? null;
    } else if (start) {
      if (runStatus === 'running') status = 'posting';
      else {
        status = 'failed';
        error = 'เครื่องหยุดทำงานระหว่างโพสต์กลุ่มนี้';
      }
    } else {
      status = active ? 'waiting' : 'skipped';
    }

    return {
      group_id: groupId,
      name: groupName(groupId),
      order: index + 1,
      status,
      started_at: start?.at ?? null,
      finished_at: result?.at ?? null,
      error,
      post_link: log?.post_link ? String(log.post_link) : null,
      approval: log?.post_status ? String(log.post_status) : null,
      comments: log ? num(log.comment_count) ?? 0 : null,
      reactions: log ? num(log.reactions) ?? 0 : null,
      shares: log ? num(log.shares) ?? 0 : null,
      collected_at: log?.last_collected_at ?? null,
    };
  });

  const count = (s) => groups.filter((g) => g.status === s).length;
  const current = groups.find((g) => g.status === 'posting') ?? null;
  return {
    groups,
    counts: {
      planned: groups.length,
      posted: count('posted'),
      failed: count('failed'),
      posting: count('posting'),
      not_member: count('not_member'),
      waiting: count('waiting'),
      skipped: count('skipped'),
    },
    current: current ? { order: current.order, group_id: current.group_id, name: current.name } : null,
  };
}

export const POST_TASK_STEPS = ['สั่งโพสต์', 'เครื่องรับงาน', 'โพสต์ทีละกลุ่ม', 'เสร็จ'];

/**
 * ขั้นของรอบโพสต์สำหรับ stepper: step = index ของขั้นปัจจุบันใน POST_TASK_STEPS
 * state: 'active' | 'done' | 'failed'
 */
export function postTaskStage(runStatus, counts = { planned: 0, posted: 0, failed: 0 }, current = null) {
  switch (runStatus) {
    case 'queued':
      return { step: 1, state: 'active', label: 'รอเครื่องรับงาน' };
    case 'running':
      if (current) return { step: 2, state: 'active', label: `กำลังโพสต์กลุ่มที่ ${current.order}/${counts.planned}` };
      return { step: 2, state: 'active', label: counts.planned ? 'กำลังโพสต์' : 'กำลังเปิด Facebook' };
    case 'completed':
      if (counts.planned > 0 && counts.posted === 0) return { step: 3, state: 'failed', label: 'ไม่สำเร็จทุกกลุ่ม' };
      if (counts.failed > 0) return { step: 3, state: 'done', label: `เสร็จ ไม่สำเร็จ ${counts.failed} กลุ่ม` };
      return { step: 3, state: 'done', label: 'เสร็จ' };
    case 'failed':
      return { step: counts.posted + counts.failed > 0 ? 2 : 1, state: 'failed', label: 'ล้มเหลว' };
    case 'cancelled':
      return { step: 1, state: 'failed', label: 'ยกเลิก' };
    default:
      return { step: 0, state: 'active', label: String(runStatus || '-') };
  }
}
