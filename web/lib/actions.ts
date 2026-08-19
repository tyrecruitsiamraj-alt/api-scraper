'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { encryptSecret } from './crypto';
import { kickWorker } from './worker-kick';
import {
  createAdjacentTask,
  createScrapeTaskFromSoRecruit,
  createCampaignFromRequest,
  enqueueDraftForCampaign,
  enqueueApprovedPost,
  beginCampaignDraftRetry,
  retryCampaignPost,
  enqueueMeasureForCampaign,
  getCampaign,
  getContentById,
  setCampaignStatus,
  setContentStatus,
  recordContentFeedback,
  updateContentCaption,
  updateContentPoster,
  confirmCampaignContactPhone,
  syncContentContactPhone,
  refreshContentQuality,
  deleteConnector,
  updateScraperConnector,
  updateFacebookAccount,
  deleteFacebookAccount,
  deleteTask,
  enqueueScrapeForTask,
  insertConnector,
  insertFacebookConnector,
  insertTask,
  queueTask,
  setConnectorEnabled,
  setFbAccountWorker,
  setProviderCap,
  setFacebookDailyCapForAll,
  setTaskEnabled,
  approveScrapeTaskResult,
  setSoRecruitRequestStatus,
  rejectSoRecruitRequest,
  createPostingGroup,
  deletePostingGroup,
  setAccountGroups,
  updateScrapeTaskCriteria,
  createContentTrend,
  setContentTrendActive,
  deleteContentTrend,
  enqueueWorkflowSelfTest,
  getWorkflowSelfTest,
  enqueueFacebookPreflight,
  recordCandidateActivity,
} from './repo';

/** ทดสอบ Web → Queue → Worker แบบไม่แตะงานจริงหรือ Facebook. */
export async function runWorkflowSelfTestAction() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const owner = session.user?.email ?? session.user?.name ?? null;
  const id = await enqueueWorkflowSelfTest(owner);

  // The web app can run on a serverless host where spawning a local Node
  // process is unsupported. The persistent worker (for example the pinned Mac)
  // owns queue execution, so wait briefly for its result instead of trying to
  // launch a second worker inside the Server Action. Never turn a slow/offline
  // worker into a generic Next.js "Application error"; readiness shows the
  // queued/error state in human language after revalidation.
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const result = await getWorkflowSelfTest(id);
    if (result?.status === 'done' || result?.status === 'error') break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  revalidatePath('/orchestrator');
}

export async function runFacebookPreflightAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const userId = String(formData.get('fbAccountId') ?? '').trim();
  if (!userId) throw new Error('กรุณาเลือกบัญชี Facebook ก่อนทดสอบ');
  await enqueueFacebookPreflight(userId, session.user?.email ?? session.user?.name ?? null);
  revalidatePath('/autopost');
  revalidatePath('/orchestrator');
}

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
}

export async function markCandidateViewedAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const candidateId = String(formData.get('candidateId') ?? '').trim();
  if (!candidateId) throw new Error('ไม่พบผู้สมัคร');
  await recordCandidateActivity({
    candidateId,
    activityType: 'viewed',
    actor: session.user?.email ?? session.user?.name ?? null,
  });
  revalidatePath('/candidates');
  revalidatePath(`/candidates/${candidateId}`);
}

export async function markCandidateCalledAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const candidateId = String(formData.get('candidateId') ?? '').trim();
  if (!candidateId) throw new Error('ไม่พบผู้สมัคร');
  const note = String(formData.get('note') ?? '').trim() || null;
  await recordCandidateActivity({
    candidateId,
    activityType: 'called',
    actor: session.user?.email ?? session.user?.name ?? null,
    note,
  });
  revalidatePath('/candidates');
  revalidatePath(`/candidates/${candidateId}`);
}

// ---- เทรนด์คอนเทนต์ (schema-016) — คนกรอกเทรนด์ที่อยากให้คอนเทนต์เกาะ ----
export async function createTrendAction(formData: FormData) {
  await requireSession();
  const label = String(formData.get('label') ?? '').trim();
  if (!label) throw new Error('ใส่ชื่อเทรนด์ก่อน');
  await createContentTrend({
    label,
    note: String(formData.get('note') ?? '').trim() || null,
    forCaption: formData.get('forCaption') !== null,
    forImage: formData.get('forImage') !== null,
  });
  revalidatePath('/settings/trends');
}

export async function toggleTrendAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  const active = String(formData.get('active') ?? '') === 'true';
  if (id) await setContentTrendActive(id, active);
  revalidatePath('/settings/trends');
}

export async function deleteTrendAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (id) await deleteContentTrend(id);
  revalidatePath('/settings/trends');
}

// ---- จัดการกลุ่มโพสต์ + ผูกกลุ่มเข้าบัญชี (หน้า /settings/posting native) ----
/** เพิ่มกลุ่มใหม่จาก URL หรือ ID กลุ่ม Facebook. */
export async function createGroupAction(formData: FormData) {
  await requireSession();
  const raw = String(formData.get('fbGroupId') ?? '').trim();
  // รับได้ทั้ง ID ล้วน หรือ URL — ดึงเลขกลุ่มออกมา
  const fbGroupId = (raw.match(/(?:groups\/)?(\d{6,})/)?.[1] ?? raw).trim();
  if (!/^\d{6,}$/.test(fbGroupId)) throw new Error('ใส่ ID กลุ่ม (ตัวเลข) หรือลิงก์กลุ่ม Facebook ที่ถูกต้อง');
  const name = String(formData.get('name') ?? '').trim();
  const province = String(formData.get('province') ?? '').trim();
  await createPostingGroup({ fbGroupId, name: name || null, province: province || null });
  revalidatePath('/settings/posting');
  revalidatePath('/orchestrator');
}

/** ลบกลุ่ม. */
export async function deleteGroupAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('ไม่พบกลุ่ม');
  await deletePostingGroup(id);
  revalidatePath('/settings/posting');
  revalidatePath('/orchestrator');
}

/** บันทึกกลุ่มที่บัญชีหนึ่งจะโพสต์ (ติ๊ก checkbox แล้วบันทึกทั้งชุด). */
export async function setAccountGroupsAction(formData: FormData) {
  await requireSession();
  const userId = String(formData.get('userId') ?? '').trim();
  if (!userId) throw new Error('ไม่พบบัญชี');
  const groupIds = formData.getAll('groupIds').map((v) => String(v)).filter(Boolean);
  await setAccountGroups(userId, groupIds);
  revalidatePath('/settings/posting');
  revalidatePath('/orchestrator');
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
  const requestedName = String(formData.get('name') ?? '').trim();
  const connectorId = String(formData.get('connectorId') ?? '');
  const mode = (String(formData.get('mode') ?? 'count') === 'date_range' ? 'date_range' : 'count') as
    | 'count'
    | 'date_range';
  const schedule = String(formData.get('schedule') ?? '').trim() || null;
  const runNow = formData.get('runNow') === 'on';
  // Checkbox is checked by default in the form; absent => user turned it off.
  const expandAdjacent = formData.get('expandAdjacent') === 'on';

  const position = String(formData.get('position') ?? '').trim();
  const keyword = String(formData.get('keyword') ?? '').trim();
  const jobDescription = String(formData.get('jobDescription') ?? '').trim();
  if (!jobDescription) throw new Error('กรุณาใส่รายละเอียดเนื้องาน');
  if (!connectorId) throw new Error('ยังไม่มีบัญชีสำหรับค้นหา Resume กรุณาเพิ่ม Connector ก่อน');
  const name = requestedName || jobDescription.replace(/\s+/g, ' ').slice(0, 80);
  const criteria: Record<string, unknown> = {};
  if (position) criteria.position = position;
  if (keyword) criteria.keyword = keyword;
  // โหมดเนื้องาน: worker จะให้ AI แปลงเป็นชุดตำแหน่งแล้ววนค้นจนครบ (ดู src/tasks-worker.js)
  if (jobDescription) criteria.job_description = jobDescription;

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
    if (!targetCount) throw new Error('กรุณาระบุจำนวน Resume ที่ต้องการ');
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
    const queued = await enqueueScrapeForTask(taskId); // hand off to the unified work_queue runner
    if (queued) kickWorker(); // drain only when a capability-verified worker owns it
  }
  revalidatePath('/scraping');
}

export async function queueTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) {
    await queueTask(id);
    const queued = await enqueueScrapeForTask(id); // hand off to the unified work_queue runner
    if (queued) kickWorker(); // no generic Next.js Digest when worker is not ready
  }
  revalidatePath('/scraping');
}

/** แก้เกณฑ์การค้นของ task หลังสร้าง (ตำแหน่ง/คำค้น/จังหวัด/เป้า) — ห้ามแก้ตอนกำลังวิ่ง. */
export async function updateTaskCriteriaAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await updateScrapeTaskCriteria(id, {
    position: String(formData.get('position') ?? ''),
    keyword: String(formData.get('keyword') ?? ''),
    province: String(formData.get('province') ?? ''),
    targetCount: Number(formData.get('targetCount')) || null,
  });
  revalidatePath('/scraping');
  revalidatePath('/orchestrator');
}

/** Fire a one-shot scrape for an AI-suggested adjacent position (🟡/🔴) the user picked. */
export async function expandAdjacentTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const position = String(formData.get('position') ?? '').trim();
  if (id && position) {
    const newId = await createAdjacentTask(id, position);
    const queued = await enqueueScrapeForTask(newId);
    if (queued) kickWorker();
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
/** อ่านช่องแก้ไขใบขอ (ov_*) จากฟอร์มการ์ด intake — ช่องว่าง = ไม่ทับข้อมูลเดิม */
function readIntakeOverrides(formData: FormData) {
  const g = (k: string) => String(formData.get(`ov_${k}`) ?? '').trim();
  return {
    position: g('position'), location: g('location'), income: g('income'),
    qty: g('qty'), work_schedule: g('work_schedule'), gender: g('gender'),
    age_min: g('age_min'), age_max: g('age_max'), unit_name: g('unit_name'), note: g('note'),
  };
}

export async function startCampaignAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  if (requestNo) {
    const owner = session.user?.email ?? session.user?.name ?? null;
    const campaignId = await createCampaignFromRequest(requestNo, owner, readIntakeOverrides(formData));
    if (campaignId) {
      await setCampaignStatus(campaignId, 'drafting');
      const queued = await enqueueDraftForCampaign(campaignId, owner); // AI คิด content เบื้องหลัง
      if (queued) kickWorker(); // drain คิวทันที (บนเครื่องที่รัน worker)
    }
  }
  revalidatePath('/orchestrator/imports');
  revalidatePath('/orchestrator');
}

/** ตีกลับใบขอจาก So Recruit (ยังไม่รับงาน) พร้อมเหตุผล — เขียนกลับให้ผู้ขอเห็นว่าขาดอะไร. */
export async function rejectRequestAction(formData: FormData) {
  await requireSession();
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  // ข้อที่คนติกว่าขาด/ให้แก้ + เหตุผลเพิ่มเติม → ประกอบเป็นข้อความตีกลับให้ผู้ขอเห็นชัด
  const missing = formData.getAll('missing').map((v) => String(v).trim()).filter(Boolean);
  const extra = String(formData.get('reason') ?? '').trim();
  const reason = [
    missing.length ? `ข้อมูลที่ต้องแก้/ขาด: ${missing.join(', ')}` : '',
    extra,
  ].filter(Boolean).join(' · ') || null;
  if (requestNo) await rejectSoRecruitRequest(requestNo, reason);
  revalidatePath('/orchestrator/imports');
  revalidatePath('/orchestrator');
}

/** อนุมัติรับคำขอ Scraping จาก So Recruit → สร้าง task, ผูก Connector และส่งเข้า worker queue. */
export async function startSoRecruitScrapeAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  const connectorId = String(formData.get('connectorId') ?? '').trim();
  if (!requestNo || !connectorId) throw new Error('กรุณาเลือก Connector ก่อนอนุมัติ');
  const owner = session.user?.email ?? session.user?.name ?? null;
  // แผน scrape ที่คนเห็น/แก้บนการ์ดก่อนกด (ว่าง = ตามใบขอ)
  const taskId = await createScrapeTaskFromSoRecruit(requestNo, connectorId, {
    position: String(formData.get('scrapePosition') ?? '').trim() || undefined,
    province: String(formData.get('scrapeProvince') ?? '').trim() || undefined,
    target: Number(formData.get('scrapeTarget')) || undefined,
  });
  const queued = await enqueueScrapeForTask(taskId, owner);
  if (queued) kickWorker();
  revalidatePath('/orchestrator');
  revalidatePath('/orchestrator/imports');
  revalidatePath('/scraping');
}

/** ตรวจรับผล Scraping หลัง worker ทำครบ เพื่อปิดคำขอกลับไปยัง So Recruit. */
export async function approveScrapeResultAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const taskId = String(formData.get('taskId') ?? '').trim();
  if (taskId) {
    await approveScrapeTaskResult(taskId, session.user?.email ?? session.user?.name ?? null);
  }
  revalidatePath('/orchestrator');
  revalidatePath('/scraping');
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
  const feedbackCode = String(formData.get('feedbackCode') ?? 'ready').trim();
  const feedbackNote = String(formData.get('feedbackNote') ?? '').trim() || null;
  if (!contentId || !campaignId) throw new Error('ข้อมูล Content ไม่ครบ');
  if (!fbAccountId) throw new Error('กรุณาเลือกบัญชี Facebook ก่อนอนุมัติ');
  const [campaign, content] = await Promise.all([getCampaign(campaignId), getContentById(contentId)]);
  if (!campaign || !content || content.campaign_id !== campaignId) throw new Error('ไม่พบ Content ของ campaign นี้');
  // โพสต์อะไร: both/image/caption (default both) — เฉพาะรูปต้องมีรูปจริง
  const pm = String(formData.get('postMode') ?? 'both').trim();
  const postMode = pm === 'image' || pm === 'caption' ? pm : 'both';
  if (postMode === 'image' && !content.has_image) throw new Error('ร่างนี้ไม่มีรูป — เลือก “เฉพาะรูป” ไม่ได้');
  if (!content.image_generation_ok) throw new Error('รูปของร่างนี้ยังไม่มีหลักฐานการสร้างตามตำแหน่ง กรุณาสั่ง AI สร้าง Content ใหม่ก่อนอนุมัติ');
  const reviewer = session.user?.email ?? session.user?.name ?? null;
  await enqueueApprovedPost({
    campaign,
    content,
    userId: fbAccountId,
    requestedBy: reviewer,
    postMode,
    feedbackCode,
    feedbackNote,
  });
  await setSoRecruitRequestStatus(campaign.request_no, 'posted');
  kickWorker(); // เปิดระบบกลางค้างไว้ เพื่อรับงานติดตามผลอัตโนมัติหลัง Facebook โพสต์เสร็จ
  // autopost worker (npm run worker:post) โพล post_run_queue เองทุก ~5 วิ — ไม่ต้อง kick
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
  revalidatePath('/autopost'); // อนุมัติจากหน้า Auto-Post ได้ด้วย → รีเฟรช section คิว
}

/** ลองให้ AI สร้าง Content ใหม่ หลัง worker/config ผิดพลาด. */
export async function retryCampaignDraftAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  if (!campaignId) throw new Error('ไม่พบ campaign');
  const started = await beginCampaignDraftRetry(campaignId, session.user?.email ?? session.user?.name ?? null);
  if (started) kickWorker();
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
}

/** ส่ง assignment เดิมกลับเข้าคิว Auto-Post โดยไม่สร้างโพสต์ซ้ำ. */
export async function retryCampaignPostAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  if (!campaignId) throw new Error('ไม่พบ campaign');
  await retryCampaignPost(campaignId, session.user?.email ?? session.user?.name ?? null);
  await setCampaignStatus(campaignId, 'posting');
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
  revalidatePath('/autopost');
}

/** แก้แคปชันของร่างคอนเทนต์ (ก่อนอนุมัติ). */
export async function editCaptionAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '');
  const campaignId = String(formData.get('campaignId') ?? '');
  const caption = String(formData.get('caption') ?? '').trim();
  if (contentId && caption) {
    await updateContentCaption(contentId, caption);
    await refreshContentQuality(contentId);
  }
  revalidatePath(`/orchestrator/${campaignId}`);
}

/** แก้ข้อความบนโปสเตอร์ แล้วประกอบ PNG ใหม่จากภาพต้นฉบับเดิม. */
export async function editPosterAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '').trim();
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  if (!contentId || !campaignId) throw new Error('ข้อมูล Content ไม่ครบ');
  const contactLine = String(formData.get('posterContactLine') ?? '').trim();
  if (contactLine) {
    const confirmedPhone = await confirmCampaignContactPhone(campaignId, contactLine);
    await syncContentContactPhone(contentId, confirmedPhone);
  }
  const list = (name: string) => String(formData.get(name) ?? '')
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  await updateContentPoster(contentId, {
    title: String(formData.get('posterTitle') ?? ''),
    badge: String(formData.get('posterBadge') ?? ''),
    location: String(formData.get('posterLocation') ?? ''),
    worktime: String(formData.get('posterWorktime') ?? ''),
    salaryTotal: String(formData.get('posterSalaryTotal') ?? ''),
    salaryBreakdown: String(formData.get('posterSalaryBreakdown') ?? ''),
    quantity: String(formData.get('posterQuantity') ?? ''),
    qualifications: list('posterQualifications'),
    benefits: list('posterBenefits'),
    contactLine,
    imageSide: String(formData.get('posterImageSide') ?? '') === 'left' ? 'left' : 'right',
  }, session.user?.email ?? session.user?.name ?? null);
  revalidatePath(`/orchestrator/${campaignId}`);
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
  const reasonCode = String(formData.get('reasonCode') ?? 'other').trim();
  const note = String(formData.get('reason') ?? '').trim() || null;
  const reason = [reasonCode, note].filter(Boolean).join(' · ');
  if (contentId && campaignId) {
    await recordContentFeedback({
      campaignId,
      contentId,
      decision: 'rejected',
      reasonCodes: [reasonCode],
      note,
      reviewer: session.user?.email ?? session.user?.name ?? null,
    });
    await setContentStatus(contentId, 'rejected', reason);
    await setCampaignStatus(campaignId, 'drafting', reason);
    const queued = await enqueueDraftForCampaign(campaignId, session.user?.email ?? session.user?.name ?? null); // คิด version ใหม่
    if (queued) kickWorker();
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
  revalidatePath('/settings/connectors');
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
  const requestedScrapeLimit = Number.parseInt(String(formData.get('scrapeLimit') ?? '15'), 10);
  const requestedDailyCap = Number.parseInt(String(formData.get('dailyCap') ?? (platform === 'facebook' ? '15' : '200')), 10);

  if (!platform || !label || !username || !password) throw new Error('กรุณากรอกข้อมูล connector ให้ครบ');
  if (!['jobbkk', 'jobthai', 'facebook'].includes(platform)) throw new Error('แพลตฟอร์มไม่ถูกต้อง');

  if (platform === 'facebook') {
    const dailyCap = Number.isFinite(requestedDailyCap) ? Math.min(50, Math.max(1, requestedDailyCap)) : 15;
    await insertFacebookConnector({
      label,
      username,
      password,
      posterName: String(formData.get('posterName') ?? '').trim(),
      contactPhone: String(formData.get('contactPhone') ?? '').trim(),
      dailyCap,
      preferredWorker: String(formData.get('preferredWorker') ?? '').trim(),
    });
    revalidatePath('/settings');
    revalidatePath('/settings/connectors');
    revalidatePath('/autopost/accounts');
    return;
  }

  const dailyCap = Number.isFinite(requestedDailyCap) ? Math.min(2000, Math.max(1, requestedDailyCap)) : 200;
  const scrapeLimit = Number.isFinite(requestedScrapeLimit) ? Math.min(100, Math.max(1, requestedScrapeLimit)) : 15;

  await insertConnector({
    platform,
    label,
    username,
    passwordEnc: encryptSecret(password),
    scrapeLimit,
    dailyCap,
  });
  revalidatePath('/connectors');
  revalidatePath('/settings');
  revalidatePath('/settings/connectors');
}

export async function toggleConnectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (id) await setConnectorEnabled(id, enabled);
  revalidatePath('/connectors');
  revalidatePath('/settings');
  revalidatePath('/settings/connectors');
}

export async function deleteConnectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) await deleteConnector(id);
  revalidatePath('/connectors');
  revalidatePath('/settings');
  revalidatePath('/settings/connectors');
}

/** แก้ไข connector (Scraper หรือ Facebook) — password ว่าง = คงรหัสเดิม. */
export async function editConnectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  const platform = String(formData.get('platform') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '').trim();
  if (!id || !label) throw new Error('กรุณากรอกชื่อที่แสดง');
  if (platform === 'facebook') {
    await updateFacebookAccount(id, { label, username, password: password || null });
  } else {
    await updateScraperConnector(id, { label, username, passwordEnc: password ? encryptSecret(password) : null });
  }
  revalidatePath('/settings/connectors');
}

/** ลบบัญชี Facebook. */
export async function deleteFacebookAccountAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (id) await deleteFacebookAccount(id);
  revalidatePath('/settings/connectors');
}

export async function setProviderCapAction(formData: FormData) {
  await requireSession();
  const platform = String(formData.get('platform') ?? '').trim();
  const dailyCap = Number.parseInt(String(formData.get('dailyCap') ?? ''), 10);
  if (platform && Number.isFinite(dailyCap) && dailyCap >= 0) await setProviderCap(platform, dailyCap);
  revalidatePath('/connectors');
  revalidatePath('/settings');
  revalidatePath('/settings/connectors');
}

export async function setFacebookDailyCapAction(formData: FormData) {
  await requireSession();
  const cap = Number.parseInt(String(formData.get('dailyCap') ?? ''), 10);
  // เพดานต่อบัญชี — จำกัด 1..50 กันตั้งพลาดจนโดน block (แนะนำ 15)
  if (Number.isFinite(cap) && cap >= 1 && cap <= 50) await setFacebookDailyCapForAll(cap);
  revalidatePath('/connectors');
  revalidatePath('/settings');
  revalidatePath('/settings/connectors');
}
