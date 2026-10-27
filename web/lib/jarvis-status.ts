import 'server-only';
import { q } from './db';
import { listJarvisPostOrders, listTasks } from './repo';
import { deriveScrapStage } from './scrap-stage';
import { platformLabel } from './scrap-tasks';

/**
 * ผลงานของคำสั่งจาก Jarvis ให้ Jarvis ดึงไปแสดงหน้าใบงาน (อ่านอย่างเดียว)
 * งานโพสต์ = ผลรายกลุ่ม (ลิงก์ ไลก์ คอมเมนต์ แชร์) / งาน Scrap = อยู่ขั้นไหน ได้คนกี่คน
 */

const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;
const BASE_URL = (process.env.NEXTAUTH_URL || 'https://so-scraping.vercel.app').replace(/\/$/, '');

type RequestRow = { request_no: string; request_type: string; status: string; requested_by_name: string | null; created_at: string };

export type JarvisPostGroupStatus = {
  fb_group_id: string;
  name: string;
  /** posted = โพสต์สำเร็จ · failed = ไม่สำเร็จ (ดู error) · waiting = ยังไม่ถึงคิว */
  status: 'posted' | 'failed' | 'waiting';
  at: string | null;
  error: string | null;
  post_link: string | null;
  /** สถานะโพสต์ในกลุ่ม เช่น อนุมัติแล้ว / รออนุมัติ (ถ้ารู้) */
  approval: string | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  /** เวลาที่อ่านยอดไลก์/คอมเมนต์ล่าสุด */
  collected_at: string | null;
};

export type JarvisRequestStatus =
  | {
      request_no: string;
      type: 'content';
      jarvis_status: string;
      position: string;
      account: { id: string | null; name: string | null };
      worker: string | null;
      /** queued = รอเครื่อง · running = กำลังโพสต์ · completed = จบรอบ · failed = รอบนี้ล้ม · null = ยังไม่เริ่ม */
      run_status: string | null;
      run_queued_at: string | null;
      summary: { groups: number; posted: number; failed: number; waiting: number; reactions: number; comments: number; shares: number; phone_leads: number };
      groups: JarvisPostGroupStatus[];
      /** เหตุผลที่ยังเริ่มไม่ได้ (ถ้ามี) */
      issues: string[];
      detail_url: string;
    }
  | {
      request_no: string;
      type: 'scraping';
      jarvis_status: string;
      tasks: {
        task_id: string;
        platform: string;
        account: string;
        /** working / review / attention / done / idle */
        group: string;
        status_label: string;
        step: string;
        note: string | null;
        target: number;
        qualified: number;
        needs_review: number;
        rejected: number;
        last_error: string | null;
        last_run_at: string | null;
        detail_url: string;
      }[];
    }
  | { request_no: string; type: 'unknown'; error: string };

async function phoneLeadsFor(requestNo: string): Promise<number> {
  const rows = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${AP}.comment_leads WHERE request_no = $1 AND phone IS NOT NULL`,
    [requestNo],
  ).catch(() => [{ n: 0 }]);
  return rows[0]?.n ?? 0;
}

export async function getJarvisStatuses(requestNos: string[]): Promise<JarvisRequestStatus[]> {
  const wanted = [...new Set(requestNos.map((r) => r.trim()).filter(Boolean))].slice(0, 20);
  if (!wanted.length) return [];
  const requests = await q<RequestRow>(
    `SELECT DISTINCT ON (r.request_no) r.request_no,
            COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content') AS request_type,
            r.status, r.requested_by_name, r.created_at
       FROM "jarvis_rm".job_posting_requests r
      WHERE r.request_no = ANY($1::text[])
      ORDER BY r.request_no, r.created_at DESC`,
    [wanted],
  );
  const byNo = new Map(requests.map((r) => [r.request_no, r]));
  const needPosts = requests.some((r) => r.request_type !== 'scraping');
  const needTasks = requests.some((r) => r.request_type === 'scraping');
  const [orders, tasks] = await Promise.all([needPosts ? listJarvisPostOrders() : [], needTasks ? listTasks() : []]);

  const out: JarvisRequestStatus[] = [];
  for (const requestNo of wanted) {
    const req = byNo.get(requestNo);
    if (!req) {
      out.push({ request_no: requestNo, type: 'unknown', error: 'ไม่พบคำสั่งนี้' });
      continue;
    }
    if (req.request_type === 'scraping') {
      const own = tasks.filter((t) => t.source_request_no === requestNo);
      out.push({
        request_no: requestNo,
        type: 'scraping',
        jarvis_status: req.status,
        tasks: own.map((t) => {
          const stage = deriveScrapStage(t);
          return {
            task_id: t.id,
            platform: platformLabel(t.platform),
            account: t.connector_label,
            group: stage.group,
            status_label: stage.statusLabel,
            step: stage.stepText,
            note: stage.note,
            target: t.target_count ?? t.progress_target ?? 0,
            qualified: t.qualified_count ?? 0,
            needs_review: t.needs_review_count ?? 0,
            rejected: t.rejected_count ?? 0,
            last_error: t.last_error,
            last_run_at: t.last_run_at,
            detail_url: `${BASE_URL}/scraping/${t.id}`,
          };
        }),
      });
      continue;
    }

    const order = orders.find((o) => o.request_no === requestNo);
    if (!order) {
      out.push({ request_no: requestNo, type: 'unknown', error: 'คำสั่งโพสต์นี้ยังไม่มีข้อมูลในระบบ (เก่ากว่า 30 วัน หรือยังไม่มีข้อความโพสต์)' });
      continue;
    }
    const groups: JarvisPostGroupStatus[] = order.group_results.map((g) => ({
      fb_group_id: g.fb_group_id,
      name: g.name,
      status: g.status,
      at: g.at,
      error: g.error,
      post_link: g.post_link,
      approval: g.approval,
      reactions: g.reactions,
      comments: g.comments,
      shares: g.shares,
      collected_at: g.collected_at,
    }));
    const sum = (key: 'reactions' | 'comments' | 'shares') => groups.reduce((s, g) => s + (Number(g[key]) || 0), 0);
    out.push({
      request_no: requestNo,
      type: 'content',
      jarvis_status: req.status,
      position: order.position,
      account: { id: order.account_id, name: order.account_label },
      // เครื่องที่เลือกจาก Jarvis ถ้ามี ไม่งั้นเครื่องที่โพสต์ล่าสุด
      worker: order.target_worker ?? order.posts[0]?.worker ?? null,
      run_status: order.queue_status,
      run_queued_at: order.queue_at,
      summary: {
        groups: groups.length,
        posted: groups.filter((g) => g.status === 'posted').length,
        failed: groups.filter((g) => g.status === 'failed').length,
        waiting: groups.filter((g) => g.status === 'waiting').length,
        reactions: sum('reactions'),
        comments: sum('comments'),
        shares: sum('shares'),
        phone_leads: await phoneLeadsFor(requestNo),
      },
      groups,
      issues: order.issues,
      detail_url: `${BASE_URL}/autopost/jobs`,
    });
  }
  return out;
}
