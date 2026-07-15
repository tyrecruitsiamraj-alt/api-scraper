import Link from 'next/link';
import { autopostRuns } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: 'รอคิว', cls: 'bg-black/5 text-ink' },
  running: { label: 'กำลังโพสต์', cls: 'bg-blue-50 text-blue-700' },
  completed: { label: 'เสร็จ', cls: 'bg-green-50 text-green-700' },
  failed: { label: 'ล้มเหลว', cls: 'bg-red-50 text-red-700' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-amber-50 text-amber-700' },
};

function fmt(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(v);
  }
}

/** requested_by → ข้อความอ่านง่าย (auto-daily = รอบอัตโนมัติ 8:00, อื่น ๆ = คนสั่ง) */
function whoRequested(v: string | null): string {
  if (!v) return '—';
  if (v === 'auto-daily') return '🕗 รอบอัตโนมัติ 8:00';
  if (v === 'orchestrator') return '🤖 Content Orchestrator';
  return `👤 ${v}`;
}

export default async function AutopostRunsPage() {
  const runs = await autopostRuns(80);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">รอบโพสต์ (Runs)</h1>
        <p className="mt-1 text-sm text-subtle">
          บัญชีไหนโพสต์อยู่ที่ worker (เครื่อง) ไหน · สั่งโดยใคร · กดเข้าไปดูว่าโพสต์ลงกลุ่มไหนจริง
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="card px-5 py-16 text-center text-subtle">
          ยังไม่มีรอบโพสต์ — หรือยังเชื่อมต่อฐานข้อมูล Auto-Post ไม่ได้
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-subtle">
                <th className="px-4 py-2.5 font-medium">บัญชี Facebook</th>
                <th className="px-4 py-2.5 font-medium">Worker (เครื่องที่รัน)</th>
                <th className="px-4 py-2.5 font-medium">สั่งโดย</th>
                <th className="px-4 py-2.5 font-medium">สถานะ</th>
                <th className="px-4 py-2.5 font-medium text-right">โพสต์สำเร็จ</th>
                <th className="px-4 py-2.5 font-medium">เวลา</th>
                <th className="px-4 py-2.5 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, cls: 'bg-black/5 text-ink' };
                return (
                  <tr key={r.id} className="border-b border-hairline/60 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-2.5 font-medium">{r.account || r.user_id || '—'}</td>
                    <td className="px-4 py-2.5">
                      {r.worker_id ? (
                        <span className="font-mono text-xs text-subtle">{r.worker_id}</span>
                      ) : r.status === 'queued' && r.pinned_worker ? (
                        <span className="text-xs text-amber-700">⏳ รอเครื่อง <span className="font-mono">{r.pinned_worker}</span></span>
                      ) : (
                        <span className="font-mono text-xs text-subtle">— (ยังไม่ถูกหยิบ)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-subtle">{whoRequested(r.requested_by)}</td>
                    <td className="px-4 py-2.5"><span className={`pill ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.posted}</td>
                    <td className="px-4 py-2.5 text-subtle">{fmt(r.started_at || r.created_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/autopost/runs/${r.id}`} className="text-accent hover:underline">
                        ดูโพสต์ →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-subtle">
        Worker = เครื่องที่รัน <code className="rounded bg-black/5 px-1">npm run worker:post</code> แล้วมาหยิบงานจากคิวกลาง ·
        “สั่งโดย” บอกว่างานมาจากคน กด, Content Orchestrator, หรือรอบอัตโนมัติ 8:00
      </p>
    </div>
  );
}
