import Link from 'next/link';
import { notFound } from 'next/navigation';
import { autopostRun, autopostRunPosts } from '@/lib/repo';

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

function Field({ label, value }: { label: string; value?: unknown }) {
  const v = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm">{v}</dd>
    </div>
  );
}

export default async function AutopostRunDetail({ params }: { params: { id: string } }) {
  const run = await autopostRun(params.id);
  if (!run) notFound();
  const posts = run.run_id ? await autopostRunPosts(run.run_id) : [];
  const st = STATUS[run.status] ?? { label: run.status, cls: 'bg-black/5 text-ink' };
  const posted = posts.filter((p) => p.post_link && p.post_link.trim()).length;

  return (
    <div className="space-y-6">
      <Link href="/autopost/runs" className="text-sm text-subtle hover:text-accent">← กลับ รอบโพสต์</Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{run.account || run.user_id || 'รอบโพสต์'}</h1>
            <p className="mt-1 text-sm text-subtle">โพสต์สำเร็จ {posted} จาก {posts.length} กลุ่ม</p>
          </div>
          <span className={`pill ${st.cls}`}>{st.label}</span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Worker (เครื่อง)" value={run.worker_id} />
          <Field label="สั่งโดย" value={run.requested_by === 'auto-daily' ? 'รอบอัตโนมัติ 8:00' : run.requested_by} />
          <Field label="เริ่ม" value={fmt(run.started_at)} />
          <Field label="เสร็จ" value={fmt(run.finished_at)} />
        </dl>
        {run.error && <p className="mt-3 text-sm text-red-600">ข้อผิดพลาด: {run.error}</p>}
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">โพสต์ลงกลุ่ม (จริง)</h2>
        {posts.length === 0 ? (
          <div className="card border-dashed p-6 text-center text-sm text-subtle">
            ยังไม่มีบันทึกการโพสต์ต่อกลุ่มสำหรับรอบนี้ (อาจยังโพสต์ไม่เสร็จ หรือยังไม่ถูกหยิบ)
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-subtle">
                  <th className="px-4 py-2.5 font-medium">งาน</th>
                  <th className="px-4 py-2.5 font-medium">กลุ่ม Facebook</th>
                  <th className="px-4 py-2.5 font-medium text-right">คอมเมนต์</th>
                  <th className="px-4 py-2.5 font-medium">เวลา</th>
                  <th className="px-4 py-2.5 font-medium text-right">ลิงก์</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-hairline/60 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-2.5">{p.job_title || '—'}</td>
                    <td className="px-4 py-2.5">{p.group_name || p.group_id || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.comment_count}</td>
                    <td className="px-4 py-2.5 text-subtle">{fmt(p.created_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.post_link && p.post_link.trim() ? (
                        <a href={p.post_link} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          เปิดโพสต์จริง ↗
                        </a>
                      ) : (
                        <span className="text-subtle">ไม่มีลิงก์ (โพสต์ไม่สำเร็จ?)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
