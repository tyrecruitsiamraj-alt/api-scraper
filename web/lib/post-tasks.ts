import 'server-only';
import { q } from './db';
import { buildPostTaskGroups, postTaskStage } from '../../src/core/post-task-state.js';
import type { PostTaskCounts, PostTaskCurrent, PostTaskGroup } from '../../src/core/post-task-state.js';

// งานโพสต์ 1 task = 1 รอบโพสต์ (post_run_queue 1 แถว, mode=post)
const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;

export type PostTask = {
  id: string;
  run_id: string | null;
  status: string;
  title: string;
  request_no: string | null;
  account: string | null;
  worker: string | null;
  requested_by: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  is_repost: boolean;
  /**
   * งานที่รอคิว: บัญชีต้องผ่านการทดสอบแบบไม่โพสต์ภายใน 24 ชม. ก่อน worker จะรับงาน
   * needed = ยังไม่ผ่านและไม่มีการทดสอบรออยู่ (งานจะค้าง) · running = กำลังทดสอบ · ok = ผ่านแล้ว · null = ไม่ใช่งานรอคิว
   */
  preflight: { state: 'needed' | 'running' | 'ok' | null; last_error: string | null };
  counts: PostTaskCounts;
  current: PostTaskCurrent;
  stage: { step: number; state: 'active' | 'done' | 'failed'; label: string };
  groups: PostTaskGroup[];
};

export type PostTaskLog = { at: string; level: string; message: string; group_name: string | null };

type RunRow = {
  id: string;
  run_id: string | null;
  status: string;
  user_id: string | null;
  account: string | null;
  worker_id: string | null;
  requested_by: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  assignment_ids: string[] | null;
  user_group_ids: string[] | null;
  preflight_state: 'needed' | 'running' | 'ok' | null;
  preflight_last_error: string | null;
};

type AttemptRow = { run_id: string; group_id: string | null; level: string; kind: string | null; message: string | null; at: string; meta: Record<string, unknown> | null };

/** jv-opl6910006 หรือ jv-opl6910006-r2 → OPL6910006 */
function requestNoFromAssignment(id: string): string | null {
  const m = /^jv-(.+?)(?:-r\d+)?$/i.exec(id);
  return m ? m[1].toUpperCase() : null;
}

async function loadTasks(where: string, params: unknown[], limit: number): Promise<{ rows: RunRow[]; attempts: AttemptRow[]; logs: Record<string, unknown>[]; groups: { id: string; name: string; fb_group_id: string }[]; assignments: { id: string; job_ids: string[]; group_ids: string[]; title: string | null }[] }> {
  const rows = await q<RunRow>(
    `SELECT r.id, r.run_id, r.status, r.user_id, u.name AS account, r.worker_id, r.requested_by, r.error,
            r.created_at, r.started_at, r.finished_at,
            COALESCE(r.assignment_ids::jsonb, '[]'::jsonb) AS assignment_ids,
            COALESCE(u.group_ids::jsonb, '[]'::jsonb) AS user_group_ids,
            CASE WHEN r.status = 'queued' THEN
              CASE
                WHEN EXISTS (SELECT 1 FROM ${AP}.post_run_queue p WHERE p.user_id = r.user_id AND p.mode = 'preflight'
                                AND p.status = 'completed' AND p.finished_at > NOW() - INTERVAL '24 hours') THEN 'ok'
                WHEN EXISTS (SELECT 1 FROM ${AP}.post_run_queue p WHERE p.user_id = r.user_id AND p.mode = 'preflight'
                                AND p.status IN ('queued', 'running')) THEN 'running'
                ELSE 'needed'
              END
            END AS preflight_state,
            (SELECT NULLIF(left(COALESCE(p.error, ''), 300), '') FROM ${AP}.post_run_queue p
              WHERE p.user_id = r.user_id AND p.mode = 'preflight' AND p.status = 'failed'
              ORDER BY p.created_at DESC LIMIT 1) AS preflight_last_error
       FROM ${AP}.post_run_queue r
       LEFT JOIN ${AP}.users u ON u.id = r.user_id
      WHERE COALESCE(r.mode, 'post') = 'post' ${where}
      ORDER BY r.created_at DESC LIMIT ${limit}`,
    params,
  );
  const runIds = rows.map((r) => r.run_id).filter((v): v is string => Boolean(v));
  const assignmentIds = [...new Set(rows.flatMap((r) => (r.assignment_ids ?? []).map(String)))];
  const [attempts, logs, groups, assignments] = await Promise.all([
    runIds.length
      ? q<AttemptRow>(
        `SELECT run_id, group_id, level, meta->>'kind' AS kind, message, created_at AS at, meta
           FROM ${AP}.run_logs
          WHERE run_id = ANY($1::text[])
            AND (group_id IS NOT NULL OR meta->>'kind' = 'plan' OR level = 'error')
          ORDER BY created_at`,
        [runIds],
      ).catch(() => [])
      : Promise.resolve([] as AttemptRow[]),
    runIds.length
      ? q<Record<string, unknown>>(
        `SELECT run_id, group_id, post_link, post_status, comment_count, reactions, shares, last_collected_at, created_at
           FROM ${AP}.post_logs WHERE run_id = ANY($1::text[])`,
        [runIds],
      ).catch(() => [])
      : Promise.resolve([] as Record<string, unknown>[]),
    q<{ id: string; name: string; fb_group_id: string }>(`SELECT id, name, fb_group_id FROM ${AP}.groups`).catch(() => []),
    assignmentIds.length
      ? q<{ id: string; job_ids: string[]; group_ids: string[]; title: string | null }>(
        `SELECT a.id, COALESCE(a.job_ids::jsonb, '[]'::jsonb) AS job_ids, COALESCE(a.group_ids::jsonb, '[]'::jsonb) AS group_ids,
                (SELECT string_agg(j.title, ', ') FROM ${AP}.jobs j
                  WHERE j.id IN (SELECT jsonb_array_elements_text(COALESCE(a.job_ids::jsonb, '[]'::jsonb)))) AS title
           FROM ${AP}.assignments a WHERE a.id = ANY($1::text[])`,
        [assignmentIds],
      ).catch(() => [])
      : Promise.resolve([] as { id: string; job_ids: string[]; group_ids: string[]; title: string | null }[]),
  ]);
  return { rows, attempts, logs, groups, assignments };
}

function assemble(data: Awaited<ReturnType<typeof loadTasks>>): PostTask[] {
  const nameByFb = new Map(data.groups.map((g) => [String(g.fb_group_id), g.name]));
  const fbByRow = new Map(data.groups.map((g) => [g.id, String(g.fb_group_id)]));
  const assignmentById = new Map(data.assignments.map((a) => [a.id, a]));

  return data.rows.map((row) => {
    const runAttempts = row.run_id ? data.attempts.filter((a) => a.run_id === row.run_id) : [];
    const planLog = [...runAttempts].reverse().find((a) => a.kind === 'plan');
    const planItems = Array.isArray(planLog?.meta?.items) ? (planLog!.meta!.items as Array<{ group_id?: string }>) : null;
    const assignments = (row.assignment_ids ?? []).map((id) => assignmentById.get(String(id))).filter(Boolean) as typeof data.assignments;
    // ไม่มี log แผน (รอบเก่า/ยังไม่เริ่ม): ใช้กลุ่มที่ผูกกับงาน ถ้าว่างใช้กลุ่มของบัญชี — แบบเดียวกับ worker
    const fallbackRows = assignments.flatMap((a) => (a.group_ids?.length ? a.group_ids : row.user_group_ids ?? []));
    const plan = (planItems ?? fallbackRows.map((id) => ({ group_id: fbByRow.get(String(id)) ?? String(id) })))
      .map((p) => ({ group_id: String(p.group_id ?? '') }))
      .filter((p) => p.group_id);
    const { groups, counts, current } = buildPostTaskGroups({
      plan,
      attempts: runAttempts.filter((a) => a.group_id).map((a) => ({ group_id: a.group_id, level: a.level, kind: a.kind, message: a.message, at: a.at })),
      postLogs: row.run_id ? data.logs.filter((l) => l.run_id === row.run_id) : [],
      runStatus: row.status,
      groupName: (id) => nameByFb.get(id) ?? `กลุ่ม ${id}`,
    });
    const runError = row.error || [...runAttempts].reverse().find((a) => a.level === 'error' && !a.group_id)?.message || null;
    const assignmentId = String(row.assignment_ids?.[0] ?? '');
    return {
      id: row.id,
      run_id: row.run_id,
      status: row.status,
      title: assignments.map((a) => a.title).filter(Boolean).join(', ') || 'งานโพสต์',
      request_no: requestNoFromAssignment(assignmentId),
      account: row.account,
      worker: row.worker_id ? row.worker_id.replace(/-\d+$/, '') : null,
      requested_by: row.requested_by,
      error: runError,
      created_at: row.created_at,
      started_at: row.started_at,
      finished_at: row.finished_at,
      is_repost: /-r\d+$/i.test(assignmentId),
      preflight: { state: row.preflight_state ?? null, last_error: row.preflight_last_error ?? null },
      counts,
      current,
      stage: postTaskStage(row.status, counts, current),
      groups,
    };
  });
}

export async function listPostTasks(limit = 60): Promise<PostTask[]> {
  try {
    return assemble(await loadTasks('', [], Math.max(1, Math.min(200, limit))));
  } catch {
    return [];
  }
}

export async function getPostTask(id: string): Promise<PostTask | null> {
  try {
    return assemble(await loadTasks('AND r.id = $1', [id], 1))[0] ?? null;
  } catch {
    return null;
  }
}

/** log ทั้งหมดของรอบ (ล่าสุดก่อน) สำหรับหน้า task */
export async function getPostTaskLogs(runId: string): Promise<PostTaskLog[]> {
  try {
    const [rows, groups] = await Promise.all([
      q<{ at: string; level: string; message: string; group_id: string | null }>(
        `SELECT created_at AS at, level, message, group_id FROM ${AP}.run_logs WHERE run_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [runId],
      ),
      q<{ name: string; fb_group_id: string }>(`SELECT name, fb_group_id FROM ${AP}.groups`).catch(() => []),
    ]);
    const nameByFb = new Map(groups.map((g) => [String(g.fb_group_id), g.name]));
    return rows.map((r) => ({ ...r, group_name: r.group_id ? nameByFb.get(String(r.group_id)) ?? r.group_id : null }));
  } catch {
    return [];
  }
}
