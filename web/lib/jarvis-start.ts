import 'server-only';
import { q } from './db';
import { createScrapeTaskFromSoRecruit, enqueueScrapeForTask, getConnectorOption, listJarvisPostOrders, postJarvisOrder } from './repo';

/**
 * เริ่มงานจากคำสั่ง Jarvis ทันที (ไม่ต้องมีคนกดในระบบนี้) — Jarvis เรียกหลังบันทึก job_posting_requests
 * ทำตามค่าที่พนักงานเลือกใน Jarvis เท่านั้น ถ้าข้อมูลไม่ครบหรือมีปัญหา จะไม่เดาแทน
 * แต่คืนเหตุผลกลับไป และคำสั่งยังค้างให้คนแก้ในหน้างานของระบบนี้
 */

const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;

export type JarvisStartResult =
  | { ok: true; type: 'content'; request_no: string; queue_id: string; worker: string | null; preflight_queued: boolean }
  | { ok: true; type: 'scraping'; request_no: string; task_id: string; queued: boolean; message: string | null }
  | { ok: false; status: number; error: string };

async function startContent(requestNo: string, requestedBy: string): Promise<JarvisStartResult> {
  const order = (await listJarvisPostOrders()).find((o) => o.request_no === requestNo);
  if (!order) return { ok: false, status: 404, error: `ไม่พบคำสั่งโพสต์ ${requestNo}` };
  if (order.jarvis_status !== 'pending') return { ok: false, status: 409, error: 'ใบนี้สั่งโพสต์ไปแล้ว' };
  if (order.issues.length) return { ok: false, status: 422, error: `ยังโพสต์ไม่ได้: ${order.issues.join(', ')}` };
  if (!order.account_id) return { ok: false, status: 422, error: 'ไม่มีบัญชี Facebook ที่ผูกกับกลุ่มนี้' };

  // ไม่ต้องทดสอบแบบไม่โพสต์ก่อนแล้ว (เจ้าของสั่งเอาออก 28 ต.ค. 2569) — สั่งแล้วเข้าคิวโพสต์เลย
  // preflight_queued คงไว้ใน response เป็น false ให้ Jarvis ที่อ่านช่องนี้อยู่ไม่พัง
  await q(`ALTER TABLE ${AP}.post_run_queue ADD COLUMN IF NOT EXISTS target_worker VARCHAR(255)`);
  const preflightQueued = false;

  try {
    const queueId = await postJarvisOrder(requestNo, requestedBy);
    return { ok: true, type: 'content', request_no: requestNo, queue_id: queueId, worker: order.target_worker, preflight_queued: preflightQueued };
  } catch (error) {
    return { ok: false, status: 422, error: (error as Error).message };
  }
}

async function startScraping(requestNo: string, requestedBy: string, snapshot: Record<string, unknown>): Promise<JarvisStartResult> {
  const chosen = (Array.isArray(snapshot.scrape_connector_ids) ? snapshot.scrape_connector_ids : [snapshot.scrape_connector_id])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  if (!chosen.length) return { ok: false, status: 422, error: 'ยังไม่ได้เลือกบัญชี Scrap (scrape_connector_ids)' };
  let connectorId: string | null = null;
  const blocked: string[] = [];
  for (const id of chosen) {
    const option = await getConnectorOption(id);
    if (option?.available) {
      connectorId = id;
      break;
    }
    blocked.push(option?.block_reason || `บัญชี ${id} ไม่พร้อมใช้งาน`);
  }
  if (!connectorId) return { ok: false, status: 422, error: blocked.join(' · ') };

  try {
    const taskId = await createScrapeTaskFromSoRecruit(requestNo, connectorId, {});
    const queued = await enqueueScrapeForTask(taskId, requestedBy);
    const reason = queued
      ? null
      : (await q<{ last_error: string | null }>(`SELECT last_error FROM scrape_tasks WHERE id=$1`, [taskId]).catch(() => []))[0]?.last_error ?? null;
    return { ok: true, type: 'scraping', request_no: requestNo, task_id: taskId, queued, message: reason };
  } catch (error) {
    const message = (error as Error).message;
    return { ok: false, status: /รอดำเนินการ/.test(message) ? 409 : 422, error: message };
  }
}

export async function startJarvisRequest(requestNo: string): Promise<JarvisStartResult> {
  const rows = await q<{ request_type: string; status: string; requested_by_name: string | null; snapshot: Record<string, unknown> | null }>(
    `SELECT COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content') AS request_type, r.status, r.requested_by_name,
            to_jsonb(r)->'job_snapshot' AS snapshot
       FROM "jarvis_rm".job_posting_requests r
      WHERE r.request_no = $1
      ORDER BY r.created_at DESC LIMIT 1`,
    [requestNo],
  );
  const req = rows[0];
  if (!req) return { ok: false, status: 404, error: `ไม่พบคำสั่ง ${requestNo}` };
  if (req.status !== 'pending') return { ok: false, status: 409, error: `คำสั่ง ${requestNo} เริ่มไปแล้ว (สถานะ ${req.status})` };
  const requestedBy = `jarvis:${req.requested_by_name || 'unknown'}`;
  if (req.request_type === 'scraping') return startScraping(requestNo, requestedBy, req.snapshot ?? {});
  return startContent(requestNo, requestedBy);
}
