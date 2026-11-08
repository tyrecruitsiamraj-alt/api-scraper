/**
 * เครื่อง worker ที่มี DATABASE_URL เรียกฟังก์ชันฐานข้อมูลตรง แทน POST ไปเว็บ so-autopost
 *
 * เหตุ (8 พ.ย. 2569): worker:post และ worker:collect บน RM009 ขอรับงานทุก 5 วินาทีตลอด 24 ชม.
 * (~35,000 ครั้ง/วัน แม้ไม่มีงาน) ทุกครั้ง Vercel รันฟังก์ชันที่ถามฐาน — so-autopost กินเวลาประมวลผล
 * 362 จาก 473 GB-ชม. ใน 30 วัน จนทีม tyteam ถูกปิดทั้งทีม 6 พ.ย. 10:49 (Hobby fair use: fluidCpuDuration)
 * ทุกเว็บดับรวม Jarvis
 *
 * กติกาเหมือน route ใน server/index.js ทุกข้อ (เรียกฟังก์ชัน db ตัวเดียวกัน) ต่างแค่ไม่ผ่าน HTTP
 * ผลพลอยได้: Vercel ดับ เครื่องก็ยังโพสต์งานในคิวได้
 * บังคับกลับไปใช้ HTTP ได้ด้วย WORKER_USE_HTTP_API=1
 */

function shouldUseLocalWorkerApi(env = process.env) {
  return Boolean(String(env.DATABASE_URL || '').trim()) && String(env.WORKER_USE_HTTP_API || '').trim() !== '1';
}

const clampMinutes = (value, fallback) => Math.min(24 * 60, Math.max(15, Number(value) || fallback));
const cleanList = (value, limit) => (Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit) : undefined);

/**
 * @param {{ db: any, workerId: string, workerName?: string, env?: NodeJS.ProcessEnv, sendAlert?: (text: string) => Promise<unknown> }} deps
 * @returns {(pathname: string, body?: Record<string, any>) => Promise<any>}
 */
function createLocalWorkerApi({ db, workerId, workerName = null, env = process.env, sendAlert = null }) {
  const idOf = (body) => String(body?.worker_id || workerId || '').trim() || 'worker';
  const nameOf = (body) => String(body?.worker_name || workerName || '').trim() || null;

  const handlers = {
    // = POST /api/worker/post/claim
    async '/api/worker/post/claim'(body) {
      const wid = idOf(body);
      const wname = nameOf(body);
      const capabilities = cleanList(body?.capabilities, 50) || [];
      const buildSha = String(body?.build_sha || '').trim();
      const fbSessions = cleanList(body?.fb_sessions, 200);
      await db.touchWorkerHeartbeat(wname || wid, {
        worker_id: wid,
        build_sha: buildSha,
        source_sha: String(body?.source_sha || '').trim(),
        capabilities,
        ...(fbSessions ? { fb_sessions: fbSessions } : {}),
      });
      const requiredBuildSha = String(env.REQUIRED_WORKER_BUILD_SHA || '').trim();
      if (requiredBuildSha && buildSha !== requiredBuildSha) {
        return { ok: true, job: null, upgrade_required: true, required_build_sha: requiredBuildSha };
      }
      const job = await db.claimNextPostRunJob(wid, db.generateRunId(), wname, capabilities, buildSha);
      return { ok: true, job: job || null };
    },

    // = POST /api/worker/post/complete
    async '/api/worker/post/complete'(body) {
      const id = String(body?.job_id || '').trim();
      if (!id) throw new Error('job_id required');
      const row = await db.completePostRunJob(id, {
        ok: !!body?.ok,
        run_id: body?.run_id || null,
        message: body?.message || null,
        error: body?.error || null,
      });
      if (!row) throw new Error('job not found');
      if (row.status === 'failed' && sendAlert) {
        sendAlert(`❌ โพสต์ Facebook ไม่สำเร็จ (คิว ${row.id})\nบัญชี: ${row.user_id || '-'}\nสาเหตุ: ${row.error || '-'}`).catch(() => {});
      }
      return { ok: true, job: row };
    },

    // = POST /api/worker/post/heartbeat
    async '/api/worker/post/heartbeat'(body) {
      const wid = idOf(body);
      const fbSessions = cleanList(body?.fb_sessions, 200);
      await db.touchWorkerHeartbeat(nameOf(body) || wid, {
        worker_id: wid,
        build_sha: String(body?.build_sha || '').trim(),
        source_sha: String(body?.source_sha || '').trim(),
        capabilities: cleanList(body?.capabilities, 50) || [],
        active_jobs: Number(body?.active_jobs) || 0,
        concurrency: Number(body?.concurrency) || 0,
        ...(fbSessions ? { fb_sessions: fbSessions } : {}),
      });
      return { ok: true };
    },

    // = POST /api/worker/post/sweep-stale
    async '/api/worker/post/sweep-stale'(body) {
      const maxAge = clampMinutes(body?.max_age_minutes || env.POST_RUN_STALE_MINUTES, 180);
      const n = await db.failStaleRunningPostJobs(maxAge);
      return { ok: true, failed_stale_count: n, max_age_minutes: maxAge };
    },

    // = POST /api/worker/post/enqueue-daily
    async '/api/worker/post/enqueue-daily'() {
      const out = await db.enqueueDailyPostRunJobs();
      return {
        ok: true,
        created: out.created.map((r) => ({ id: r.id, user_id: r.user_id })),
        skipped: out.skipped,
      };
    },

    // = POST /api/worker/release-orphans
    async '/api/worker/release-orphans'(body) {
      const kind = String(body?.kind || '') === 'collect' ? 'collect' : 'post';
      const ids = await db.releaseOrphanedJobs(kind, body?.worker_id);
      return { ok: true, released: ids };
    },

    // = POST /api/worker/collect/claim
    async '/api/worker/collect/claim'(body) {
      const wid = idOf(body);
      const runId = `collect_${db.generateRunId()}`;
      const job = await db.claimNextCollectRunJob(wid, runId);
      if (!job) return { ok: true, job: null };
      const userId = String(job.user_id || '').trim();
      const postLogIds = Array.isArray(job.post_log_ids) ? job.post_log_ids.map(String).filter(Boolean) : [];
      const rows = await db.getPostLogsByIdsForUser(postLogIds, userId);
      const posts = rows
        .filter((r) => (r.post_link && String(r.post_link).trim()) || (r.group_id && String(r.group_id).trim()))
        .map((r) => ({
          post_log_id: String(r.id),
          post_link: String(r.post_link || '').trim(),
          group_id: String(r.group_id || '').trim(),
          job_id: String(r.job_id || ''),
          job_title: String(r.job_title || ''),
          owner: String(r.owner || ''),
          company: String(r.company || ''),
          poster_name: String(r.poster_name || ''),
          group_name: String(r.group_name || ''),
          posted_date_bangkok: r.created_at
            ? new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
            : '',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
        }));
      const missing = posts.filter((p) => !p.post_link);
      if (missing.length) {
        const hints = await db
          .getFindLinkHints(missing.map((p) => p.group_id), missing.map((p) => p.job_id))
          .catch(() => ({ captions: {}, knownLinks: {} }));
        for (const p of missing) {
          p.caption = hints.captions[p.job_id] || '';
          p.known_links = hints.knownLinks[p.group_id] || [];
        }
      }
      if (posts.length === 0) {
        await db.completeCollectRunJob(job.id, {
          ok: false,
          run_id: runId,
          message: 'collect job has no valid post links',
          error: 'no_post_links',
        });
        return { ok: true, job: null };
      }
      return { ok: true, job: { id: job.id, run_id: runId, user_id: userId, post_log_ids: postLogIds, posts } };
    },

    // = POST /api/worker/collect/complete
    async '/api/worker/collect/complete'(body) {
      const id = String(body?.job_id || '').trim();
      if (!id) throw new Error('job_id required');
      const row = await db.completeCollectRunJob(id, {
        ok: !!body?.ok,
        run_id: body?.run_id || null,
        message: body?.message || null,
        error: body?.error || null,
      });
      if (!row) throw new Error('job not found');
      return { ok: true, job: row };
    },

    // = POST /api/worker/collect/sweep-stale
    async '/api/worker/collect/sweep-stale'(body) {
      const maxAge = clampMinutes(body?.max_age_minutes || env.COLLECT_RUN_STALE_MINUTES, 180);
      const n = await db.failStaleRunningCollectJobs(maxAge);
      return { ok: true, failed_stale_count: n, max_age_minutes: maxAge };
    },

    // = POST /api/worker/collect/enqueue-recent
    async '/api/worker/collect/enqueue-recent'(body) {
      const startDate = String(body?.start_date || '').trim();
      const endDate = String(body?.end_date || startDate).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error('start_date / end_date ต้องเป็น YYYY-MM-DD');
      }
      const out = await db.enqueueRecentCollectJobs({ start_date: startDate, end_date: endDate });
      return { ok: true, ...out };
    },
  };

  return async function callLocal(pathname, body = {}) {
    const handler = handlers[pathname];
    if (!handler) throw new Error(`โหมดต่อฐานตรงไม่รู้จักคำสั่ง ${pathname}`);
    return handler(body || {});
  };
}

const LOCAL_WORKER_PATHS = [
  '/api/worker/post/claim', '/api/worker/post/complete', '/api/worker/post/heartbeat', '/api/worker/post/sweep-stale',
  '/api/worker/post/enqueue-daily', '/api/worker/release-orphans', '/api/worker/collect/claim',
  '/api/worker/collect/complete', '/api/worker/collect/sweep-stale', '/api/worker/collect/enqueue-recent',
];

module.exports = { shouldUseLocalWorkerApi, createLocalWorkerApi, LOCAL_WORKER_PATHS };
