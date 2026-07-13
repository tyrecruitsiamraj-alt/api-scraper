'use client';

import { useEffect, useState } from 'react';
import type { AutopostActivity as Activity } from '@/lib/repo';

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: 'รอคิว', cls: 'bg-amber-50 text-amber-700' },
  running: { label: 'กำลังโพสต์', cls: 'bg-blue-50 text-blue-700' },
  completed: { label: 'เสร็จ', cls: 'bg-green-50 text-green-700' },
  failed: { label: 'ล้มเหลว', cls: 'bg-red-50 text-red-700' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-black/5 text-subtle' },
};
const LOG_CLS: Record<string, string> = {
  success: 'text-green-700',
  info: 'text-subtle',
  warn: 'text-amber-600',
  error: 'text-red-600',
};

function timeAgo(s: string | null): string {
  if (!s) return '—';
  const ms = Date.now() - new Date(s).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'เมื่อครู่';
  if (m < 60) return `${m} นาทีก่อน`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ก่อน`;
  return `${Math.floor(h / 24)} วันก่อน`;
}
function fmt(s: string) {
  return new Date(s).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AutopostActivity({ initial }: { initial: Activity | null }) {
  const [a, setA] = useState(initial);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/autopost-activity', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { activity: Activity | null };
        setA(data.activity);
      } catch {
        /* ignore */
      }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  if (!a) return null;

  // worker แตะคิวล่าสุดภายใน 5 นาที = เห็นว่ากำลังทำงานแน่ๆ (idle+ว่างจะเดาไม่ได้ จึงไม่ฟันธงว่า offline)
  const workerMs = a.worker_last_seen ? Date.now() - new Date(a.worker_last_seen).getTime() : Infinity;
  const workerActive = a.running > 0 || workerMs < 5 * 60 * 1000;
  // สถานะที่ "แย่จริง": มีงานรอคิวแต่ไม่มีอะไรมาหยิบ = worker ไม่รัน
  const jobsStuck = a.queued > 0 && a.running === 0 && workerMs > 3 * 60 * 1000;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">สถานะการโพสต์ (อัปเดตอัตโนมัติ)</h2>
        {a.running > 0 ? (
          <span className="pill bg-blue-50 text-blue-700"><span className="dot bg-blue-500" />กำลังโพสต์ {a.running}</span>
        ) : jobsStuck ? (
          <span className="pill bg-red-50 text-red-700"><span className="dot bg-red-500" />งานค้าง — worker อาจไม่รัน</span>
        ) : workerActive ? (
          <span className="pill bg-green-50 text-green-700"><span className="dot bg-green-500" />Worker ทำงานล่าสุด {timeAgo(a.worker_last_seen)}</span>
        ) : (
          <span className="pill bg-black/5 text-subtle"><span className="dot bg-gray-400" />ไม่มีงานในคิว</span>
        )}
        {a.queued > 0 && <span className="pill bg-amber-50 text-amber-700">รอคิว {a.queued}</span>}
      </div>

      {jobsStuck && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          มีงาน {a.queued} รายการค้างในคิวแต่ไม่มี worker มาหยิบ — รัน <code>npm run worker:post</code> บนเครื่อง worker
          {a.worker_last_seen && <> (แตะคิวล่าสุด {timeAgo(a.worker_last_seen)})</>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* recent runs */}
        <div className="card overflow-hidden">
          <h3 className="px-4 pt-4 text-[13px] font-semibold">งานโพสต์ล่าสุด</h3>
          <div className="mt-2 divide-y divide-hairline/50">
            {a.runs.length === 0 && <p className="px-4 py-6 text-center text-sm text-subtle">ยังไม่มีงาน</p>}
            {a.runs.map((r) => {
              const st = RUN_STATUS[r.status] ?? { label: r.status, cls: 'bg-black/5' };
              return (
                <div key={r.id} className="flex items-center gap-2 px-4 py-2.5">
                  <span className={`pill ${st.cls} shrink-0`}>{st.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{r.account ?? 'ทุกบัญชี'}</div>
                    {r.error && <div className="truncate text-[11px] text-red-600" title={r.error}>{r.error}</div>}
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-subtle">{timeAgo(r.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* recent logs */}
        <div className="card overflow-hidden">
          <h3 className="px-4 pt-4 text-[13px] font-semibold">บันทึกล่าสุด (สำเร็จ / ข้าม / ล้ม)</h3>
          <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto px-4 pb-4">
            {a.logs.length === 0 && <p className="py-6 text-center text-sm text-subtle">ยังไม่มีบันทึก</p>}
            {a.logs.map((l, i) => (
              <div key={i} className="flex gap-2 text-[12px]">
                <span className="shrink-0 tabular-nums text-subtle">{fmt(l.created_at)}</span>
                <span className={`min-w-0 flex-1 ${LOG_CLS[l.level] ?? 'text-ink'}`}>{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
