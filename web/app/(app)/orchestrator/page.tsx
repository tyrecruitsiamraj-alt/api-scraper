import Link from 'next/link';
import { campaignStats, listCampaigns } from '@/lib/repo';

export const dynamic = 'force-dynamic';

// pipeline stages ตามลำดับ (ตรงกับ recruit_campaigns.status)
const STAGES = ['new', 'researching', 'drafting', 'pending_approval', 'approved', 'posting', 'measuring', 'done'] as const;
const STAGE_LABEL: Record<string, string> = {
  new: 'งานใหม่',
  researching: 'สำรวจแนว content',
  drafting: 'กำลังทำ content',
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  posting: 'กำลังโพสต์',
  measuring: 'วัดผล',
  done: 'เสร็จ',
  low_engagement: 'คนสนใจน้อย (คิดใหม่)',
};
const STAGE_CLS: Record<string, string> = {
  new: 'bg-black/5 text-ink',
  researching: 'bg-indigo-50 text-indigo-700',
  drafting: 'bg-amber-50 text-amber-700',
  pending_approval: 'bg-orange-50 text-orange-700',
  approved: 'bg-teal-50 text-teal-700',
  posting: 'bg-blue-50 text-blue-700',
  measuring: 'bg-violet-50 text-violet-700',
  done: 'bg-green-50 text-green-700',
  low_engagement: 'bg-red-50 text-red-700',
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return String(v);
  }
}

export default async function OrchestratorPage() {
  const [stats, campaigns] = await Promise.all([campaignStats(), listCampaigns()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content Orchestrator</h1>
          <p className="mt-1 text-sm text-subtle">ใบขอที่หาคนไม่ได้ → คิด content → อนุมัติ → โพสต์ → วัดผล</p>
        </div>
        <Link href="/orchestrator/imports" className="btn-primary">+ ใบขอจาก ERP</Link>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        {STAGES.map((s) => (
          <Stat key={s} label={STAGE_LABEL[s]} value={stats.byStatus[s] ?? 0} />
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">งานทั้งหมด ({stats.total})</h2>
        {campaigns.length === 0 ? (
          <div className="card px-5 py-16 text-center text-subtle">
            ยังไม่มีงาน — เริ่มจากหน้า <Link href="/orchestrator/imports" className="text-accent hover:underline">ใบขอจาก ERP</Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-subtle">
                  <th className="px-4 py-2.5 font-medium">ใบขอ</th>
                  <th className="px-4 py-2.5 font-medium">ตำแหน่ง/งาน</th>
                  <th className="px-4 py-2.5 font-medium">จังหวัด</th>
                  <th className="px-4 py-2.5 font-medium text-right">ขาด</th>
                  <th className="px-4 py-2.5 font-medium">สถานะ</th>
                  <th className="px-4 py-2.5 font-medium">อัปเดต</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-hairline/60 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-2.5">
                      <Link href={`/orchestrator/${c.id}`} className="font-medium text-accent hover:underline">
                        {c.request_no || c.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{c.title || '—'}</td>
                    <td className="px-4 py-2.5 text-subtle">{c.province || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.remaining_qty ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`pill ${STAGE_CLS[c.status] ?? 'bg-black/5 text-ink'}`}>
                        {STAGE_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-subtle">{fmtDate(c.updated_at)}</td>
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
