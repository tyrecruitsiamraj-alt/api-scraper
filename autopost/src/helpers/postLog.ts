/**
 * บันทึก Post Log ลง Database (รูปแบบ Log File)
 * วันที่-เวลา | ผู้โพสต์ | เจ้าของงาน | ชื่องาน | หน่วยงาน | ชื่อกลุ่ม | จำนวนสมาชิก | ลิงก์โพสต์ | สถานะ | จำนวน Comment | เบอร์โทรลูกค้า
 */
import { createHash } from 'node:crypto';

const API_URL = process.env.RUN_LOG_API_URL || 'http://localhost:3000';

export interface PostLogData {
  poster_name: string;
  owner: string;
  job_title: string;
  company: string;
  group_name: string;
  member_count: string;
  post_link: string;
  post_status: string;
  comment_count?: number;
  customer_phone?: string;
  assignment_id?: string;
  user_id?: string;
  job_id?: string;
  group_id?: string;
  idempotency_key?: string;
  content_fingerprint?: string;
  lifecycle_state?: 'planned' | 'posting' | 'clicked_unverified' | 'verified' | 'needs_verification' | 'failed';
  verification_error?: string;
}

const POST_LOG_FETCH_MS = Math.min(60000, Math.max(3000, Number(process.env.POST_LOG_FETCH_MS) || 12000));

export async function postLog(data: PostLogData): Promise<void> {
  const runId = process.env.RUN_ID;
  if (!runId) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), POST_LOG_FETCH_MS);
    try {
      const res = await fetch(`${API_URL}/api/post-logs`, {
        method: 'POST',
        headers: workerHeaders(),
        body: JSON.stringify({ ...data, run_id: runId }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`/api/post-logs ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    const message = (e as Error).message || String(e);
    console.warn('[postLog] บันทึกลง API ไม่สำเร็จ:', message, '→ ตรวจ RUN_LOG_API_URL / เครือข่าย');
    // Evidence is part of the posting transaction. The caller must keep this
    // attempt ambiguous instead of reporting a verified success.
    throw new Error(message);
  }
}

function workerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = String(process.env.POST_WORKER_TOKEN || '').trim();
  if (token) headers['x-worker-token'] = token;
  return headers;
}

export function buildPostIdentity(input: {
  userId?: string;
  jobId?: string;
  groupId: string;
  caption: string;
}): { idempotencyKey: string; contentFingerprint: string } {
  const contentFingerprint = createHash('sha256')
    .update(String(input.caption || '').replace(/\s+/g, ' ').trim(), 'utf8')
    .digest('hex');
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const idempotencyKey = createHash('sha256')
    .update(
      [
        day,
        String(input.userId || ''),
        String(input.jobId || ''),
        String(input.groupId || ''),
        contentFingerprint,
      ].join('|'),
      'utf8'
    )
    .digest('hex');
  return { idempotencyKey, contentFingerprint };
}

export async function reservePostAttempt(data: PostLogData): Promise<{
  should_post: boolean;
  created: boolean;
  lifecycle_state?: string;
}> {
  const runId = process.env.RUN_ID;
  if (!runId) throw new Error('RUN_ID is required before reserving a post');
  const res = await fetch(`${API_URL}/api/post-logs/reserve`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({ ...data, run_id: runId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`/api/post-logs/reserve ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const out = await res.json() as {
    should_post?: boolean;
    created?: boolean;
    post?: { lifecycle_state?: string };
  };
  return {
    should_post: !!out.should_post,
    created: !!out.created,
    lifecycle_state: out.post?.lifecycle_state,
  };
}

export async function updatePostAttempt(
  idempotencyKey: string,
  data: Pick<PostLogData, 'lifecycle_state' | 'post_status' | 'post_link' | 'verification_error'>
): Promise<void> {
  const res = await fetch(`${API_URL}/api/post-logs/state`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({ idempotency_key: idempotencyKey, ...data }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`/api/post-logs/state ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
}
