'use client';

import { useEffect, useState } from 'react';
import type { TaskRow } from '@/lib/repo';
import { deleteTaskAction, queueTaskAction, toggleTaskAction } from '@/lib/actions';

type LiveStatus = {
  id: string;
  status: string;
  phase: string;
  progress_got: number;
  progress_target: number;
  last_error: string | null;
  last_run_at: string | null;
};

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

// The auto pipeline phases, in order, with the message shown while active.
const PHASES = ['scraping', 'ocr', 'enrich'] as const;
const PHASE_LABEL: Record<string, string> = {
  scraping: 'กำลังดึงข้อมูลผู้สมัคร',
  ocr: 'กำลังอ่านเอกสารแนบด้วย AI (OCR)',
  enrich: 'กำลังทำความสะอาดและเติมข้อมูล Candidate ที่ขาด',
};
const PHASE_DONE_LABEL: Record<string, string> = {
  scraping: 'ดึงข้อมูลผู้สมัครเรียบร้อยแล้ว',
  ocr: 'อ่านเอกสารแนบ (OCR) เสร็จแล้ว',
  enrich: 'เติมข้อมูล Candidate เรียบร้อยแล้ว',
};
const STATUS: Record<string, { label: string; cls: string }> = {
  idle: { label: 'พร้อม', cls: 'bg-black/5 text-ink' },
  queued: { label: 'รอคิว', cls: 'bg-amber-50 text-amber-700' },
  running: { label: 'กำลังทำงาน', cls: 'bg-blue-50 text-blue-700' },
  done: { label: 'เสร็จ', cls: 'bg-green-50 text-green-700' },
  error: { label: 'ผิดพลาด', cls: 'bg-red-50 text-red-700' },
};

function scheduleLabel(cron: string | null): string {
  if (!cron) return 'รันเอง';
  if (cron === '@hourly') return 'ทุกชั่วโมง';
  if (cron === '@daily') return 'ทุกวัน';
  const m = cron.match(/^every:(\d+)$/);
  if (m) return `ทุก ${Math.round(Number(m[1]) / 60)} นาที`;
  return cron;
}

export function TaskList({ initialTasks }: { initialTasks: TaskRow[] }) {
  const [live, setLive] = useState<Record<string, LiveStatus>>({});

  // Poll live status while any task is active. Refresh the page data once a task
  // finishes so newly-scraped candidates/runs show up elsewhere.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/scrape-tasks', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { tasks: LiveStatus[] };
        const map: Record<string, LiveStatus> = {};
        for (const t of data.tasks) map[t.id] = t;
        setLive(map);
      } catch {
        /* ignore transient poll errors */
      }
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  if (initialTasks.length === 0) {
    return <div className="card px-5 py-16 text-center text-subtle">ยังไม่มีงาน Scraping — สร้างงานใหม่ด้านบน</div>;
  }

  return (
    <div className="space-y-3">
      {initialTasks.map((t) => {
        const s = live[t.id];
        const status = s?.status ?? t.status;
        const got = s?.progress_got ?? t.progress_got;
        const target = s?.progress_target ?? t.progress_target;
        const error = s?.last_error ?? t.last_error;
        const meta = STATUS[status] ?? STATUS.idle;
        const pct = target > 0 ? Math.min(100, Math.round((got / target) * 100)) : 0;
        const busy = status === 'running' || status === 'queued';
        const phase = s?.phase ?? t.phase ?? 'idle';
        const phaseIdx = PHASES.indexOf(phase as (typeof PHASES)[number]);

        return (
          <div key={t.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{t.name}</span>
                  <span className={`pill ${meta.cls}`}>{meta.label}</span>
                  {!t.enabled && <span className="pill bg-black/5 text-subtle">ปิดอยู่</span>}
                </div>
                <div className="mt-1 text-xs text-subtle">
                  {PLATFORM_LABEL[t.platform] ?? t.platform} · {t.connector_label} ·{' '}
                  {t.mode === 'count' ? `จำนวน ${t.target_count ?? '-'}` : `ตั้งแต่ ${t.updated_since ?? '-'}`} ·{' '}
                  {scheduleLabel(t.schedule_cron)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <form action={queueTaskAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="btn-ghost px-4 py-2 text-sm disabled:opacity-40" disabled={busy || !t.enabled}>
                    ▶ รันตอนนี้
                  </button>
                </form>
                <form action={toggleTaskAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="enabled" value={(!t.enabled).toString()} />
                  <button className="btn-ghost px-4 py-2 text-sm">{t.enabled ? 'ปิด' : 'เปิด'}</button>
                </form>
                <form action={deleteTaskAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="btn-ghost px-3 py-2 text-sm text-red-600 hover:bg-red-50">ลบ</button>
                </form>
              </div>
            </div>

            {/* phase checklist — narrates scrape → ocr → enrich → เสร็จสิ้น */}
            {(status !== 'idle' || got > 0) && (
              <div className="mt-3 space-y-1.5">
                {status === 'queued' && <div className="text-xs text-amber-700">อยู่ในคิว — รอเริ่มทำงาน…</div>}

                {PHASES.map((p, idx) => {
                  // state of this step relative to the current phase
                  let state: 'done' | 'active' | 'pending' | 'error';
                  if (status === 'done') state = 'done';
                  else if (status === 'error') state = phaseIdx > idx ? 'done' : phaseIdx === idx ? 'error' : 'pending';
                  else if (phaseIdx < 0) state = 'pending';
                  else state = phaseIdx > idx ? 'done' : phaseIdx === idx ? 'active' : 'pending';

                  return (
                    <div key={p} className="flex items-center gap-2 text-xs">
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${
                          state === 'done'
                            ? 'bg-green-100 text-green-700'
                            : state === 'error'
                              ? 'bg-red-100 text-red-700'
                              : state === 'active'
                                ? 'bg-accent/15'
                                : 'bg-black/5 text-subtle'
                        }`}
                      >
                        {state === 'done' ? '✓' : state === 'error' ? '✕' : state === 'active' ? <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" /> : '○'}
                      </span>
                      <span className={state === 'active' ? 'font-medium text-ink' : state === 'pending' ? 'text-subtle/60' : 'text-subtle'}>
                        {state === 'done' ? PHASE_DONE_LABEL[p] : PHASE_LABEL[p]}
                        {state === 'active' && (target > 0 ? <span className="ml-1 tabular-nums text-ink">{got}/{target}</span> : p === 'ocr' ? ' — ไม่มีเอกสารแนบ' : null)}
                      </span>
                    </div>
                  );
                })}

                {/* active-phase progress bar */}
                {busy && phaseIdx >= 0 && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${target > 0 ? pct : 100}%` }} />
                  </div>
                )}

                {status === 'done' && (
                  <div className="mt-1 flex items-center gap-2 text-xs font-medium text-green-700">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-green-100 text-[10px]">✓</span>
                    Task ทั้งหมดเสร็จสิ้น
                  </div>
                )}
              </div>
            )}

            {/* finished-but-incomplete / no-result hints */}
            {status === 'done' && got === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                ไม่พบผลลัพธ์ในรอบนี้ — มักเกิดจาก session ของ connector หมดอายุหรือ criteria แคบเกินไป ลองกด “รันตอนนี้” อีกครั้ง
              </p>
            )}
            {status === 'done' && got > 0 && target > 0 && got < target && (
              <p className="mt-2 text-xs text-amber-700">ดึงได้ไม่ครบ ({got}/{target}) — อาจติด daily cap หรือผลลัพธ์มีไม่พอ</p>
            )}

            {status === 'error' && error && <p className="mt-2 text-xs text-red-600">⚠ {error}</p>}
          </div>
        );
      })}
    </div>
  );
}
