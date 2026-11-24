/**
 * ดึงเบอร์คืนให้ผู้สมัคร JobThai ที่ค้าง "ต้องตรวจเพิ่ม" เพราะไม่มีช่องทางติดต่อ (เจ้าของสั่ง 24 พ.ย. 2569)
 *
 * 23–24 พ.ย. 2569: เรซูเม่ที่บัญชีปลดล็อกเบอร์ไปแล้ว JobThai ใส่เบอร์ไว้ในหน้า แต่ตัวอ่านเดิมไม่อ่าน
 * แล้วไปกดเปิดเบอร์ซ้ำ (ตอบ Error) — คนเหล่านี้ถูกนับว่าไม่มีเบอร์ ตัวอ่านแก้แล้วใน 0568f6f
 * งานนี้เปิดหน้าของคนเหล่านั้นอีกรอบด้วยบัญชีเดิม อ่านเบอร์/อีเมล แล้วเติมเฉพาะช่องที่ว่าง
 * ใบงานที่ "ต้องตรวจเพิ่ม" เพราะขาดช่องทางติดต่ออย่างเดียว กลับเป็น "ผ่านเกณฑ์"
 *
 * นับเป็นการเปิดโปรไฟล์ในโควต้าต่อวันของบัญชีเหมือนงานค้นปกติ (scrape_runs.opened_count) — โควต้าเต็ม = รอคิววันถัดไป
 */
import { resolveProvider } from '../connectors/registry.js';
import { RateLimiter } from './anti-ban.js';
import { cooldownError, dailyRemaining, nextQuotaReset } from './scrape-task-result.js';
import { resumeContactGaps } from './resume-completeness.js';

/** ใบงานที่ขาดแค่ช่องทางติดต่อ → ผ่านเกณฑ์ (เหตุอื่นยังอยู่ = คงต้องตรวจเพิ่ม) */
export const PROMOTE_CONTACT_ONLY_SQL = `
  UPDATE scrape_task_candidates
     SET qualification_status = 'qualified', qualification_reasons = '[]'::jsonb, evaluated_at = now()
   WHERE candidate_id = $1
     AND qualification_status = 'needs_review'
     AND recruiter_decision IS NULL
     AND qualification_reasons = '["missing_contact"]'::jsonb
  RETURNING task_id`;

/** ผู้สมัครที่ยังไม่มีทั้งเบอร์และอีเมล (กรองซ้ำทุกครั้งที่เริ่มงาน — รอบที่ค้างครึ่งทางไม่เปิดคนที่ได้แล้วซ้ำ) */
export const STILL_NO_CONTACT_SQL = `
  SELECT cs.external_id, cs.candidate_id
    FROM candidate_sources cs
    JOIN candidates c ON c.id = cs.candidate_id
   WHERE cs.platform = 'jobthai' AND cs.external_id = ANY($1::text[])
     AND COALESCE(c.phone_norm, '') = '' AND COALESCE(c.email_norm, '') = ''`;

/**
 * @param {object} connector  แถว connectors (getConnector) ของบัญชีที่เคยเปิดเรซูเม่เหล่านี้
 * @param {string[]} externalIds
 * @param {object} deps  { query, fillCandidateContacts, startRun, finishRun, touchRun, saveConnectorSession,
 *                         countScrapedToday, getProviderCap, platformScrapedToday, runtime }
 */
export async function refreshJobthaiContacts(connector, externalIds, deps) {
  const { query, runtime = {} } = deps;
  const provider = deps.provider ?? resolveProvider('jobthai');
  const { rows } = await query(STILL_NO_CONTACT_SQL, [externalIds.map(String)]);
  const todo = rows;
  const result = { asked: externalIds.length, todo: todo.length, opened: 0, phone: 0, email: 0, promoted: 0, still_hidden: 0, failed: 0 };
  if (!todo.length) return result;

  const providerCap = await deps.getProviderCap(connector.platform);
  const daily = dailyRemaining({
    connectorCap: connector.daily_cap,
    connectorToday: await deps.countScrapedToday(connector.id),
    providerCap,
    platformToday: providerCap != null ? await deps.platformScrapedToday(connector.platform) : 0,
  });
  if (daily.remaining <= 0) {
    throw cooldownError(`รอคิว: โควต้าเปิดโปรไฟล์วันนี้เต็มแล้ว (${daily.used}/${daily.cap}) จะดึงเบอร์คืนต่อวันถัดไป`, nextQuotaReset(), { waiting: true });
  }

  const runId = await deps.startRun(connector.id, connector.platform, { mode: 'contact_refresh', resumes: todo.length });
  const limiter = new RateLimiter({ minMs: runtime.delayMin, maxMs: runtime.delayMax });
  let sess = null;
  let status = 'success';
  let error = null;
  try {
    sess = await provider.getSession({
      headless: runtime.headless,
      debug: runtime.debug,
      username: connector.username,
      password: connector.password(),
      storageState: connector.session_state ?? undefined,
    });
    await deps.saveConnectorSession(connector.id, await sess.dumpState());
    for (const row of todo) {
      if (result.opened >= daily.remaining) {
        status = 'partial';
        error = `โควต้าเปิดโปรไฟล์วันนี้เต็มระหว่างดึงเบอร์คืน (${result.opened}/${todo.length})`;
        break;
      }
      await limiter.wait();
      await deps.touchRun(runId).catch(() => {});
      try {
        const url = provider.resumeDetailUrl(row.external_id);
        const html = await provider.fetchResumeHtml(sess, row.external_id, runtime);
        let parsed = provider.parseResumeHtml(html, { sourceUrl: url, index: result.opened + 1 });
        result.opened += 1;
        await provider.enrichContacts(sess.request, row.external_id, parsed, runtime);
        parsed = provider.finalizeCandidateRecord(parsed);
        if (resumeContactGaps(parsed).length) {
          result.still_hidden += 1;
          continue;
        }
        const filled = await deps.fillCandidateContacts(row.candidate_id, { phone: parsed.phone, email: parsed.email, line_id: parsed.line_id });
        const after = await query(`SELECT phone_norm, email_norm FROM candidates WHERE id = $1`, [row.candidate_id]);
        const c = after.rows[0] || {};
        if (c.phone_norm) result.phone += 1;
        else if (c.email_norm) result.email += 1;
        if (filled && (c.phone_norm || c.email_norm)) {
          const promoted = await query(PROMOTE_CONTACT_ONLY_SQL, [row.candidate_id]);
          result.promoted += promoted.rows.length;
        }
      } catch (e) {
        result.failed += 1;
        console.warn(`  ดึงเบอร์คืน ${row.external_id}: ${e.message}`);
      }
    }
  } catch (e) {
    status = 'failed';
    error = e.message;
    throw e;
  } finally {
    await deps.finishRun(runId, {
      status,
      requested: todo.length,
      found: todo.length,
      newCount: 0,
      updatedCount: result.phone + result.email,
      failed: result.failed,
      error,
      opened: result.opened,
      reasonCounts: { contact_refresh_phone: result.phone, contact_refresh_email: result.email, contact_refresh_none: result.still_hidden },
    }).catch((e) => console.warn(`  บันทึกรอบดึงเบอร์คืนไม่ได้: ${e.message}`));
    await sess?.browser?.close().catch(() => {});
  }
  if (status === 'partial') throw cooldownError(error, nextQuotaReset(), { waiting: true });
  return result;
}
