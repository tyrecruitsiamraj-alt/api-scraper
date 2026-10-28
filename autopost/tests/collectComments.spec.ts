/**
 * เก็บเบอร์จาก Comment — มี session แล้วรัน headless; ยังไม่มี session เปิด Chrome (headed)
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import {
  loadDynamicConfig,
  facebookLogin,
  buildExcludedPhoneSet,
  filterPhonesForCollect,
  normalizeThaiPhoneDigits,
  runLog,
  safePageWait,
  scrapeCommentsAndPhones,
  replyToComment,
  findMyPostLink,
} from '../src/helpers';

/* eslint-disable @typescript-eslint/no-var-requires */
// ผู้สนใจจากคอมเมนต์: เขียนลง DB ตรง (worker มี DATABASE_URL) — ดู server/comment-leads.js
const commentLeads = require('../server/comment-leads');
const leadsDb = process.env.DATABASE_URL ? require('../server/db') : null;
/** ตอบคอมเมนต์ต่อรอบเก็บ (ทุกโพสต์รวมกัน) — ตอบเยอะเกิน Facebook มองว่าเป็นสแปม; 0 = ไม่ตอบ */
const AUTO_REPLY_MAX_PER_RUN = Math.max(0, Math.min(50, Number(process.env.AUTO_REPLY_MAX_PER_RUN ?? 10)));

type CollectPlan = {
  user_id: string;
  posts: Array<{
    post_log_id: string;
    /** ว่าง = ตอนโพสต์หาลิงก์ไม่เจอ ให้หาใหม่จาก group_id */
    post_link: string;
    group_id?: string;
    /** ข้อความประกาศของงาน (ส่งมาเฉพาะโพสต์ที่ยังไม่มีลิงก์) */
    caption?: string;
    /** ลิงก์ที่แถวอื่นใช้แล้วในกลุ่มนี้ ห้ามหยิบซ้ำ */
    known_links?: string[];
    job_id?: string;
    job_title?: string;
    owner?: string;
    company?: string;
    poster_name?: string;
    group_name?: string;
    posted_date_bangkok?: string;
    created_at?: string;
  }>;
};

function readPlan(): CollectPlan {
  const p = process.env.COLLECT_PLAN_PATH || '';
  if (!p || !fs.existsSync(p)) {
    throw new Error(`COLLECT_PLAN_PATH missing or file not found: ${p}`);
  }
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as CollectPlan;
}

async function patchFoundLink(postLogId: string, body: { post_link: string; post_status: string }): Promise<void> {
  const base = (process.env.RUN_LOG_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.COLLECT_PATCH_TOKEN) headers['x-collect-token'] = process.env.COLLECT_PATCH_TOKEN;
  if (process.env.COLLECT_WORKER_TOKEN) headers['x-worker-token'] = process.env.COLLECT_WORKER_TOKEN;
  const res = await fetch(`${base}/api/post-logs/${encodeURIComponent(postLogId)}/found-link`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`found-link ${res.status}: ${await res.text()}`);
}

async function patchCollectResult(
  postLogId: string,
  body: { comment_count: number; customer_phone: string; reactions?: number; shares?: number }
): Promise<void> {
  const base = (process.env.RUN_LOG_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const token = process.env.COLLECT_PATCH_TOKEN || '';
  const workerToken = process.env.COLLECT_WORKER_TOKEN || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-collect-token'] = token;
  if (workerToken) headers['x-worker-token'] = workerToken;
  const res = await fetch(`${base}/api/post-logs/${encodeURIComponent(postLogId)}/collect-result`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`collect-result ${res.status}: ${t}`);
  }
}

test('collectComments', async ({ page }) => {
  test.setTimeout(90 * 60 * 1000);
  const plan = readPlan();
  if (process.env.COLLECT_USE_HEADED === '1') {
    await runLog({
      level: 'info',
      message:
        'โหมดเปิด Chrome — ยังไม่มีไฟล์ session ใน .auth ให้ล็อกอิน/ยืนยันตัวตนในหน้าต่างนี้',
      user_id: plan.user_id,
    });
  } else {
    await runLog({
      level: 'info',
      message: 'โหมดไม่โชว์หน้าต่าง (พบ session ใน .auth แล้ว)',
      user_id: plan.user_id,
    });
  }
  const config = await loadDynamicConfig();
  const user = config.users.find((u) => String(u.id) === String(plan.user_id));
  if (!user) {
    await runLog({ level: 'error', message: `ไม่พบ user ${plan.user_id} ใน config`, user_id: plan.user_id });
    throw new Error(`User not found: ${plan.user_id}`);
  }
  if (!user.email || !user.password) {
    await runLog({
      level: 'error',
      message: `User ${user.id} ไม่มี email/password (DB หรือ USER_*_EMAIL/PASSWORD)`,
      user_id: user.id,
    });
    throw new Error('Missing Facebook credentials for user');
  }

  await runLog({
    level: 'info',
    message: `เริ่มเก็บ Comment (Headless) ${plan.posts.length} โพสต์ — ${user.poster_name || user.name || user.id}`,
    user_id: user.id,
  });

  let active = await facebookLogin(page, user.email, user.password, {
    userLabel: user.name || user.id,
    sessionKey: String(user.env_key || user.id || user.email || 'default'),
  });
  const excludedPhones = buildExcludedPhoneSet((user as { contact_phone?: string }).contact_phone);
  if (leadsDb) await commentLeads.ensureCommentLeadsTable(leadsDb).catch(() => {});
  let repliesLeft = AUTO_REPLY_MAX_PER_RUN;
  const leadTotals = { saved: 0, replied: 0, needsHuman: 0 };
  const pendingByPost = new Map<
    string,
    { commentCount: number; phones: string[]; reactions: number; shares: number; item: CollectPlan['posts'][number] }
  >();
  const CUSTOMER_PHONE_MAX_LEN = Math.min(2000, Math.max(100, Number(process.env.COLLECT_CUSTOMER_PHONE_MAX_LEN) || 2000));

  let idx = 0;
  for (const item of plan.posts) {
    idx += 1;
    const label = item.job_title || item.post_log_id;
    await runLog({
      level: 'info',
      message: `[${idx}/${plan.posts.length}] กำลังเปิดโพสต์: ${label}`,
      user_id: user.id,
      meta: { post_log_id: item.post_log_id, post_link: item.post_link },
    });
    try {
      if (active.isClosed()) {
        active = await active.context().newPage();
        active = await facebookLogin(active, user.email, user.password, {
          userLabel: user.name || user.id,
          sessionKey: String(user.env_key || user.id || user.email || 'default'),
        });
      }
      if (!item.post_link) {
        if (!item.group_id) continue;
        const knownLinks = [
          ...(item.known_links || []),
          ...plan.posts.filter((p) => p.post_link && p.group_id === item.group_id).map((p) => p.post_link),
        ];
        const diag: Record<string, unknown> = {};
        const found = await findMyPostLink(active, item.group_id, { jobTitle: item.job_title, caption: item.caption, knownLinks, diag });
        if (!found) {
          await runLog({
            level: 'info',
            message: `[${idx}/${plan.posts.length}] ยังหาลิงก์โพสต์ในกลุ่ม ${item.group_name || item.group_id} ไม่เจอ (อาจยังรออนุมัติหรือถูกลบ) ข้ามไปก่อน`,
            user_id: user.id,
            meta: { kind: 'link_diag', stage: 'collect', post_log_id: item.post_log_id, group_id: item.group_id, has_caption: Boolean(item.caption), ...diag },
          });
          continue;
        }
        await patchFoundLink(item.post_log_id, { post_link: found.link, post_status: found.status });
        await runLog({
          level: 'success',
          message: `[${idx}/${plan.posts.length}] เจอลิงก์โพสต์ที่ขาดแล้ว (${found.status}) ${found.link}`,
          user_id: user.id,
          meta: { post_log_id: item.post_log_id, group_id: item.group_id, post_link: found.link },
        });
        item.post_link = found.link;
        // โพสต์ยังรออนุมัติ คนอื่นยังไม่เห็น ไม่มีคอมเมนต์ให้เก็บ
        if (found.status !== 'อนุมัติเเล้ว') continue;
      }
      const ownerNames = [user.poster_name || '', user.name || '', item.owner || '', item.company || '', item.poster_name || '']
        .map((x) => String(x || '').trim())
        .filter(Boolean);
      const { phones, commentCount, postBodyPhones, reactions, shares, comments, diag } = await scrapeCommentsAndPhones(active, item.post_link, {
        excludeAuthorNames: ownerNames,
      });
      if (!comments.length || !reactions) {
        // จับคอมเมนต์รายคนหรือยอดไลก์ไม่ได้ — เก็บรูปแบบ aria-label (ปิดชื่อแล้ว) ไว้ไล่ว่า Facebook เปลี่ยน markup เป็นแบบไหน
        await runLog({
          level: 'info',
          message: `${comments.length ? 'อ่านยอดไลก์ไม่ได้' : 'อ่านคอมเมนต์รายคนไม่ได้'} (ยอดใต้โพสต์: ${diag.summary || '-'})`,
          user_id: plan.user_id,
          meta: { kind: 'collect_diag', post_log_id: item.post_log_id, ...diag },
        });
      }
      if (leadsDb && comments.length) {
        try {
          const info = (
            await leadsDb.query(
              `SELECT pl.group_id, pl.job_id, pl.user_id, j.caption, j.title
                 FROM post_logs pl LEFT JOIN jobs j ON j.id = pl.job_id WHERE pl.id = $1`,
              [item.post_log_id]
            )
          ).rows[0] || {};
          const rows = await commentLeads.saveComments(
            leadsDb,
            {
              post_log_id: item.post_log_id,
              post_link: item.post_link,
              job_id: info.job_id || item.job_id,
              group_id: info.group_id,
              user_id: info.user_id || user.id,
              caption: info.caption,
              position: String(info.title || item.job_title || '').split(' · ')[0],
            },
            comments
          );
          leadTotals.saved += comments.length;
          leadTotals.needsHuman += rows.filter((r: { needs_human: boolean; replied_at: unknown; reply_text: unknown }) => r.needs_human && !r.reply_text).length;
          // ตอบเฉพาะคอมเมนต์ที่ยังเห็นบนหน้านี้ (หา aria ของคอมเมนต์จาก key เดียวกัน)
          const ariaByKey = new Map(comments.map((c) => [commentLeads.commentKey(c, item.post_link), c.aria]));
          for (const row of commentLeads.pendingReplies(rows)) {
            if (repliesLeft <= 0) break;
            const aria = ariaByKey.get(row.comment_key);
            if (!aria) continue;
            repliesLeft -= 1;
            const err = await replyToComment(active, aria, row.reply_text);
            await commentLeads.markReplied(leadsDb, row.id, err);
            if (!err) leadTotals.replied += 1;
            await safePageWait(active, 15000 + Math.floor(Math.random() * 20000));
          }
        } catch (leadErr) {
          await runLog({
            level: 'warn',
            message: `[${idx}/${plan.posts.length}] บันทึก/ตอบคอมเมนต์ไม่สำเร็จ: ${String((leadErr as Error).message).slice(0, 160)}`,
            user_id: user.id,
          });
        }
      }
      const excludedForThisPost = new Set(excludedPhones);
      postBodyPhones
        .map((x) => normalizeThaiPhoneDigits(x))
        .filter((x): x is string => !!x)
        .forEach((x) => excludedForThisPost.add(x));
      // ตัดเบอร์จาก metadata งาน (owner/company/job title) กันเบอร์เจ้าของงานหลุดจากข้อความคอมเมนต์
      buildExcludedPhoneSet([item.owner, item.company, item.job_title].filter(Boolean).join(' '))
        .forEach((x) => excludedForThisPost.add(x));
      // ด่านแรก: ตัดเบอร์ต้องห้าม (เจ้าของงาน/โพสต์/caption)
      const kept = filterPhonesForCollect(phones, { excluded: excludedForThisPost, seenToday: new Set<string>() });
      pendingByPost.set(item.post_log_id, { commentCount, phones: kept, reactions, shares, item });
      await runLog({
        level: 'success',
        message: `[${idx}/${plan.posts.length}] สแกนเสร็จ — Comment ${commentCount}, พบเบอร์ผู้สนใจ ${kept.length} รายการ`,
        user_id: user.id,
        meta: { post_log_id: item.post_log_id, phones: kept.slice(0, 5) },
      });
    } catch (e) {
      const msg = (e as Error).message;
      await runLog({
        level: 'error',
        message: `[${idx}/${plan.posts.length}] ล้มเหลว: ${msg.slice(0, 200)}`,
        user_id: user.id,
        meta: { post_log_id: item.post_log_id },
      });
    }
    /** ถ้าแท็บถูกปิดระหว่างสแกน อย่าเรียก waitForTimeout — เดิมจะ throw แล้วหยุดทั้งคิว */
    if (active.isClosed()) {
      try {
        const ctx = page.context();
        active = await ctx.newPage();
        active = await facebookLogin(active, user.email, user.password, {
          userLabel: user.name || user.id,
          sessionKey: String(user.env_key || user.id || user.email || 'default'),
        });
        await runLog({
          level: 'warn',
          message: `[${idx}/${plan.posts.length}] แท็บปิดกลางทาง — เปิดแท็บใหม่และล็อกอินแล้ว (ทำโพสต์ถัดไปต่อ)`,
          user_id: user.id,
        });
      } catch (reopenErr) {
        await runLog({
          level: 'error',
          message: `Browser/context ใช้งานไม่ได้หลังแท็บปิด: ${String((reopenErr as Error).message).slice(0, 180)}`,
          user_id: user.id,
        });
        throw reopenErr;
      }
    }
    await safePageWait(active, 800);
  }

  for (const item of plan.posts) {
    if (!item.post_link) continue; // ยังหาลิงก์ไม่เจอ ไม่มีอะไรให้บันทึก
    const st = pendingByPost.get(item.post_log_id) || { commentCount: 0, phones: [], reactions: 0, shares: 0, item };
    const phonesFinal = st.phones || [];
    const phoneStr = phonesFinal.length ? phonesFinal.join(', ').slice(0, CUSTOMER_PHONE_MAX_LEN) : '';
    await patchCollectResult(item.post_log_id, {
      comment_count: st.commentCount,
      customer_phone: phoneStr,
      reactions: st.reactions,
      shares: st.shares,
    });
  }
  if (leadsDb) {
    await runLog({
      level: 'info',
      message: `คอมเมนต์รอบนี้ ${leadTotals.saved} รายการ · ตอบแล้ว ${leadTotals.replied} · รอคนตอบ ${leadTotals.needsHuman}`,
      user_id: user.id,
      meta: { kind: 'comment_leads', ...leadTotals },
    });
  }
  await runLog({
    level: 'info',
    message: 'จบรอบเก็บ Comment ทั้งหมด (เบอร์ต่อโพสต์ — ตัดเฉพาะเบอร์ใน caption/โพสต์และซ้ำในคอมเมนต์เดียวกัน)',
    user_id: user.id,
  });
});
