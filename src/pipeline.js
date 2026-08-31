import { resolveProvider } from './connectors/registry.js';
import { RateLimiter } from './core/anti-ban.js';
import { splitCriteria } from './core/candidate-match.js';
import { evaluateResumeQualification } from './core/resume-qualification.js';
import { envInt } from './config.js';
import {
  countScrapedToday,
  finishRun,
  getProviderCap,
  platformScrapedToday,
  saveAsset,
  saveConnectorSession,
  linkCandidateToTask,
  recordResumeSearchAttempt,
  setConnectorCooldown,
  startRun,
  touchRun,
  taskExternalIds,
  upsertCandidate,
  upsertSource,
  withTransaction,
} from './db/repositories.js';

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h after a soft-ban
const CANDIDATE_TIMEOUT_MS = envInt('CANDIDATE_TIMEOUT_MS', 180_000); // skip hung resume fetches
const LOGIN_TIMEOUT_MS = envInt('LOGIN_TIMEOUT_MS', 300_000); // browser login must finish within 5 min
// Provider search can hang while its browser/page is technically alive. A DB
// heartbeat alone must not keep such a run "running" forever. Bound each search
// round and close Chromium on timeout so the queue can retry or finish as an
// infrastructure error instead of showing fake activity.
const SEARCH_TIMEOUT_MS = envInt('SEARCH_TIMEOUT_MS', 180_000);

function timeoutMessage(label, ms) {
  if (label === 'login') {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return `เข้าสู่ระบบไม่สำเร็จภายใน ${minutes} นาที กรุณาตรวจสอบ CAPTCHA, บัญชีที่เปิดค้างในเครื่องอื่น หรือการเชื่อมต่อของ Worker [timeout:login:${ms}ms]`;
  }
  return `timeout:${label}:${ms}ms`;
}

export function withTimeout(promise, ms, label, { onTimeout } = {}) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        // Promise.race only rejects the caller; it does not cancel the work that
        // is still running. Give session providers a chance to close Chromium.
        try {
          onTimeout?.();
        } catch {
          // Cleanup is best-effort and must not hide the original timeout.
        }
        const error = new Error(timeoutMessage(label, ms));
        error.code = label === 'login' ? 'LOGIN_TIMEOUT' : 'OPERATION_TIMEOUT';
        reject(error);
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function isSessionError(e) {
  if (e?.needsRelogin || e?.code === 'LOGIN_TIMEOUT') return true;
  const m = String(e?.message ?? '');
  return /session_expired|session_redirect|Max redirect|jobpost|not_authenticated|logged-out|timeout:login/i.test(m);
}

/**
 * Run one scrape for a connector and persist everything to Postgres.
 * Honors per-round limit, daily cap, rate limiting, and soft-ban cooldown.
 */
export async function runConnector(connector, criteria, runtime, opts = {}) {
  const runStartedAt = Date.now();
  const provider = resolveProvider(connector.platform);
  const limiter = new RateLimiter({ minMs: runtime.delayMin, maxMs: runtime.delayMax });
  const runId = await startRun(connector.id, connector.platform, criteria, opts.taskId ?? null);
  // A provider can spend minutes in login or loading a browser page.  Persist a
  // small, independent heartbeat so recovery can distinguish a live slow run
  // from an abandoned process.  It also keeps the task's UI timestamp fresh.
  const beat = async () => {
    await touchRun(runId);
    await opts.onHeartbeat?.();
  };
  await beat();
  const heartbeatTimer = setInterval(() => {
    void beat().catch((e) => console.warn(`  [${connector.label}] run heartbeat failed: ${e.message}`));
  }, 15_000);
  heartbeatTimer.unref?.();

  let newCount = 0;
  let updatedCount = 0;
  let failed = 0;
  let found = 0;
  let filteredOut = 0; // ไม่ตรงเงื่อนไข local (อายุ/วุฒิ/จังหวัด/เพศ) — ข้ามโดยไม่นับเข้า target
  let opened = 0;
  let qualified = 0;
  let needsReview = 0;
  let rejected = 0;
  let duplicate = 0;
  const reasonCounts = {};
  let status = 'success';
  let error = null;
  let browser = null;
  let activeContext = null; // tracked so the finally can log out to free the session

  // "ค้นกว้าง กรองแม่น": ส่งแค่ตำแหน่ง/คำค้นไปเว็บ (กัน AND ซ้อนแล้วเหลือ 0)
  // แล้วกรอง อายุ/วุฒิ/จังหวัด/เพศ จากเรซูเม่ที่ parse ได้ในระบบเราแทน
  const { siteCriteria, localFilters, active: localFilterActive } = splitCriteria(criteria);
  if (localFilterActive) {
    console.log(`  [${connector.label}] กรองในระบบ: ${Object.entries(localFilters).map(([k, v]) => `${k}=${v}`).join(' ')} (เว็บค้นด้วยตำแหน่ง/คำค้นอย่างเดียว)`);
  }

  // per-round limit ∩ connector daily cap ∩ PROVIDER daily cap (strict)
  const today = await countScrapedToday(connector.id);
  const connectorRemaining = Math.max(0, connector.daily_cap - today);
  const providerCap = await getProviderCap(connector.platform);
  let providerRemaining = Infinity;
  if (providerCap != null) {
    const platformToday = await platformScrapedToday(connector.platform);
    providerRemaining = Math.max(0, providerCap - platformToday);
  }
  // Honor an explicitly requested count (count-mode tasks set criteria.maxCandidates);
  // fall back to the connector's per-round scrape_limit when none is given.
  // The daily caps below still bound the result strictly (anti-ban).
  const requested = criteria.maxCandidates ?? connector.scrape_limit;
  const target = Math.min(requested, connectorRemaining, providerRemaining);
  if (opts.onTarget) await opts.onTarget(target);

  try {
    if (target <= 0) {
      status = 'cooldown';
      error =
        providerRemaining <= 0 && providerCap != null
          ? `provider daily cap reached for ${connector.platform} (cap ${providerCap})`
          : `connector daily cap reached (${today}/${connector.daily_cap})`;
      console.warn(`  [${connector.label}] ${error}`);
      return finalize();
    }

    const openSession = async (forceLogin = false) => {
      if (opts.onPhase) await opts.onPhase('login');
      if (opts.onHeartbeat) await opts.onHeartbeat();
      console.log(`  [${connector.label}] opening browser session${forceLogin ? ' (fresh login)' : ''}...`);
      const loginController = new AbortController();
      return withTimeout(
        provider.getSession({
          // Some providers (JobBKK) only work in a visible browser — headless login is
          // bot-blocked and detail pages render masked. Force headful for those.
          headless: provider.headful ? false : runtime.headless,
          debug: runtime.debug,
          username: connector.username,
          password: connector.password(),
          storageState: connector.session_state ?? undefined,
          forceLogin,
          onHeartbeat: opts.onHeartbeat,
          signal: loginController.signal,
        }),
        LOGIN_TIMEOUT_MS,
        'login',
        { onTimeout: () => loginController.abort() },
      );
    };

    let sess = await openSession(false);
    browser = sess.browser;
    activeContext = sess.context;
    await saveConnectorSession(connector.id, await sess.dumpState());

    // ขอผลค้นให้เลยคนที่ task นี้เคยเก็บแล้ว เพื่อให้ retry วิ่งต่อไปหาคนใหม่
    // โดยไม่เปิด Resume เดิมซ้ำและไม่กิน daily cap โดยเปล่าประโยชน์.
    const priorExternalIds = new Set(
      opts.taskId ? await taskExternalIds(opts.taskId, connector.platform).catch(() => []) : [],
    );
    const baseIdTarget = target + priorExternalIds.size;
    const idTarget = localFilterActive ? Math.min(baseIdTarget * 3, baseIdTarget + 300) : baseIdTarget;
    const runSearch = () => withTimeout(
      provider.searchResumeIds(sess, { ...siteCriteria, maxCandidates: idTarget }, runtime),
      SEARCH_TIMEOUT_MS,
      'search',
      { onTimeout: () => void browser?.close().catch(() => {}) },
    );
    let search;
    try {
      search = await runSearch();
    } catch (e) {
      // Stale/hijacked session (login page, "logged in elsewhere" dialog, or a
      // non-results page): force a fresh browser login that takes over the
      // session, then retry the search ONCE so the run actually succeeds.
      if (!e.needsRelogin) throw e;
      console.warn(`  [${connector.label}] ${e.message} → forcing fresh login + retry`);
      await browser.close().catch(() => {});
      sess = await openSession(true);
      browser = sess.browser;
      activeContext = sess.context;
      await saveConnectorSession(connector.id, await sess.dumpState());
      search = await runSearch();
    }
    found = search.ids.length;
    // Provider ต้องผ่าน newest-first gate ก่อนคืน ids (official sort หรือหลักฐานวันที่บน card).
    // เก็บอันดับที่ผ่านการยืนยันไว้ก่อนตัดรายการซ้ำ เพื่อไม่เรียงกลับด้านตามเวลาเขียน DB.
    const sourceRankById = new Map(search.ids.map((id, index) => [String(id), index + 1]));
    // A retry may need to page past many Resume IDs already linked to this
    // task. Do not then open hundreds of profiles in one round: remove known
    // IDs before the detail loop and cap fresh profiles to a bounded sample.
    // This keeps a strict filter from looking stuck while still allowing the
    // adjacent-position loop to continue searching when the sample is too
    // small.
    const freshLimit = Math.max(target * 3, target);
    const freshIds = search.ids
      .filter((id) => !priorExternalIds.has(String(id)))
      .slice(0, freshLimit);
    if (freshIds.length < search.ids.length) {
      console.log(`  [${connector.label}] ตรวจรอบนี้ ${freshIds.length} รายการใหม่ (ตัดรายการเดิม/เกินขอบเขตออก ${search.ids.length - freshIds.length})`);
    }
    search = { ...search, ids: freshIds };

    // Login + search done — now scraping candidates. Flip the phase to 'scraping'
    // and re-assert the target (setTaskPhase resets progress_target to 0) so the
    // status bar narrates "ดึงข้อมูล N/target" instead of staying on "กำลัง login".
    if (opts.onPhase) await opts.onPhase('scraping');
    if (opts.onTarget) await opts.onTarget(target);

    const resumeFrom = Math.max(0, opts.resumeFrom ?? 0);
    if (resumeFrom > 0) {
      console.log(`  [${connector.label}] resuming from #${resumeFrom + 1} (skip ${resumeFrom} ids already scraped)`);
    }

    let saved = resumeFrom;
    if (saved > 0 && opts.onProgress) await opts.onProgress(saved, target);
    let sessionRelogins = 0;
    const MAX_SESSION_RELOGINS = 8;

    async function refreshSession(reason) {
      if (sessionRelogins >= MAX_SESSION_RELOGINS) throw new Error(`session_relogin_exhausted: ${reason}`);
      sessionRelogins += 1;
      console.warn(`  [${connector.label}] ${reason} → fresh login (${sessionRelogins}/${MAX_SESSION_RELOGINS})`);
      await browser.close().catch(() => {});
      if (opts.onPhase) await opts.onPhase('login');
      if (opts.onHeartbeat) await opts.onHeartbeat();
      sess = await openSession(true);
      browser = sess.browser;
      activeContext = sess.context;
      await saveConnectorSession(connector.id, await sess.dumpState());
      if (opts.onPhase) await opts.onPhase('scraping');
      if (opts.onTarget) await opts.onTarget(target);
      if (opts.onProgress) await opts.onProgress(saved, target); // restore counter after phase reset
    }

    for (let i = resumeFrom; i < search.ids.length; i += 1) {
      const id = search.ids[i];
      // Keep opening candidates until the qualified, unique target is reached or
      // this search result set is exhausted. Rejected/needs-review resumes must
      // not consume the requested delivery count.
      if (saved >= target) break;
      if (priorExternalIds.has(String(id))) {
        duplicate += 1;
        reasonCounts.duplicate = (reasonCounts.duplicate || 0) + 1;
        continue;
      }
      await limiter.wait();
      if (opts.onHeartbeat) await opts.onHeartbeat();
      try {
        await withTimeout((async () => {
        const url = provider.resumeDetailUrl(id);
        // Pass the whole session — providers pick what they need: JobBKK renders
        // the detail page in the browser context (data is client-side JS), while
        // JobThai reads it over HTTP via the request context.
        let html = await provider.fetchResumeHtml(sess, id, runtime);
        let parsed = provider.parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });
        const authBlocked = provider.isResumeAuthBlocked?.(html, url) ?? false;
        if (authBlocked) {
          await refreshSession(`resume ${id}: session expired (login page)`);
          html = await provider.fetchResumeHtml(sess, id, runtime);
          parsed = provider.parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });
        }
        opened += 1;
        const qualification = evaluateResumeQualification(parsed, {
          criteria: { ...criteria, ...localFilters },
          sourcingSpec: opts.qualificationSpec || {},
        });
        for (const reason of qualification.reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

        // เปิดเผยข้อมูลติดต่อ/ดาวน์โหลดเอกสารเฉพาะคนที่ผ่าน Hard Filter เท่านั้น.
        if (qualification.status === 'qualified' && provider.enrichContacts) {
          await provider.enrichContacts(sess.request, id, parsed, runtime);
        }
        // รูปโปรไฟล์เป็นข้อมูลหลักที่ผู้สรรหาต้องเห็น แม้ Resume จะยังไม่ผ่าน
        // เกณฑ์งานนี้ ส่วนเอกสารแนบยังเก็บเฉพาะคนที่ผ่านเพื่อลดการเก็บข้อมูล
        // ส่วนบุคคลเกินจำเป็นและไม่เสียเวลาโหลดไฟล์ใหญ่ของคนที่ถูกคัดออก
        const assets = provider.collectAssetsForDb
          ? await provider.collectAssetsForDb(sess.request, parsed, {
            profileOnly: qualification.status !== 'qualified',
          })
          : [];

        const { isNew, taskLink } = await withTransaction(async (client) => {
          const cand = await upsertCandidate(client, parsed);
          const sourceId = await upsertSource(client, cand.id, {
            platform: connector.platform,
            connectorId: connector.id,
            externalId: provider.externalId(url),
            sourceUrl: url,
            runId,
            parseStatus: parsed.parse_status,
            rawText: parsed.raw_text,
            searchRank: sourceRankById.get(String(id)) ?? i + 1,
          });
          const taskLink = await linkCandidateToTask(client, {
            taskId: opts.taskId ?? null,
            candidateId: cand.id,
            sourceId,
            matchedPosition: criteria.position || criteria.keyword || null,
            qualification,
          });
          for (const a of assets) {
            if (a.sha256) await saveAsset(client, cand.id, sourceId, a);
          }
          return { ...cand, taskLink };
        });

        if (isNew) newCount += 1;
        else updatedCount += 1;
        if (qualification.status === 'qualified') qualified += 1;
        else if (qualification.status === 'needs_review') { needsReview += 1; filteredOut += 1; }
        else { rejected += 1; filteredOut += 1; }
        if (!taskLink.isNewForTask) {
          duplicate += 1;
          reasonCounts.duplicate = (reasonCounts.duplicate || 0) + 1;
        }
        // Progress and completion count only candidates newly qualified for this task.
        if (taskLink.becameQualified || !opts.taskId) saved += qualification.status === 'qualified' ? 1 : 0;
        if (opts.onProgress) await opts.onProgress(saved, target);
        const att = assets.filter((a) => a.kind === 'attachment' && a.download_status === 'success').length;
        console.log(`  [${saved}/${target}] ${parsed.name || '(no name)'} ${qualification.status} ${taskLink.isNewForTask ? (isNew ? 'NEW' : 'matched') : 'duplicate'} | ☎ ${parsed.phone || '-'} 📎 ${att}`);
        })(), CANDIDATE_TIMEOUT_MS, `resume_${id}`);
      } catch (e) {
        if (e.fatal) {
          status = 'cooldown';
          error = e.message;
          await setConnectorCooldown(connector.id, new Date(Date.now() + COOLDOWN_MS).toISOString());
          console.error(`  ⛔ soft-ban detected (${e.message}) — cooldown ${COOLDOWN_MS / 3600000}h`);
          break;
        }
        if (isSessionError(e) && sessionRelogins < MAX_SESSION_RELOGINS) {
          try {
            await refreshSession(e.message);
            i -= 1;
            continue;
          } catch (re) {
            failed += 1;
            console.error(`  id ${id}: relogin failed — ${re.message}`);
            continue;
          }
        }
        failed += 1;
        console.error(`  id ${id}: ${e.message}`);
      }
    }

    if (status === 'success' && saved < target) status = 'partial';
    if (localFilterActive) {
      console.log(`  [${connector.label}] สรุปกรอง: ผ่าน ${qualified} · ตรวจเพิ่ม ${needsReview} · ไม่ผ่าน ${rejected} · ซ้ำ ${duplicate}`);
      // บันทึกไว้ใน error field (ว่างอยู่) เมื่อได้ 0 — ให้หน้าเว็บอธิบายเหตุถูก
      if (saved - resumeFrom === 0 && filteredOut > 0 && !error) {
        error = `เว็บให้มา ${found} คน แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไข (${Object.entries(localFilters).map(([k, v]) => `${k}=${v}`).join(', ')}) — ลองผ่อนเงื่อนไข`;
      }
    }
  } catch (e) {
    error = e.message;
    if (e.fatal) {
      status = 'cooldown';
      await setConnectorCooldown(connector.id, new Date(Date.now() + COOLDOWN_MS).toISOString());
    } else {
      status = 'failed';
    }
    console.error(`  [${connector.label}] run error: ${e.message}`);
  } finally {
    clearInterval(heartbeatTimer);
    // Log out so the platform frees the single active session — otherwise the next
    // run's login collides and JobBKK renders resumes masked (contact hidden).
    if (provider.logout && activeContext) await provider.logout(activeContext, { debug: runtime.debug }).catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  return finalize();

  async function finalize() {
    await finishRun(runId, { status, requested, found, newCount, updatedCount, failed, error, opened, qualified, needsReview, rejected, duplicate, reasonCounts });
    await recordResumeSearchAttempt({
      taskId: opts.taskId, runId, connectorId: connector.id, platform: connector.platform,
      jobFamily: opts.jobFamily, location: criteria.province, searchTerm: criteria.position || criteria.keyword || '',
      searchTier: opts.searchTier || 'direct', found, opened,
      unique: Math.max(0, opened - duplicate), qualified, needsReview, rejected, duplicate,
      quotaUsed: opened, durationSeconds: Math.max(0, Math.round((Date.now() - runStartedAt) / 1000)), reasonCounts,
    }).catch((e) => console.warn(`  [second-brain] บันทึก Search Attempt ไม่สำเร็จ: ${e.message}`));
    return { runId, status, found, newCount, updatedCount, failed, error, opened, qualified, needsReview, rejected, duplicate, reasonCounts };
  }
}
