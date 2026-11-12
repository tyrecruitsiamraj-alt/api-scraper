'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { encryptFacebookPassword, encryptSecret } from './crypto';
import { kickWorker } from './worker-kick';
import { postCaptionIssues } from '../../src/core/post-caption-check.js';
import { MAX_GROUPS_PER_ADD, parseGroupLinks } from '../../src/core/group-links.js';
import { dailyCapCeiling } from '../../autopost/server/post-pacing.js';
import { dismissCommentLead, jarvisLeadsConfigured, requestAiCall, saveManualReply, saveReplyTemplate } from './comment-leads';
import type { ReplyKind } from './comment-leads';
import { replyTemplateProblem } from '../../autopost/server/comment-reply-templates.js';
import { q } from './db';
import { clearAccountVerification } from './post-tasks';
import { CONTENT_DISABLED_OPERATOR_MESSAGE, isContentGenerationEnabled } from './product-scope';
import { isBusinessUnit } from './business-units';
import { normalizePosterExtras, normalizePosterLayout } from '../../src/core/poster-template.js';
import type { PosterExtra, PosterLayout } from '../../src/core/poster-template.js';
import {
  createAdjacentTask,
  enqueueWorkerCodeUpdate,
  createScrapeTaskFromSoRecruit,
  createCampaignFromRequest,
  enqueueDraftForCampaign,
  approveContentForSummary,
  reopenContentForEditing,
  enqueueApprovedPost,
  beginCampaignDraftRetry,
  enqueueContentImageRegeneration,
  retryCampaignPost,
  enqueueMeasureForCampaign,
  getCampaign,
  getContentById,
  setCampaignStatus,
  setContentStatus,
  recordContentFeedback,
  updateContentCaption,
  updateContentPoster,
  clearPosterLayoutStandard,
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
  createPostingGroups,
  findPostingGroupByFbId,
  findPostingGroupsByFbIds,
  deletePostingGroup,
  setPostingGroupDepartment,
  setAccountGroups,
  updateScrapeTaskCriteria,
  createContentTrend,
  setContentTrendActive,
  deleteContentTrend,
  enqueueWorkflowSelfTest,
  getWorkflowSelfTest,
  getConnectorOption,
  enqueueFacebookPreflight,
  enqueueAssignmentPost,
  isGroupSector,
  postJarvisOrder,
  repostJarvisOrder,
  listPostingGroups,
  setAccountProvince,
  setPostingGroupJobTypes,
  setPostingGroupProvince,
  setPostingGroupSector,
  skippedGroupsNote,
  updateJarvisPostCaption,
  recordCandidateActivity,
  reassessCandidateJob,
} from './repo';
import type { GroupSector } from './group-sectors';
import { groupSectorLabel } from './group-sectors';
import { isGroupJobType } from './group-job-types';
import type { GroupJobType } from './group-job-types';

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

export async function postJarvisOrderAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  let notice = `ส่ง ${requestNo} เข้าคิวโพสต์แล้ว รอเครื่อง Worker รับงาน`;
  if (!requestNo) notice = 'ไม่พบคำสั่งโพสต์ที่เลือก';
  else if (formData.get('confirm') !== 'yes') notice = 'ติ๊กยืนยันก่อนว่าจะโพสต์จริงลงกลุ่ม';
  else {
    try {
      const started = await postJarvisOrder(requestNo, session.user?.email ?? session.user?.name ?? null);
      if (started.skipped.length) notice = `ส่ง ${requestNo} เข้าคิวโพสต์ ${started.groupCount} กลุ่ม · ${skippedGroupsNote(started.skipped)}`;
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    }
  }
  revalidatePath('/autopost');
  revalidatePath('/autopost/jobs');
  redirect(`/autopost/jobs?notice=${encodeURIComponent(notice)}`);
}

export async function repostJarvisOrderAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  const groupIds = formData.getAll('groupId').map(String);
  let notice = `ส่ง ${requestNo} เข้าคิวโพสต์ซ้ำแล้ว รอเครื่อง Worker รับงาน`;
  if (!requestNo) notice = 'ไม่พบคำสั่งโพสต์ที่เลือก';
  else if (formData.get('confirm') !== 'yes') notice = 'ติ๊กยืนยันก่อนว่าจะโพสต์จริงลงกลุ่ม';
  else {
    try {
      await repostJarvisOrder(requestNo, groupIds, session.user?.email ?? session.user?.name ?? null);
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    }
  }
  revalidatePath('/autopost');
  revalidatePath('/autopost/jobs');
  redirect(`/autopost/jobs?notice=${encodeURIComponent(notice)}`);
}

/** แก้แคปชั่นคำสั่งโพสต์จาก Jarvis แล้วเขียนกลับ Jarvis — ระบบตรวจข้อความใหม่ตอนเปิดหน้า */
export async function editJarvisCaptionAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  const caption = String(formData.get('caption') ?? '').replace(/\r\n/g, '\n').trim();
  let notice = `บันทึกข้อความของ ${requestNo} แล้ว และแก้ในใบสั่งของ Jarvis ด้วย`;
  if (!requestNo) notice = 'ไม่พบคำสั่งโพสต์ที่เลือก';
  else if (!caption) notice = 'ข้อความว่างอยู่ บันทึกไม่ได้';
  else {
    const issues = postCaptionIssues(caption);
    const saved = await updateJarvisPostCaption(requestNo, caption, session.user?.email ?? session.user?.name ?? null);
    if (!saved) notice = `แก้ข้อความไม่ได้: ${requestNo} ถูกโพสต์หรือตีกลับไปแล้ว`;
    else if (issues.length) notice = `บันทึกแล้ว แต่ยังโพสต์ไม่ได้: ${issues.join(' · ')}`;
  }
  revalidatePath('/autopost/jobs');
  redirect(`/autopost/jobs?notice=${encodeURIComponent(notice)}`);
}

/** ตีกลับคำสั่งโพสต์ให้ Jarvis แก้ พร้อมเหตุผล */
export async function returnJarvisPostOrderAction(formData: FormData) {
  await requireSession();
  const requestNo = String(formData.get('requestNo') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  let notice = `ตีกลับ ${requestNo} ให้ Jarvis แก้แล้ว`;
  if (!requestNo) notice = 'ไม่พบคำสั่งโพสต์ที่เลือก';
  else if (!reason) notice = 'ใส่เหตุผลก่อนตีกลับ';
  else await rejectSoRecruitRequest(requestNo, reason, 'content');
  revalidatePath('/autopost/jobs');
  revalidatePath('/orchestrator');
  redirect(`/autopost/jobs?notice=${encodeURIComponent(notice)}`);
}

/** พิมพ์คำตอบให้คอมเมนต์ที่ระบบตอบเองไม่ได้ */
export async function replyCommentLeadAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const id = String(formData.get('id') ?? '').trim();
  const text = String(formData.get('reply') ?? '').replace(/\r\n/g, '\n').trim();
  let notice = 'บันทึกคำตอบแล้ว ระบบจะโพสต์ใต้คอมเมนต์ในรอบเก็บคอมเมนต์ถัดไป';
  if (!id || !text) notice = 'พิมพ์คำตอบก่อนบันทึก';
  else if (text.length > 1000) notice = 'คำตอบยาวเกิน 1,000 ตัวอักษร';
  else if (!(await saveManualReply(id, text, session.user?.email ?? session.user?.name ?? null))) notice = 'คอมเมนต์นี้ถูกตอบไปแล้ว';
  revalidatePath('/autopost/leads');
  redirect(`/autopost/leads?notice=${encodeURIComponent(notice)}`);
}

/** ทีมแก้ข้อความที่บอทตอบใต้คอมเมนต์เอง — มีผลกับคอมเมนต์ใหม่ที่เก็บรอบถัดไป (คอมเมนต์ที่ได้คำตอบไปแล้วไม่เปลี่ยน) */
export async function saveReplyTemplateAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const kind = String(formData.get('kind') ?? '');
  const body = String(formData.get('body') ?? '').replace(/\r\n/g, '\n').trim();
  let notice: string;
  if (kind !== 'phone' && kind !== 'interest') notice = 'ไม่รู้จักแบบคอมเมนต์นี้';
  else {
    const problem = replyTemplateProblem(body);
    if (problem) notice = `ยังไม่ได้บันทึก: ${problem}`;
    else {
      await saveReplyTemplate(kind as ReplyKind, body, session.user?.email ?? session.user?.name ?? null);
      notice = body
        ? 'บันทึกข้อความตอบแล้ว ใช้กับคอมเมนต์ใหม่ตั้งแต่รอบเก็บคอมเมนต์ถัดไป'
        : 'บันทึกแล้ว: คอมเมนต์แบบนี้ระบบจะไม่ตอบเอง ส่งให้คนตอบในหน้านี้';
    }
  }
  revalidatePath('/autopost/leads');
  redirect(`/autopost/leads?notice=${encodeURIComponent(notice)}`);
}

/** ไม่ต้องตอบคอมเมนต์นี้ */
export async function dismissCommentLeadAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (id) await dismissCommentLead(id);
  revalidatePath('/autopost/leads');
  redirect(`/autopost/leads?notice=${encodeURIComponent('ไม่ตอบคอมเมนต์นี้แล้ว')}`);
}

/** ส่งคนที่เลือก (มีเบอร์) ให้ AI โทร */
export async function requestAiCallAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const ids = formData.getAll('leadId').map(String).filter(Boolean);
  let notice = 'เลือกคนที่จะให้ AI โทรก่อน';
  if (ids.length) {
    const { requested, skipped } = await requestAiCall(ids, session.user?.email ?? session.user?.name ?? null);
    notice = `ขอให้ AI โทร ${requested} คน${skipped ? ` (ข้าม ${skipped} คน: ไม่มีเบอร์หรือขอไปแล้ว)` : ''}`;
    if (!jarvisLeadsConfigured()) notice += ' · ยังไม่ได้เชื่อม API ของ Jarvis รายชื่อจะรอส่งจนกว่าจะเชื่อม';
  }
  revalidatePath('/autopost/leads');
  redirect(`/autopost/leads?notice=${encodeURIComponent(notice)}`);
}

export async function postAssignmentNowAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const assignmentId = String(formData.get('assignmentId') ?? '').trim();
  let notice = 'ส่งงานเข้าคิวโพสต์แล้ว รอเครื่อง Worker รับงาน';
  if (!assignmentId) notice = 'ไม่พบงานโพสต์ที่เลือก';
  else if (formData.get('confirm') !== 'yes') notice = 'ติ๊กยืนยันก่อนว่าจะโพสต์จริงลงกลุ่ม';
  else {
    try {
      await enqueueAssignmentPost(assignmentId, session.user?.email ?? session.user?.name ?? null);
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    }
  }
  revalidatePath('/autopost');
  revalidatePath('/autopost/jobs');
  redirect(`/autopost/jobs?notice=${encodeURIComponent(notice)}`);
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

/** ปุ่ม "อัปเดตโค้ดทุกเครื่อง" ใต้สถานะเครื่อง — สั่งผ่านคิว ไม่ต้องเข้าไปกดที่เครื่อง */
export async function updateWorkersCodeAction(formData: FormData) {
  await requireSession();
  const raw = String(formData.get('back') ?? '').trim();
  const back = /^\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : '/orchestrator';
  let notice: string;
  try {
    const { enqueued, posting } = await enqueueWorkerCodeUpdate();
    const machines = [...new Set(enqueued.map((e) => e.machine.replace(/\.local$/i, '')))];
    if (posting) {
      notice = `ยังไม่อัปเดต: Autopost กำลังโพสต์อยู่ ${posting} งาน รอให้โพสต์เสร็จแล้วกดใหม่`;
    } else if (!machines.length) {
      notice = 'ไม่มีเครื่อง Scrap ออนไลน์ให้อัปเดต หรือสั่งไปแล้วกำลังรอเครื่องรับ';
    } else {
      notice = `สั่งอัปเดตโค้ดแล้ว ${machines.length} เครื่อง: ${machines.join(', ')} · เครื่องจะเปิดตัวเองใหม่ภายใน 1–2 นาที`;
      if (enqueued.some((e) => !e.whole_machine)) notice += ' · Autopost บนเครื่อง Windows ยังต้องกดอัปเดตโค้ดที่เครื่อง';
    }
  } catch (error) {
    notice = `สั่งอัปเดตไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`;
  }
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent(notice)}`);
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

export async function reassessCandidateJobAction(formData: FormData) {
  await requireSession();
  const taskId = String(formData.get('taskId') ?? '').trim();
  if (!taskId) throw new Error('ไม่พบใบงานที่ต้องประเมิน');
  await reassessCandidateJob(taskId);
  revalidatePath('/candidates/jobs');
  revalidatePath(`/candidates/jobs/${taskId}`);
  redirect(`/candidates/jobs/${taskId}?rescored=1`);
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
/** รายชื่อในกล่องสรุป ยาวเกินตัดเหลือ 10 รายการ */
function listSome(items: string[], max = 10) {
  return items.slice(0, max).join(', ') + (items.length > max ? ` และอีก ${items.length - max}` : '');
}

/**
 * เพิ่มกลุ่มจากลิงก์หรือ ID กลุ่ม Facebook — วางได้หลายบรรทัด บรรทัดละกลุ่ม (เจ้าของ 12 พ.ย. 2569)
 * ทุกกลุ่มในรอบเดียวกันได้ธุรกิจ/หมวด/จังหวัด/ประเภทงานเดียวกัน · กลุ่มที่มีอยู่แล้วข้าม ไม่แตะของเดิม
 */
export async function createGroupAction(formData: FormData) {
  await requireSession();
  // ข้อผิดพลาดที่ผู้ใช้แก้เองได้ ขึ้นเป็นข้อความบนหน้า — throw ใน production กลายเป็นจอ "Application error"
  // (9 พ.ย. 2569: เพิ่มกลุ่มที่มีอยู่แล้ว ชน unique fb_group_id จอขาวทั้งหน้า)
  const back: (notice: string, list?: string) => never = (notice, list = '') =>
    redirect(`/settings/posting?notice=${encodeURIComponent(notice)}${list}`);
  const { ids, invalid } = parseGroupLinks(String(formData.get('fbGroupId') ?? ''));
  if (!ids.length) {
    back(`ใส่ ID กลุ่ม (ตัวเลข) หรือลิงก์กลุ่ม Facebook ที่ถูกต้อง${invalid.length ? `\nอ่านเลขกลุ่มไม่ได้: ${listSome(invalid)}` : ''}`);
  }
  if (ids.length > MAX_GROUPS_PER_ADD) back(`วางได้ครั้งละไม่เกิน ${MAX_GROUPS_PER_ADD} กลุ่ม ตอนนี้วางมา ${ids.length} กลุ่ม`);
  const name = String(formData.get('name') ?? '').trim();
  if (name && ids.length > 1) back('ชื่อกลุ่มใส่ได้ตอนเพิ่มทีละกลุ่ม ถ้าเพิ่มหลายกลุ่มให้เว้นช่องชื่อไว้ ระบบอ่านชื่อจาก Facebook ให้ตอนโพสต์');
  const province = String(formData.get('province') ?? '').trim();
  const department = readBusinessUnit(formData.get('department'));
  if (!department) back('เลือกธุรกิจของกลุ่มนี้ (LBD / LBA / LM)');
  const sector = readGroupSector(formData.get('sector'));
  let jobTypes: GroupJobType[] = [];
  try {
    jobTypes = readGroupJobTypes(formData);
  } catch (e) {
    back((e as Error).message);
  }

  if (ids.length === 1 && !invalid.length) {
    const fbGroupId = ids[0];
    const existing = await findPostingGroupByFbId(fbGroupId);
    // รายการด้านล่างเปิดที่หมวดของกลุ่มนั้นพร้อมค้นเลขกลุ่มให้ — เดิมรายการเปิดที่ "เอกชน" เสมอ
    // กลุ่มที่นำเข้าจากชีตราชการเลยดูเหมือนไม่มี (9 พ.ย. 2569: 1481054599057270 อยู่หมวดราชการ)
    if (existing) {
      back(
        `กลุ่มนี้มีในระบบแล้ว ชื่อ "${existing.name}" อยู่หมวด${groupSectorLabel(existing.sector)}` +
          `${existing.department ? ` · ${existing.department}` : ''} (เลขกลุ่ม ${fbGroupId}) ไม่ต้องเพิ่มซ้ำ ` +
          `ถ้าจะใช้เป็นกลุ่ม${groupSectorLabel(sector)} ให้เปลี่ยนหมวดที่กลุ่มนี้ในรายการด้านล่าง`,
        `&sector=${existing.sector}&q=${fbGroupId}`,
      );
    }
    try {
      await createPostingGroup({ fbGroupId, name: name || null, province: province || null, department, sector, jobTypes });
    } catch (e) {
      // มีคนเพิ่มกลุ่มเดียวกันพร้อมกัน
      if ((e as { code?: string }).code === '23505') back(`กลุ่มนี้มีในระบบแล้ว (เลขกลุ่ม ${fbGroupId}) ไม่ต้องเพิ่มซ้ำ`);
      throw e;
    }
    revalidatePath('/settings/posting');
    revalidatePath('/orchestrator');
    return;
  }

  const existing = await findPostingGroupsByFbIds(ids);
  const existingIds = new Set(existing.map((g) => g.fb_group_id));
  const added = await createPostingGroups({
    fbGroupIds: ids.filter((id) => !existingIds.has(id)),
    province: province || null,
    department,
    sector,
    jobTypes,
  });
  const addedSet = new Set(added);
  // เลขที่ไม่ได้เพิ่มและไม่อยู่ในรายการเดิม = มีคนเพิ่มพร้อมกัน นับเป็นมีอยู่แล้ว
  const skipped = [
    ...existing.map((g) => `${g.name} (${g.fb_group_id}${g.sector !== sector ? ` หมวด${groupSectorLabel(g.sector)}` : ''})`),
    ...ids.filter((id) => !existingIds.has(id) && !addedSet.has(id)),
  ];
  const lines = [
    added.length ? `เพิ่ม ${added.length} กลุ่ม เป็นกลุ่ม${groupSectorLabel(sector)} ของ ${department}` : 'ไม่มีกลุ่มใหม่ให้เพิ่ม',
    skipped.length ? `มีในระบบอยู่แล้ว ${skipped.length} กลุ่ม ข้ามไป: ${listSome(skipped)}` : '',
    invalid.length ? `อ่านเลขกลุ่มไม่ได้ ${invalid.length} บรรทัด: ${listSome(invalid)}` : '',
  ].filter(Boolean);
  revalidatePath('/settings/posting');
  revalidatePath('/orchestrator');
  back(lines.join('\n'), `&sector=${sector}${added.length ? '&ok=1' : ''}`);
}

/** ประเภทงานจากฟอร์ม (checkbox ชื่อ jobTypes หลายตัว) — ค่าที่ไม่รู้จักถือว่าพิมพ์มั่ว */
function readGroupJobTypes(formData: FormData): GroupJobType[] {
  const picked = formData.getAll('jobTypes').map((v) => String(v).trim()).filter(Boolean);
  const bad = picked.filter((v) => !isGroupJobType(v));
  if (bad.length) throw new Error(`ไม่รู้จักประเภทงาน ${bad.join(', ')}`);
  return picked as GroupJobType[];
}

/** ตั้งประเภทงานของกลุ่ม (ติ๊กในรายการกลุ่มแล้วกดบันทึก) */
export async function setGroupJobTypesAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('ไม่พบกลุ่ม');
  await setPostingGroupJobTypes(id, readGroupJobTypes(formData));
  revalidatePath('/settings/posting');
}

/** ประเภทกลุ่มจากฟอร์ม — ว่าง = เอกชน */
function readGroupSector(value: FormDataEntryValue | null): GroupSector {
  const code = String(value ?? '').trim();
  if (!code) return 'private';
  if (!isGroupSector(code)) throw new Error(`ไม่รู้จักประเภทกลุ่ม ${code}`);
  return code;
}

/** รายชื่อกลุ่มสำหรับช่องเลือกกลุ่มในฟอร์มบัญชี — โหลดตอนเปิดฟอร์ม ไม่ฝังในหน้า */
export async function listPickerGroupsAction() {
  await requireSession();
  return listPostingGroups();
}

/** ตั้งจังหวัดของบัญชี (Facebook หรือบัญชีค้นหา) — key = '<platform>:<id>' · หลายจังหวัดคั่นจุลภาค · ว่าง = ไม่ระบุ */
export async function setAccountProvinceAction(formData: FormData) {
  await requireSession();
  const key = String(formData.get('key') ?? '').trim();
  if (!key.includes(':')) throw new Error('ไม่พบบัญชี');
  const province = String(formData.get('province') ?? '').replace(/\s+/g, ' ').trim();
  await setAccountProvince(key, province || null);
  revalidatePath('/settings/connectors');
}

/** ตั้งจังหวัดของกลุ่ม (พิมพ์ในรายการกลุ่มแล้วกด Enter) — หลายจังหวัดคั่นด้วยจุลภาค · ว่าง = ไม่ระบุ */
export async function setGroupProvinceAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('ไม่พบกลุ่ม');
  const province = String(formData.get('province') ?? '').replace(/\s+/g, ' ').trim();
  await setPostingGroupProvince(id, province || null);
  revalidatePath('/settings/posting');
}

/** เปลี่ยนประเภทกลุ่ม ราชการ/เอกชน (เลือกจากรายการกลุ่ม) */
export async function setGroupSectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('ไม่พบกลุ่ม');
  await setPostingGroupSector(id, readGroupSector(formData.get('sector')));
  revalidatePath('/settings/posting');
}

/** รหัสธุรกิจจากฟอร์ม — ว่าง = ไม่ระบุ, ค่าที่ไม่อยู่ในรายการถือว่าพิมพ์มั่ว */
function readBusinessUnit(value: FormDataEntryValue | null): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return null;
  if (!isBusinessUnit(code)) throw new Error(`ไม่รู้จักรหัสธุรกิจ ${code}`);
  return code;
}

/** เปลี่ยนว่ากลุ่มนี้เป็นของธุรกิจไหน (เลือกจากรายการกลุ่ม). */
export async function setGroupDepartmentAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('ไม่พบกลุ่ม');
  await setPostingGroupDepartment(id, readBusinessUnit(formData.get('department')));
  revalidatePath('/settings/posting');
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
// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function createTaskAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const createdBy = String(session.user?.email ?? session.user?.name ?? '').trim();
  const requestedName = String(formData.get('name') ?? '').trim();
  const connectorId = String(formData.get('connectorId') ?? '');
  const mode = (String(formData.get('mode') ?? 'count') === 'date_range' ? 'date_range' : 'count') as
    | 'count'
    | 'date_range';
  const runNow = formData.get('runNow') === 'on';
  // Checkbox is checked by default in the form; absent => user turned it off.
  const expandAdjacent = formData.get('expandAdjacent') === 'on';

  const position = String(formData.get('position') ?? '').trim();
  const keyword = String(formData.get('keyword') ?? '').trim();
  const jobDescription = String(formData.get('jobDescription') ?? '').trim();
  if (!jobDescription) throw new Error('กรุณาใส่รายละเอียดเนื้องาน');
  if (!connectorId) throw new Error('ยังไม่มีบัญชีสำหรับค้นหา Resume กรุณาเพิ่ม Connector ก่อน');
  const connector = await getConnectorOption(connectorId);
  if (!connector?.available) {
    const reason = connector?.block_reason || 'บัญชี Connector นี้ยังไม่พร้อมใช้งาน';
    redirect(`/scraping?notice=${encodeURIComponent(reason)}`);
  }
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
  const industry = filterVal('industry');
  const education = filterVal('education');
  const salaryMin = filterVal('salaryMin');
  const salaryMax = filterVal('salaryMax');
  const ageMin = filterVal('ageMin');
  const ageMax = filterVal('ageMax');
  const ageMinNumber = ageMin ? Number.parseInt(ageMin, 10) : NaN;
  const ageMaxNumber = ageMax ? Number.parseInt(ageMax, 10) : NaN;
  if ((Number.isFinite(ageMinNumber) && (ageMinNumber < 15 || ageMinNumber > 80))
      || (Number.isFinite(ageMaxNumber) && (ageMaxNumber < 15 || ageMaxNumber > 80))) {
    throw new Error('ช่วงอายุต้องอยู่ระหว่าง 15–80 ปี');
  }
  if (Number.isFinite(ageMinNumber) && Number.isFinite(ageMaxNumber) && ageMinNumber > ageMaxNumber) {
    throw new Error('อายุต่ำสุดต้องไม่มากกว่าอายุสูงสุด');
  }
  if (gender) criteria.gender = gender;
  if (province) criteria.province = province;
  if (industry) criteria.industry = industry;
  if (education) criteria.education = education;
  if (salaryMin) criteria.salaryMin = salaryMin;
  if (salaryMax) criteria.salaryMax = salaryMax;
  if (ageMin) criteria.ageMin = ageMin;
  if (ageMax) criteria.ageMax = ageMax;
  // เก็บชื่อคนสร้าง ใช้กรอง "ใครสั่ง" ในหน้างาน Scrap
  if (createdBy) criteria.created_by = createdBy;

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
    // run-now → queued so the worker picks it up immediately
    status: runNow ? 'queued' : 'idle',
    expandAdjacent,
  });
  if (runNow) {
    const queued = await enqueueScrapeForTask(taskId); // hand off to the unified work_queue runner
    if (queued) {
      kickWorker(); // drain only when a capability-verified worker owns it
      revalidatePath('/scraping');
      revalidatePath('/orchestrator');
      redirect(`/scraping/${taskId}?started=1`);
    }
    const rows = await q<{ last_error: string | null }>(
      `SELECT last_error FROM scrape_tasks WHERE id=$1`,
      [taskId],
    ).catch(() => [] as { last_error: string | null }[]);
    const reason = rows[0]?.last_error || 'ยังไม่เริ่มค้นหา: Worker ยังไม่พร้อม';
    revalidatePath('/scraping');
    revalidatePath('/orchestrator');
    redirect(`/scraping/${taskId}?notice=${encodeURIComponent(reason)}`);
  }
  revalidatePath('/scraping');
  revalidatePath('/orchestrator');
  redirect(`/scraping/${taskId}?created=1`);
}

export async function queueTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) {
    await queueTask(id);
    const queued = await enqueueScrapeForTask(id); // hand off to the unified work_queue runner
    if (queued) {
      kickWorker(); // no generic Next.js Digest when worker is not ready
    } else {
      const rows = await q<{ last_error: string | null }>(
        `SELECT last_error FROM scrape_tasks WHERE id=$1`,
        [id],
      ).catch(() => [] as { last_error: string | null }[]);
      const reason = rows[0]?.last_error || 'ยังไม่เริ่มค้นหา: Worker ยังไม่พร้อม';
      revalidatePath('/scraping');
      revalidatePath(`/scraping/${id}`);
      revalidatePath('/orchestrator');
      redirect(`/scraping/${id}?notice=${encodeURIComponent(reason)}`);
    }
  }
  revalidatePath('/scraping');
  revalidatePath(`/scraping/${id}`);
  revalidatePath('/orchestrator');
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
  revalidatePath(`/scraping/${id}`);
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
  revalidatePath(`/scraping/${id}`);
}

export async function toggleTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (id) await setTaskEnabled(id, enabled);
  revalidatePath('/scraping');
  revalidatePath(`/scraping/${id}`);
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
  if (!isContentGenerationEnabled()) {
    redirect(`/orchestrator?notice=${encodeURIComponent(CONTENT_DISABLED_OPERATOR_MESSAGE)}`);
  }
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
  const typeField = String(formData.get('requestType') ?? '').trim();
  const requestType = typeField === 'content' || typeField === 'scraping' ? typeField : undefined;
  if (requestNo) await rejectSoRecruitRequest(requestNo, reason, requestType);
  revalidatePath('/orchestrator/imports');
  revalidatePath('/orchestrator');
}

/** ตีกลับคำขอสร้างประกาศที่ระบบไม่รับแล้ว (ทีละหลายใบจากแถบบนศูนย์งาน). */
export async function rejectDisabledContentRequestsAction(formData: FormData) {
  await requireSession();
  if (isContentGenerationEnabled()) {
    redirect(`/orchestrator?notice=${encodeURIComponent('ระบบเปิดสร้างประกาศอยู่ — ใช้ปุ่มตีกลับรายใบแทน')}`);
  }
  const requestNos = formData.getAll('requestNo').map((v) => String(v).trim()).filter(Boolean);
  for (const requestNo of requestNos) {
    await rejectSoRecruitRequest(requestNo, CONTENT_DISABLED_OPERATOR_MESSAGE, 'content');
  }
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
  const connector = await getConnectorOption(connectorId);
  if (!connector?.available) {
    redirect(`/orchestrator?notice=${encodeURIComponent(connector?.block_reason || 'บัญชี Connector นี้ยังไม่พร้อมใช้งาน')}`);
  }
  const owner = session.user?.email ?? session.user?.name ?? null;
  const formField = (key: string) => {
    if (!formData.has(key)) return undefined;
    return String(formData.get(key) ?? '').trim();
  };
  // แผน scrape ที่คนเห็น/แก้บนการ์ดก่อนกด (ไม่มีช่อง = ตามใบขอ; ล้างช่อง = ไม่ใส่ตัวกรองนั้น)
  const taskId = await createScrapeTaskFromSoRecruit(requestNo, connectorId, {
    position: formField('scrapePosition'),
    keyword: formField('scrapeKeyword'),
    industry: formField('scrapeIndustry'),
    province: formField('scrapeProvince'),
    target: Number(formData.get('scrapeTarget')) || undefined,
    gender: formField('scrapeGender'),
    education: formField('scrapeEducation'),
    salaryMin: formField('scrapeSalaryMin'),
    salaryMax: formField('scrapeSalaryMax'),
    ageMin: formField('scrapeAgeMin'),
    ageMax: formField('scrapeAgeMax'),
  });
  const queued = await enqueueScrapeForTask(taskId, owner);
  if (queued) {
    kickWorker();
  } else {
    const rows = await q<{ last_error: string | null }>(
      `SELECT last_error FROM scrape_tasks WHERE id=$1`,
      [taskId],
    ).catch(() => [] as { last_error: string | null }[]);
    const reason = rows[0]?.last_error || 'ยังไม่เริ่มค้นหา: Worker ยังไม่พร้อม';
    revalidatePath('/orchestrator');
    revalidatePath('/orchestrator/imports');
    revalidatePath('/scraping');
    redirect(`/scraping/${taskId}?notice=${encodeURIComponent(reason)}`);
  }
  revalidatePath('/orchestrator');
  revalidatePath('/orchestrator/imports');
  revalidatePath('/scraping');
  redirect(`/scraping/${taskId}?started=1`);
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

/** อนุมัติ "สื่อ" เท่านั้น แล้วพาไปหน้าสรุปก่อนกด Auto-post จริง. */
export async function approveContentAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '');
  const campaignId = String(formData.get('campaignId') ?? '');
  const feedbackCode = String(formData.get('feedbackCode') ?? 'ready').trim();
  const feedbackNote = String(formData.get('feedbackNote') ?? '').trim() || null;
  if (!contentId || !campaignId) throw new Error('ข้อมูล Content ไม่ครบ');
  const reviewer = session.user?.email ?? session.user?.name ?? null;
  await approveContentForSummary({
    campaignId,
    contentId,
    reviewer,
    feedbackCode,
    feedbackNote,
  });
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
}

/** ย้อนจากหน้าสรุปกลับมาหน้าแก้รูปและ Caption โดยไม่สร้างคิวโพสต์. */
export async function reopenContentForEditingAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  const contentId = String(formData.get('contentId') ?? '').trim();
  if (!campaignId || !contentId) throw new Error('ข้อมูล Content ไม่ครบ');
  await reopenContentForEditing(campaignId, contentId, session.user?.email ?? session.user?.name ?? null);
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
}

/** หน้าสรุปยืนยันบัญชี/จำนวนกลุ่มแล้วจึงสร้างคิวโพสต์จริง. */
export async function startCampaignAutopostAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '').trim();
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  const fbAccountId = String(formData.get('fbAccountId') ?? '').trim();
  if (!contentId || !campaignId || !fbAccountId) throw new Error('กรุณาเลือกบัญชี Facebook ก่อนเริ่ม Auto-post');
  const [campaign, content] = await Promise.all([getCampaign(campaignId), getContentById(contentId)]);
  if (!campaign || !content || content.campaign_id !== campaignId) throw new Error('ไม่พบ Content ของ campaign นี้');
  const pm = String(formData.get('postMode') ?? 'both').trim();
  const postMode = pm === 'image' || pm === 'caption' ? pm : 'both';
  if (postMode === 'image' && !content.has_image) throw new Error('ร่างนี้ไม่มีรูป — เลือก “เฉพาะรูป” ไม่ได้');
  if (!content.image_generation_ok) throw new Error('รูปของร่างนี้ยังไม่มีหลักฐานการสร้างตามตำแหน่ง กรุณาสั่ง AI สร้าง Content ใหม่ก่อน Auto-post');
  const reviewer = session.user?.email ?? session.user?.name ?? null;
  await enqueueApprovedPost({
    campaign,
    content,
    userId: fbAccountId,
    requestedBy: reviewer,
    postMode,
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
  if (!isContentGenerationEnabled()) {
    redirect(`/orchestrator${campaignId ? `/${campaignId}` : ''}?contentError=${encodeURIComponent(CONTENT_DISABLED_OPERATOR_MESSAGE)}`);
  }
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

/** คิดเฉพาะภาพใหม่จาก brief เดิม โดยไม่แก้ Caption หรือข้อมูลบนโปสเตอร์. */
export async function regenerateContentImageAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '').trim();
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  if (!contentId || !campaignId) throw new Error('ข้อมูล Content ไม่ครบ');
  const queued = await enqueueContentImageRegeneration(contentId, campaignId, session.user?.email ?? session.user?.name ?? null);
  if (queued) kickWorker();
  revalidatePath(`/orchestrator/${campaignId}`);
  revalidatePath('/orchestrator');
}

/** แก้ข้อความบนโปสเตอร์ แล้วประกอบ PNG ใหม่จากภาพต้นฉบับเดิม. */
export async function editPosterAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const contentId = String(formData.get('contentId') ?? '').trim();
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  if (!contentId || !campaignId) throw new Error('ข้อมูล Content ไม่ครบ');
  let standardSaved = false;
  try {
    const contactLine = String(formData.get('posterContactLine') ?? '').trim();
    if (contactLine) {
      const confirmedPhone = await confirmCampaignContactPhone(campaignId, contactLine);
      await syncContentContactPhone(contentId, confirmedPhone);
    }
    const saveAsStandard = String(formData.get('saveAsStandard') ?? '') === '1';
    const result = await updateContentPoster(
      contentId,
      posterFieldsFromForm(formData),
      session.user?.email ?? session.user?.name ?? null,
      { saveAsStandard },
    );
    standardSaved = result.standardSaved;
    revalidatePath(`/orchestrator/${campaignId}`);
  } catch (error) {
    // Server Action ต้องไม่โยน error จนผู้ใช้เห็นหน้า Application error; กลับไปหน้าเดิมพร้อมคำที่แก้ได้.
    const message = error instanceof Error ? error.message : 'บันทึกรูปไม่สำเร็จ กรุณาลองใหม่';
    redirect(`/orchestrator/${campaignId}?contentError=${encodeURIComponent(message)}`);
  }
  // ผลสำเร็จต้องเห็นได้บนหน้าเดียวกัน ไม่ปล่อยให้ผู้ใช้เดาว่าปุ่มทำงานหรือไม่.
  redirect(`/orchestrator/${campaignId}?contentSaved=poster&standard=${standardSaved ? '1' : '0'}`);
}

function readPosterLayout(formData: FormData): PosterLayout | undefined {
  const raw = String(formData.get('posterLayout') ?? '').trim();
  if (!raw) return undefined;
  try {
    return normalizePosterLayout(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function readPosterExtras(formData: FormData): PosterExtra[] | undefined {
  const raw = String(formData.get('posterExtras') ?? '').trim();
  if (!raw) return undefined;
  try {
    return normalizePosterExtras(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function posterFieldsFromForm(formData: FormData) {
  const list = (name: string) => String(formData.get(name) ?? '')
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  return {
    title: String(formData.get('posterTitle') ?? ''),
    badge: String(formData.get('posterBadge') ?? ''),
    location: String(formData.get('posterLocation') ?? ''),
    worktime: String(formData.get('posterWorktime') ?? ''),
    salaryTotal: String(formData.get('posterSalaryTotal') ?? ''),
    salaryBreakdown: String(formData.get('posterSalaryBreakdown') ?? ''),
    quantity: String(formData.get('posterQuantity') ?? ''),
    qualifications: list('posterQualifications'),
    benefits: list('posterBenefits'),
    contactLine: String(formData.get('posterContactLine') ?? '').trim(),
    imageSide: String(formData.get('posterImageSide') ?? '') === 'left' ? 'left' as const : 'right' as const,
    logoVariant: String(formData.get('posterLogoVariant') ?? '') === 'so-red' ? 'so-red' as const : 'people-navy' as const,
    layout: readPosterLayout(formData),
    extras: readPosterExtras(formData),
  };
}

async function saveContentWorkspace(formData: FormData, editor: string | null) {
  const contentId = String(formData.get('contentId') ?? '').trim();
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  if (!contentId || !campaignId) throw new Error('ข้อมูล Content ไม่ครบ');
  const caption = String(formData.get('caption') ?? '').trim();
  await updateContentCaption(contentId, caption);
  const contactLine = String(formData.get('posterContactLine') ?? '').trim();
  if (contactLine) {
    const confirmedPhone = await confirmCampaignContactPhone(campaignId, contactLine);
    await syncContentContactPhone(contentId, confirmedPhone);
  }
  await updateContentPoster(
    contentId,
    posterFieldsFromForm(formData),
    editor,
    { saveAsStandard: String(formData.get('saveAsStandard') ?? '') === '1' },
  );
  return { campaignId, contentId };
}

/** ปุ่มบันทึกร่างใน Pixel Workspace: บันทึกรูปและ Caption พร้อมกัน แต่ไม่อนุมัติ/ไม่โพสต์. */
export async function saveContentWorkspaceAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  let campaignId = String(formData.get('campaignId') ?? '').trim();
  try {
    ({ campaignId } = await saveContentWorkspace(formData, session.user?.email ?? session.user?.name ?? null));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'บันทึกร่างไม่สำเร็จ กรุณาลองใหม่';
    redirect(`/orchestrator/${campaignId}?contentError=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/orchestrator/${campaignId}`);
  const standardSaved = String(formData.get('saveAsStandard') ?? '') === '1';
  redirect(`/orchestrator/${campaignId}?contentSaved=workspace&standard=${standardSaved ? '1' : '0'}`);
}

/** บันทึกรูป+Caption แล้วอนุมัติสื่อไปหน้าสรุป โดยยังไม่สร้างคิว Facebook. */
export async function saveAndApproveContentWorkspaceAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  try {
    const reviewer = session.user?.email ?? session.user?.name ?? null;
    const { campaignId, contentId } = await saveContentWorkspace(formData, reviewer);
    await approveContentForSummary({ campaignId, contentId, reviewer, feedbackCode: 'ready' });
    revalidatePath(`/orchestrator/${campaignId}`);
    revalidatePath('/orchestrator');
  } catch (error) {
    const campaignId = String(formData.get('campaignId') ?? '').trim();
    const message = error instanceof Error ? error.message : 'อนุมัติสื่อไม่สำเร็จ กรุณาตรวจข้อมูลอีกครั้ง';
    redirect(`/orchestrator/${campaignId}?contentError=${encodeURIComponent(message)}`);
  }
}

/** ล้างแบบมาตรฐานการจัดวาง งานใหม่จะกลับไปใช้ต้นฉบับ SO PEOPLE */
export async function resetPosterStandardAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  await clearPosterLayoutStandard();
  if (campaignId) {
    revalidatePath(`/orchestrator/${campaignId}`);
    redirect(`/orchestrator/${campaignId}?contentSaved=standard-reset`);
  }
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
  const username = String(formData.get('username') ?? '').trim();
  // บัญชี Facebook ไม่มีช่องชื่อเรียกแล้ว — ใช้อีเมล/เบอร์ที่ล็อกอินเป็นชื่อแทน (แก้ทีหลังได้ในปุ่มแก้ไข)
  const label = String(formData.get('label') ?? '').trim() || (platform === 'facebook' ? username : '');
  const password = String(formData.get('password') ?? '');
  const requestedScrapeLimit = Number.parseInt(String(formData.get('scrapeLimit') ?? '15'), 10);
  const requestedDailyCap = Number.parseInt(String(formData.get('dailyCap') ?? (platform === 'facebook' ? '15' : '200')), 10);

  if (!platform || !label || !username || !password) throw new Error('กรุณากรอกข้อมูล connector ให้ครบ');
  if (!['jobbkk', 'jobthai', 'facebook'].includes(platform)) throw new Error('แพลตฟอร์มไม่ถูกต้อง');
  const department = readBusinessUnit(formData.get('department'));
  if (!department) throw new Error('เลือกธุรกิจของบัญชีนี้ (LBD / LBA / LM)');

  if (platform === 'facebook') {
    const dailyCap = Number.isFinite(requestedDailyCap) ? Math.min(50, Math.max(1, requestedDailyCap)) : 15;
    await insertFacebookConnector({
      label,
      username,
      // เก็บแบบ enc:v1 เหมือนบัญชีเดิม worker ถอดเองก่อนกรอก
      password: encryptFacebookPassword(password),
      posterName: String(formData.get('posterName') ?? '').trim(),
      contactPhone: String(formData.get('contactPhone') ?? '').trim(),
      dailyCap,
      preferredWorker: String(formData.get('preferredWorker') ?? '').trim(),
      skipWarmup: formData.has('skipWarmup'),
      groupIds: formData.getAll('groupIds').map((v) => String(v)).filter(Boolean),
      department,
    });
    revalidatePath('/settings');
    revalidatePath('/settings/connectors');
    revalidatePath('/settings/posting');
    revalidatePath('/autopost/accounts');
    return;
  }

  const dailyCap = Number.isFinite(requestedDailyCap) ? Math.min(2000, Math.max(1, requestedDailyCap)) : 200;
  const scrapeLimit = Number.isFinite(requestedScrapeLimit) ? Math.min(100, Math.max(1, requestedScrapeLimit)) : 15;

  await insertConnector({
    department,
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
    await updateFacebookAccount(id, {
      label,
      username,
      password: password ? encryptFacebookPassword(password) : null,
      skipWarmup: formData.has('skipWarmup'),
      department: readBusinessUnit(formData.get('department')),
    });
    // กลุ่มที่บัญชีโพสต์แก้จากฟอร์มเดียวกัน — ไม่ติ๊กเลย = ไม่มีกลุ่ม
    await setAccountGroups(id, formData.getAll('groupIds').map((v) => String(v)).filter(Boolean));
    revalidatePath('/settings/posting');
  } else {
    await updateScraperConnector(id, {
      label,
      username,
      passwordEnc: password ? encryptSecret(password) : null,
      department: readBusinessUnit(formData.get('department')),
    });
  }
  revalidatePath('/settings');
  revalidatePath('/settings/connectors');
}

/** ลบบัญชี Facebook. */
export async function deleteFacebookAccountAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '').trim();
  if (id) await deleteFacebookAccount(id);
  revalidatePath('/settings');
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
  // เพดานต่อบัญชี — 1..เพดานระบบ (8) ตั้งเกินไม่ได้ (Facebook จำกัดบัญชีวันละ 7–16 ครั้ง 2–6 พ.ย. 2569)
  if (Number.isFinite(cap) && cap >= 1 && cap <= dailyCapCeiling()) await setFacebookDailyCapForAll(cap);
  revalidatePath('/connectors');
  revalidatePath('/settings');
  revalidatePath('/settings/connectors');
}

/** ยืนยันตัวตนบัญชี Facebook ที่เครื่องแล้ว — ให้ระบบกลับมาเก็บคอมเมนต์บัญชีนี้ */
export async function clearAccountVerificationAction(formData: FormData) {
  await requireSession();
  const userId = String(formData.get('userId') ?? '').trim();
  if (userId) await clearAccountVerification(userId);
  revalidatePath('/autopost/jobs');
}
