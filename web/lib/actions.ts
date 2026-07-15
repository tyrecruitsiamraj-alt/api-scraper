'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { encryptSecret } from './crypto';
import { kickWorker } from './worker-kick';
import {
  createAdjacentTask,
  createCampaignFromRequest,
  enqueueDraftForCampaign,
  enqueueApprovedPost,
  enqueueMeasureForCampaign,
  getCampaign,
  getContentById,
  setCampaignStatus,
  setContentStatus,
  deleteConnector,
  deleteTask,
  enqueueScrapeForTask,
  insertConnector,
  insertTask,
  queueTask,
  setConnectorEnabled,
  setFbAccountWorker,
  setProviderCap,
  setFacebookDailyCapForAll,
  setTaskEnabled,
} from './repo';

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
}

/** Mirror api-scraper tasks-worker nextRunFrom() for the first scheduled fire. */
function firstNextRun(cron: string | null): string | null {
  if (!cron) return null;
  let sec: number | null = null;
  const m = cron.match(/^every:(\d+)$/);
  if (m) sec = Number.parseInt(m[1], 10);
  else if (cron === '@hourly') sec = 3600;
  else if (cron === '@daily') sec = 86400;
  if (!sec) return null;
  return new Date(Date.now() + sec * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function createTaskAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get('name') ?? '').trim();
  const connectorId = String(formData.get('connectorId') ?? '');
  const mode = (String(formData.get('mode') ?? 'count') === 'date_range' ? 'date_range' : 'count') as
    | 'count'
    | 'date_range';
  const schedule = String(formData.get('schedule') ?? '').trim() || null;
  const runNow = formData.get('runNow') === 'on';
  // Checkbox is checked by default in the form; absent => user turned it off.
  const expandAdjacent = formData.get('expandAdjacent') === 'on';

  if (!name || !connectorId) throw new Error('กรุณากรอกชื่องานและเลือก connector');

  const position = String(formData.get('position') ?? '').trim();
  const keyword = String(formData.get('keyword') ?? '').trim();
  const criteria: Record<string, unknown> = {};
  if (position) criteria.position = position;
  if (keyword) criteria.keyword = keyword;

  // Optional filters — keys match what the JobBKK premium search understands
  // (see src/providers/jobbkk/browser/jobbkk-filters.js). "ไม่ระบุ"/empty = skip.
  const filterVal = (key: string) => {
    const v = String(formData.get(key) ?? '').trim();
    return v && v !== 'ไม่ระบุ' ? v : '';
  };
  const gender = filterVal('gender');
  const province = filterVal('province');
  const education = filterVal('education');
  const salaryMin = filterVal('salaryMin');
  const salaryMax = filterVal('salaryMax');
  const ageMin = filterVal('ageMin');
  const ageMax = filterVal('ageMax');
  if (gender) criteria.gender = gender;
  if (province) criteria.province = province;
  if (education) criteria.education = education;
  if (salaryMin) criteria.salaryMin = salaryMin;
  if (salaryMax) criteria.salaryMax = salaryMax;
  if (ageMin) criteria.ageMin = ageMin;
  if (ageMax) criteria.ageMax = ageMax;

  let targetCount: number | null = null;
  let updatedSince: string | null = null;
  if (mode === 'count') {
    const n = Number.parseInt(String(formData.get('targetCount') ?? ''), 10);
    targetCount = Number.isFinite(n) && n > 0 ? n : null;
  } else {
    updatedSince = String(formData.get('updatedSince') ?? '').trim() || null;
  }

  const taskId = await insertTask({
    name,
    connectorId,
    mode,
    targetCount,
    updatedSince,
    criteria,
    scheduleCron: schedule,
    nextRunAt: firstNextRun(schedule),
    // run-now → queued so the worker picks it up immediately
    status: runNow ? 'queued' : 'idle',
    expandAdjacent,
  });
  if (runNow) {
    await enqueueScrapeForTask(taskId); // hand off to the unified work_queue runner
    kickWorker(); // drain the queue now (no manual worker run needed)
  }
  revalidatePath('/scraping');
}

export async function queueTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) {
    await queueTask(id);
    await enqueueScrapeForTask(id); // hand off to the unified work_queue runner
    kickWorker(); // "run now" → drain the queue right away
  }
  revalidatePath('/scraping');
}

/** Fire a one-shot scrape for an AI-suggested adjacent position (🟡/🔴) the user picked. */
export async function expandAdjacentTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const position = String(formData.get('position') ?? '').trim();
  if (id && position) {
    const newId = await createAdjacentTask(id, position);
    await enqueueScrapeForTask(newId);
    kickWorker();
  }
  revalidatePath('/scraping');
}

export async function toggleTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (id) await setTaskEnabled(id, enabled);
  revalidatePath('/scraping');
}

export async function deleteTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) await deleteTask(id);
  revalidatePath('/scraping');
}

// ---------------------------------------------------------------------------
// Content Orchestrator
// ---------------------------------------------------------------------------
/** คนกดสั่งต่อใบ: สร้าง campaign จากใบขอใน staging เพื่อเข้าโหมดคิด content. */
export async function startCampaignAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  if (requestNo) {
    const owner = session.user?.email ?? session.user?.name ?? null;
    const campaignId = await createCampaignFromRequest(requestNo, owner);
    if (campaignId) {
      await setCampaignStatus(campaignId, 'drafting');
      await enqueueDraftForCampaign(campaignId, owner); // AI คิด content เบื้องหลัง
      kickWorker(); // drain คิวทันที (บนเครื่องที่รัน worker)
    }
  }
  revalidatePath('/orchestrator/imports');
  revalidatePath('/orchestrator');
}

/**
 * อนุมัติร่างคอนเทนต์ → ถ้าเลือกบัญชี Facebook: สร้าง job+assignment+คิวโพสต์ใน autopost
 * (worker บน PC โพสต์จริงพร้อมรูป) แล้วตั้ง campaign 'posting'. ไม่เลือกบัญชี = อนุมัติเฉย ๆ.
 */
export async function approveContentAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '');
  const campaignId = String(formData.get('campaignId') ?? '');
  const fbAccountId = String(formData.get('fbAccountId') ?? '').trim();
  if (contentId && campaignId) {
    await setContentStatus(contentId, 'approved');
    let posting = false;
    if (fbAccountId) {
      const [campaign, content] = await Promise.all([getCampaign(campaignId), getContentById(contentId)]);
      if (campaign && content) {
        await enqueueApprovedPost({
          campaign,
          content,
          userId: fbAccountId,
          requestedBy: session.user?.email ?? session.user?.name ?? null,
        });
        await setCampaignStatus(campaignId, 'posting');
        // autopost worker (npm run worker:post) โพล post_run_queue เองทุก ~5 วิ — ไม่ต้อง kick
        posting = true;
      }
    }
    if (!posting) await setCampaignStatus(campaignId, 'approved');
  }
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
}

/** สั่งวัดผล engagement ของ campaign (อ่านจาก post_logs → verdict → regen/บันทึกแนวที่เวิร์ค). */
export async function measureCampaignAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const campaignId = String(formData.get('campaignId') ?? '');
  if (campaignId) {
    await setCampaignStatus(campaignId, 'measuring');
    await enqueueMeasureForCampaign(campaignId, session.user?.email ?? session.user?.name ?? null);
    kickWorker(); // measure ไม่ต้อง browser — worker draining ทำได้ทันที
  }
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
}

/** ตีกลับร่างคอนเทนต์ → ให้คิดใหม่ (สถานะ campaign กลับไป drafting). */
export async function rejectContentAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '');
  const campaignId = String(formData.get('campaignId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (contentId && campaignId) {
    await setContentStatus(contentId, 'rejected', reason);
    await setCampaignStatus(campaignId, 'drafting', reason);
    await enqueueDraftForCampaign(campaignId, session.user?.email ?? session.user?.name ?? null); // คิด version ใหม่
    kickWorker();
  }
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
}

/** ผูก/ปลดบัญชี FB กับเครื่อง (pin — บัญชีวิ่งเครื่องเดิมเสมอ กันสลับ IP โดยไม่ใช้ proxy). */
export async function setAccountWorkerAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('accountId') ?? '').trim();
  const worker = String(formData.get('worker') ?? '').trim();
  if (id) await setFbAccountWorker(id, worker || null);
  revalidatePath('/autopost/accounts');
  revalidatePath('/autopost/runs');
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------
export async function createConnectorAction(formData: FormData) {
  await requireSession();
  const platform = String(formData.get('platform') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const scrapeLimit = Number.parseInt(String(formData.get('scrapeLimit') ?? '15'), 10) || 15;
  const dailyCap = Number.parseInt(String(formData.get('dailyCap') ?? '200'), 10) || 200;

  if (!platform || !label || !username || !password) throw new Error('กรุณากรอกข้อมูล connector ให้ครบ');

  await insertConnector({
    platform,
    label,
    username,
    passwordEnc: encryptSecret(password),
    scrapeLimit,
    dailyCap,
  });
  revalidatePath('/connectors');
}

export async function toggleConnectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (id) await setConnectorEnabled(id, enabled);
  revalidatePath('/connectors');
}

export async function deleteConnectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) await deleteConnector(id);
  revalidatePath('/connectors');
}

export async function setProviderCapAction(formData: FormData) {
  await requireSession();
  const platform = String(formData.get('platform') ?? '').trim();
  const dailyCap = Number.parseInt(String(formData.get('dailyCap') ?? ''), 10);
  if (platform && Number.isFinite(dailyCap) && dailyCap >= 0) await setProviderCap(platform, dailyCap);
  revalidatePath('/connectors');
}

export async function setFacebookDailyCapAction(formData: FormData) {
  await requireSession();
  const cap = Number.parseInt(String(formData.get('dailyCap') ?? ''), 10);
  // เพดานต่อบัญชี — จำกัด 1..50 กันตั้งพลาดจนโดน block (แนะนำ 15)
  if (Number.isFinite(cap) && cap >= 1 && cap <= 50) await setFacebookDailyCapForAll(cap);
  revalidatePath('/connectors');
}
