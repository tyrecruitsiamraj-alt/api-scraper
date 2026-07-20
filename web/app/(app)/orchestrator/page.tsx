import Link from 'next/link';
import { campaignStats, listCampaigns } from '@/lib/repo';

export const dynamic = 'force-dynamic';

// pipeline stages ตามลำดับการไหล (ตรงกับ recruit_campaigns.status)
const FLOW = [
  { key: 'new', label: 'งานใหม่' },
  { key: 'researching', label: 'สำรวจแนว' },
  { key: 'drafting', label: 'คิด content' },
  { key: 'pending_approval', label: 'รออนุมัติ' },
  { key: 'approved', label: 'อนุมัติแล้ว' },
  { key: 'posting', label: 'กำลังโพสต์' },
  { key: 'measuring', label: 'วัดผล' },
  { key: 'done', label: 'เสร็จ' },
] as const;

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

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return String(v);
  }
}

/** โหนดสเตจในแถบ pipeline — count>0 = เด่น, ว่าง = จาง */
function FlowNode({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <div className="flex min-w-[84px] flex-col items-center gap-1">
      <div
        className={`grid h-14 w-full place-items-center rounded-xl border text-2xl font-semibold tabular-nums ${
          active ? 'border-accent/30 bg-accent/10 text-ink' : 'border-hairline bg-black/[0.015] text-subtle/40'
        }`}
      >
        {count}
      </div>
      <div className={`text-center text-[11px] leading-tight ${active ? 'text-ink' : 'text-subtle'}`}>{label}</div>
    </div>
  );
}

export default async function OrchestratorPage() {
  const [stats, campaigns] = await Promise.all([campaignStats(), listCampaigns()]);

  const lowEng = stats.byStatus['low_engagement'] ?? 0;
  const doneCount = stats.byStatus['done'] ?? 0;
  const inFlight = stats.total - doneCount; // งานที่ยังวิ่งอยู่ในสาย (รวม low_engagement)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content Orchestrator</h1>
          <p className="mt-1 text-sm text-subtle">ใบขอที่หาคนไม่ได้ → คิด content → อนุมัติ → โพสต์ → วัดผล</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orchestrator/flow" className="btn-secondary">
            ดูการไหล (mock)
          </Link>
          <Link href="/orchestrator/imports" className="btn-primary">+ คำขอโพสจาก So Recruit</Link>
        </div>
      </div>

      {/* แถบ pipeline — เห็นการไหลของงานซ้าย→ขวา */}
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="font-semibold">การไหลของงาน</span>
          <span className="text-subtle">กำลังวิ่ง <span className="font-semibold text-ink tabular-nums">{inFlight}</span></span>
          <span className="text-subtle">เสร็จ <span className="font-semibold text-green-700 tabular-nums">{doneCount}</span></span>
          {lowEng > 0 && (
            <span className="text-subtle">ต้องคิดใหม่ <span className="font-semibold text-red-600 tabular-nums">{lowEng}</span></span>
          )}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {FLOW.map((s, i) => {
            const count = stats.byStatus[s.key] ?? 0;
            return (
              <div key={s.key} className="flex items-center gap-1">
                <FlowNode label={s.label} count={count} active={count > 0} />
                {i < FLOW.length - 1 && <span className="px-0.5 text-lg text-subtle/50">›</span>}
              </div>
            );
          })}
        </div>

        {/* สาขาวนกลับ: คนสนใจน้อย → กลับไปคิด content ใหม่ */}
        {lowEng > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            <span className="font-semibold tabular-nums">{lowEng}</span>
            <span>งานคนสนใจน้อย</span>
            <span className="text-red-400">↩</span>
            <span>ระบบให้ AI คิด content ใหม่อัตโนมัติ (วนกลับ “คิด content”)</span>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">งานทั้งหมด ({stats.total})</h2>
        {campaigns.length === 0 ? (
          <div className="card px-5 py-16 text-center text-subtle">
            ยังไม่มีงาน — เริ่มจากหน้า <Link href="/orchestrator/imports" className="text-accent hover:underline">คำขอโพสจาก So Recruit</Link>
          </div>
        ) : (
          <div className="card overflow-x-auto">
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
