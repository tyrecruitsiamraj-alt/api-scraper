/**
 * Dynamic Post Bot - โพสต์ตาม Assignments จาก Web Admin
 * อ่าน config จาก data/*.json + .env
 */
import { test } from './humanBrowser.fixture';
import { getPlaywrightTestTimeoutMs } from '../playwright-test-timeout';
import {
  loadDynamicConfig,
  facebookLogin,
  postToGroup,
  runLog,
  getBetweenPostsDelaySec,
  getBatchBreakSec,
  buildDailyPostPlanForUser,
  pauseUserPosting,
  getFailStreakLimit,
  getPauseHours,
} from '../src/helpers';
import type { PostDelaySettings, DailyPlanItem } from '../src/helpers';

const DEFAULT_SHEET_URL =
  process.env.DEFAULT_SHEET_URL ||
  'https://script.google.com/macros/s/AKfycbzqB97xnjUC7QZwTq2QnXUI372lxsO9acZTVxXJ3HF9G-T71h-HqccaNyMR6E612MYQ/exec';

function getJobIds(a: { job_ids?: string[]; job_id?: string }): string[] {
  if (Array.isArray(a.job_ids) && a.job_ids.length > 0) return a.job_ids;
  if (a.job_id) return [a.job_id];
  return [];
}

const LOADING_HTML_DB = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>AUTO-POST</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0}p{margin:12px 20px;text-align:center;max-width:28rem;line-height:1.5}</style></head><body><div><p><strong>AUTO-POST</strong></p><p id="m">กำลังโหลดข้อมูลจากฐานข้อมูล…</p></div></body></html>`;

const LOADING_HTML_READY = LOADING_HTML_DB.replace(
  'กำลังโหลดข้อมูลจากฐานข้อมูล…',
  'กำลังเตรียมโพสต์ตาม Assignments…'
);

/** ใช้ setContent แทน data: URL — บาง Chrome/Playwright นำทางจาก data: → https แล้วพฤติกรรมแปลก */
async function showWorkerLoadingPage(pg: import('@playwright/test').Page, html: string) {
  await pg.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

test('Dynamic Post: รันโพสต์ตาม Assignments', async ({ page, request }) => {
  test.setTimeout(getPlaywrightTestTimeoutMs());
  let activePage = page;

  /** ไม่ปล่อย about:blank ระหว่างรอ DB — ผู้ใช้เห็นว่าระบบทำงานอยู่ */
  await showWorkerLoadingPage(page, LOADING_HTML_DB);

  /** โหลด config ก่อน — ห้าม goto facebook.com ก่อน restore session (ทำใน facebookLogin) */
  console.log('⏳ กำลังโหลด Assignments จากฐานข้อมูล...');
  const CONFIG_LOAD_MS = Math.min(300_000, Math.max(30_000, Number(process.env.CONFIG_LOAD_TIMEOUT_MS) || 120_000));
  const config = await Promise.race([
    loadDynamicConfig(),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`หมดเวลาโหลด config (${Math.round(CONFIG_LOAD_MS / 1000)}s) — เช็ก DATABASE_URL / เครือข่าย`)), CONFIG_LOAD_MS)
    ),
  ]);
  await showWorkerLoadingPage(page, LOADING_HTML_READY);
  const ensureActivePageForUser = async (user: {
    id: string;
    name?: string;
    email?: string;
    password?: string;
    env_key?: string;
  }): Promise<boolean> => {
    if (!activePage.isClosed()) return true;
    if (!user.email || !user.password) return false;
    console.log(`♻️ [${user.name || user.id}] ตรวจพบหน้า browser ปิด — กำลัง login ใหม่อัตโนมัติ`);
    activePage = await facebookLogin(activePage, user.email, user.password, {
      userLabel: user.name || user.id,
      sessionKey: String(user.env_key || user.id || user.email || 'default'),
    });
    console.log(`✅ [${user.name || user.id}] กลับมาออนไลน์แล้ว ดำเนินงานต่อ`);
    return true;
  };

  if (config.users.length === 0) {
    throw new Error('ไม่มี User ในระบบ — ตรวจสอบฐานข้อมูล (DATABASE_URL) หรือ data/users.json');
  }
  const usersWithCreds = config.users.filter(
    (u) => String(u.email || '').trim() !== '' && String(u.password || '').trim() !== ''
  );
  if (usersWithCreds.length === 0) {
    throw new Error(
      'ไม่มี User ใดที่มี email+password สำหรับบอท — ใส่ในแก้ไข User (Admin) หรือตั้ง USER_{env_key}_EMAIL และ USER_{env_key}_PASSWORD ใน .env บนเครื่องที่รัน Playwright/worker'
    );
  }
  let assignments = config.assignments;
  const filterIds = process.env.ASSIGNMENT_IDS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (filterIds && filterIds.length > 0) {
    const wanted = new Set(filterIds.map(String));
    assignments = assignments.filter((a) => wanted.has(String(a.id)));
    console.log(`📌 โพสต์เฉพาะ Assignments: ${filterIds.join(', ')}`);
  }
  if (assignments.length === 0) {
    const hint = filterIds?.length
      ? `ไม่พบ Assignment ตาม ASSIGNMENT_IDS=${filterIds.join(',')}`
      : 'ไม่มี Assignment ในระบบ — ตรวจสอบฐานข้อมูลหรือ data/assignments.json';
    throw new Error(hint);
  }

  const groupMap = new Map<string, { fb_group_id: string; sheet_url?: string }>();
  for (const g of config.groups) {
    groupMap.set(g.id, { fb_group_id: g.fb_group_id, sheet_url: g.sheet_url });
  }

  /** จัดกลุ่ม assignment ตามบัญชี (คงลำดับสร้าง) — คิวจาก server เป็น 1 งาน/บัญชีอยู่แล้ว แต่รองรับหลายบัญชีใน run เดียวด้วย */
  const assignmentsByUser = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const key = String(a.user_id || '');
    if (!key) continue;
    if (!assignmentsByUser.has(key)) assignmentsByUser.set(key, [] as typeof assignments);
    assignmentsByUser.get(key)!.push(a);
  }

  let currentUserId: string | null = null;
  /** นับโพสต์ต่อ user — ใช้พักตาม batch_size ใน post_settings */
  let postsSinceBreak = 0;
  let activePostSettings: PostDelaySettings | undefined;
  /** มีอย่างน้อย 1 บัญชีที่ config ครบ (creds + กลุ่ม/งาน) — กันจบเทสต์แบบ exit 0 ทั้งที่ตั้งค่าผิด */
  let anyUserConfigReady = false;
  /** มีอย่างน้อย 1 บัญชีที่ได้แผนโพสต์วันนี้ (ไม่ติดโควต้า/พัก) */
  let anyUserPlanned = false;
  let totalPosted = 0;

  for (const [userId, userAssignments] of assignmentsByUser.entries()) {
    const user = config.users.find((u) => u.id === userId);
    if (!user) {
      console.log(`⏭️ ข้าม user ${userId}: ไม่พบในตาราง users`);
      continue;
    }
    if (!user.email || !user.password) {
      console.log(`⏭️ ข้าม user ${user.id}: ไม่มี credentials ใน .env (USER_${user.env_key || user.id}_EMAIL)`);
      continue;
    }
    const userLabel = user.name || user.id;

    /** แผนวันนี้ของบัญชีนี้: cap/วัน + วอร์มบัญชีใหม่ + cooldown คู่ซ้ำ + เรียงกลุ่มที่เคยได้เบอร์ก่อน */
    const assignmentIds = userAssignments.map((a) => String(a.id));
    let planItems: DailyPlanItem[] = [];
    const plan = await buildDailyPostPlanForUser(user.id, assignmentIds);
    if (plan) {
      if (plan.reason === 'no_candidates') {
        console.log(`⏭️ ข้าม ${userLabel}: ไม่พบกลุ่ม/งานที่ใช้โพสต์ (เช็กหน้า Assignment หรือ Users)`);
        continue;
      }
      anyUserConfigReady = true;
      if (plan.items.length === 0) {
        const detail =
          plan.reason === 'paused'
            ? `บัญชีถูกพักชั่วคราวถึง ${plan.paused_until || '-'} (${plan.pause_reason || 'circuit breaker'})`
            : plan.reason === 'daily_cap_reached'
              ? `ครบโควต้าวันนี้แล้ว (${plan.posted_today}/${plan.cap} โพสต์)`
              : 'คู่ที่เหลือติด cooldown หรือถูกบัญชีอื่นจองไปแล้ววันนี้';
        console.log(`⏸️ [${userLabel}] ไม่โพสต์วันนี้ — ${detail}`);
        await runLog({ level: 'info', message: `ข้ามการโพสต์: ${detail}`, user_id: user.id });
        continue;
      }
      anyUserPlanned = true;
      console.log(
        `🗓️ [${userLabel}] แผนวันนี้ ${plan.items.length} โพสต์ (โควต้า ${plan.cap}/วัน โพสต์แล้ว ${plan.posted_today}, ` +
          `เคยได้ผล ${plan.items.filter((i) => i.tier === 'proven').length} · ลองใหม่ ${plan.items.filter((i) => i.tier === 'explore').length} · ` +
          `ติด cooldown ${plan.cooldown_skipped ?? 0} · บัญชีอื่นจองแล้ว ${plan.reserved_by_others ?? 0})`
      );
    } else {
      /** โหมดไม่มี DATABASE_URL (data/*.json) — พฤติกรรมเดิม: โพสต์ทุกกลุ่มของทุก assignment */
      for (const assignment of userAssignments) {
        const jobIds = getJobIds(assignment);
        const selectedGroupIds = Array.isArray(assignment.group_ids) ? assignment.group_ids : [];
        const sourceGroupIds = selectedGroupIds.length > 0 ? selectedGroupIds : (user.group_ids || []);
        for (const jid of jobIds) {
          for (const gid of sourceGroupIds) {
            const g = groupMap.get(gid);
            if (!g) continue;
            planItems.push({
              assignment_id: String(assignment.id),
              job_id: String(jid),
              group_row_id: String(gid),
              fb_group_id: g.fb_group_id,
              group_name: null,
              sheet_url: g.sheet_url || null,
              tier: 'explore',
              score: 0,
            });
          }
        }
      }
      if (planItems.length === 0) {
        console.log(`⏭️ ข้าม ${userLabel}: ไม่พบกลุ่ม/งานที่ใช้โพสต์`);
        continue;
      }
      anyUserConfigReady = true;
      anyUserPlanned = true;
    }
    if (plan) planItems = plan.items;

    if (currentUserId !== user.id) {
      activePage = await facebookLogin(activePage, user.email, user.password, {
        userLabel,
        sessionKey: String(user.env_key || user.id || user.email || 'default'),
      });
      console.log('▶️ Login สำเร็จ เริ่มโพสต์อัตโนมัติ (ไม่ต้องกด Resume)');
      currentUserId = user.id;
      postsSinceBreak = 0;
      activePostSettings = user.post_settings;
    }

    /** circuit breaker: fail ติดกันหลายกลุ่ม = สัญญาณบัญชีโดนจำกัด — หยุดก่อนจะเผาบัญชี */
    let failStreak = 0;
    let lastJobId: string | null = null;
    for (const item of planItems) {
      const job = config.jobs.find((j) => j.id === item.job_id);
      if (!job) {
        console.log(`⏭️ ข้าม job ${item.job_id}: ไม่พบใน config`);
        continue;
      }
      if (item.job_id !== lastJobId) {
        await runLog({
          level: 'info',
          message: `เริ่มโพสต์งาน "${job.title}"`,
          assignment_id: item.assignment_id,
          user_id: user.id,
          job_id: item.job_id,
        });
        lastJobId = item.job_id;
      }

      const postItem = {
        title: job.title,
        owner: job.owner,
        company: job.company,
        caption: job.caption,
        apply_link: job.apply_link,
        comment_reply: job.comment_reply,
        groupID: [item.fb_group_id],
      };
      const gID = item.fb_group_id;

      let posted = false;
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const pageReady = await ensureActivePageForUser(user);
        if (!pageReady) break;
        console.log(
          `🚀 [${userLabel}] โพสต์งาน "${job.title}" ไปกลุ่ม ${gID} (ครั้งที่ ${attempt}/${maxAttempts})`
        );
        posted = await postToGroup(activePage, request, postItem, gID, {
          userLabel,
          posterName: user.poster_name || user.name || 'Poster',
          sheetUrl: item.sheet_url || DEFAULT_SHEET_URL || user.sheet_url || '',
          blacklistGroups: user.blacklist_groups,
          assignmentId: item.assignment_id,
          userId: user.id,
          jobId: item.job_id,
          groupId: gID,
        });
        if (posted) break;
        if (!activePage.isClosed()) break;
        if (attempt < maxAttempts) {
          console.log(`⚠️ [${userLabel}] browser ปิดระหว่างโพสต์กลุ่ม ${gID} — เตรียม retry อัตโนมัติ`);
        }
      }
      if (posted) {
        totalPosted += 1;
        failStreak = 0;
        await runLog({
          level: 'success',
          message: `โพสต์สำเร็จ: ${job.title} → กลุ่ม ${gID}`,
          assignment_id: item.assignment_id,
          user_id: user.id,
          job_id: item.job_id,
          group_id: gID,
        });
      } else {
        failStreak += 1;
        await runLog({
          level: 'warn',
          message: `โพสต์ไม่สำเร็จ: ${job.title} → กลุ่ม ${gID} (ถ้ามีจะบันทึก screenshot/HTML ไว้ที่โฟลเดอร์ artifacts/)`,
          assignment_id: item.assignment_id,
          user_id: user.id,
          job_id: item.job_id,
          group_id: gID,
        });
        const streakLimit = getFailStreakLimit();
        if (failStreak >= streakLimit) {
          const pauseHours = getPauseHours();
          const reason = `โพสต์ไม่สำเร็จติดกัน ${failStreak} กลุ่ม — circuit breaker พัก ${pauseHours} ชม. (อาจโดน Facebook จำกัดการโพสต์)`;
          console.log(`🛑 [${userLabel}] ${reason}`);
          await runLog({ level: 'error', message: reason, user_id: user.id });
          await pauseUserPosting(user.id, pauseHours, reason).catch(() => {});
          break;
        }
      }
      postsSinceBreak += 1;
      const batchSize =
        Number(activePostSettings?.batch_size) ||
        Number(process.env.HUMAN_BATCH_SIZE) ||
        5;
      if (batchSize > 0 && postsSinceBreak >= batchSize) {
        const breakSec = getBatchBreakSec(activePostSettings);
        console.log(
          `☕ [${userLabel}] พักหลังโพสต์ ${postsSinceBreak} กลุ่ม (~${breakSec}s) ตาม batch_size`
        );
        await activePage.waitForTimeout(breakSec * 1000);
        postsSinceBreak = 0;
      } else {
        const delaySec = getBetweenPostsDelaySec(activePostSettings);
        console.log(`⏳ [${userLabel}] รอ ~${delaySec}s ก่อนกลุ่มถัดไป`);
        await activePage.waitForTimeout(delaySec * 1000);
      }
    }
  }

  if (!anyUserConfigReady) {
    throw new Error(
      'ไม่มี Assignment ที่โพสต์ได้ — ทุกรายการถูกข้าม ตรวจสอบ: ① User ของ assignment ตรงกับตาราง users ② job_ids / job_id ③ กลุ่ม (เลือกใน Assignment หรือกลุ่มใน User) ต้องมี fb_group_id ④ บนเครื่อง worker ต้องมี USER_{env_key}_EMAIL และ USER_{env_key}_PASSWORD'
    );
  }
  if (!anyUserPlanned) {
    console.log('✅ ทุกบัญชีครบโควต้าวันนี้/ถูกพักชั่วคราว — ไม่มีอะไรต้องโพสต์เพิ่ม');
    return;
  }

  console.log(`✅ โพสต์ครบตามแผนแล้ว (${totalPosted} โพสต์)`);
});
