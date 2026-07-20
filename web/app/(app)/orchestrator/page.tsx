import Link from 'next/link';
import {
  listSoRecruitPostingRequests,
  listCampaigns,
  listPendingApprovalContents,
  listFacebookAccounts,
  postQueueList,
  type CampaignRow,
  type PendingApproval,
} from '@/lib/repo';
import { startCampaignAction, approveContentAction } from '@/lib/actions';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

// map สถานะ campaign → คอลัมน์บนกระดาน
const DRAFTING = new Set(['new', 'researching', 'drafting', 'low_engagement']);
const QUEUE = new Set(['approved', 'posting']);
const DONE = new Set(['measuring', 'done']);

const STATUS_TH: Record<string, string> = {
  new: 'เพิ่งเริ่ม',
  researching: 'สำรวจแนว',
  drafting: 'AI กำลังคิด',
  low_engagement: 'คนสนใจน้อย — คิดใหม่',
  pending_approval: 'รอตรวจ',
  approved: 'อนุมัติแล้ว',
  posting: 'กำลังโพสต์',
  measuring: 'วัดผล',
  done: 'เสร็จ',
};

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
  } catch {
    return String(v);
  }
}

/** กล่องคอลัมน์ 1 stage */
function Column({ title, tint, count, children }: { title: string; tint: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-hairline bg-black/[0.015]">
      <div className={`flex items-center justify-between rounded-t-xl px-3 py-2 text-sm font-semibold ${tint}`}>
        <span>{title}</span>
        <span className="tabular-nums opacity-70">{count}</span>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {count === 0 ? <div className="px-2 py-6 text-center text-xs text-subtle/60">—</div> : children}
      </div>
    </div>
  );
}

export default async function OrchestratorPage() {
  const [reqs, campaigns, pending, fb, queue] = await Promise.all([
    listSoRecruitPostingRequests(),
    listCampaigns(),
    listPendingApprovalContents(),
    listFacebookAccounts(),
    postQueueList(),
  ]);

  const drafting = campaigns.filter((c) => DRAFTING.has(c.status));
  const review = campaigns.filter((c) => c.status === 'pending_approval');
  const posting = campaigns.filter((c) => QUEUE.has(c.status));
  const done = campaigns.filter((c) => DONE.has(c.status));
  const contentByCampaign = new Map<string, PendingApproval>(pending.map((p) => [p.campaign_id, p]));

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={8} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">กระดานงาน — ใบขอ → คิด → ตรวจ → โพสต์</h1>
          <p className="mt-1 text-sm text-subtle">
            งานไหลซ้าย→ขวาเอง · คำขอจาก So Recruit โผล่คอลัมน์แรก · ทำทุกอย่างในการ์ด (หน้านี้รีเฟรชเองทุก 8 วิ)
          </p>
        </div>
        <Link href="/orchestrator/imports" className="btn-secondary btn-sm">ดูคำขอทั้งหมด</Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {/* 1. คำขอใหม่ (So Recruit) */}
        <Column title="📥 คำขอใหม่" tint="bg-black/5 text-ink" count={reqs.length}>
          {reqs.map((r) => (
            <div key={r.request_no} className="card p-3">
              <div className="text-sm font-medium">{r.request_no}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-subtle">{r.erp_title || r.reason || '—'}</div>
              <div className="mt-1 text-[11px] text-subtle/70">{r.requested_by_name || '—'}</div>
              <form action={startCampaignAction} className="mt-2">
                <input type="hidden" name="requestNo" value={r.request_no} />
                <button className="btn-primary btn-sm w-full">▶ เริ่มคิด content</button>
              </form>
            </div>
          ))}
        </Column>

        {/* 2. กำลังคิด */}
        <Column title="✍️ กำลังคิด" tint="bg-amber-50 text-amber-700" count={drafting.length}>
          {drafting.map((c) => (
            <Link key={c.id} href={`/orchestrator/${c.id}`} className="card block p-3 hover:bg-black/[0.02]">
              <div className="text-sm font-medium">{c.title || c.request_no}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                {STATUS_TH[c.status] ?? c.status}
              </div>
              {c.status_note && <div className="mt-1 line-clamp-2 text-[11px] text-subtle">{c.status_note}</div>}
            </Link>
          ))}
        </Column>

        {/* 3. รอตรวจ — อนุมัติ+เลือกบัญชี ในการ์ดเลย */}
        <Column title="👀 รอตรวจ" tint="bg-orange-50 text-orange-700" count={review.length}>
          {review.map((c) => {
            const ct = contentByCampaign.get(c.id);
            return (
              <div key={c.id} className="card p-3">
                <Link href={`/orchestrator/${c.id}`} className="text-sm font-medium text-accent hover:underline">
                  {c.title || c.request_no}
                </Link>
                {ct?.has_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/campaign-content/${ct.id}/image`} alt="รูป" className="mt-2 h-24 w-full rounded-md object-cover" />
                )}
                {ct?.caption && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed">{ct.caption}</p>}
                {ct ? (
                  <form action={approveContentAction} className="mt-2 space-y-1.5">
                    <input type="hidden" name="contentId" value={ct.id} />
                    <input type="hidden" name="campaignId" value={c.id} />
                    <select name="fbAccountId" required defaultValue="" className="field h-8 w-full text-xs">
                      <option value="" disabled>เลือกบัญชี FB…</option>
                      {fb.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                    <button className="btn-primary btn-sm w-full">✓ อนุมัติ → ส่งโพสต์</button>
                  </form>
                ) : (
                  <div className="mt-2 text-[11px] text-subtle">รอร่างคอนเทนต์…</div>
                )}
              </div>
            );
          })}
        </Column>

        {/* 4. คิวโพสต์ */}
        <Column title="🚀 คิวโพสต์" tint="bg-blue-50 text-blue-700" count={posting.length}>
          {posting.map((c) => (
            <Link key={c.id} href={`/orchestrator/${c.id}`} className="card block p-3 hover:bg-black/[0.02]">
              <div className="text-sm font-medium">{c.title || c.request_no}</div>
              <div className="mt-1 text-xs text-blue-700">{STATUS_TH[c.status] ?? c.status}</div>
            </Link>
          ))}
          {queue.length > 0 && (
            <div className="mt-1 rounded-md bg-black/[0.02] px-2 py-1.5 text-[11px] text-subtle">
              คิวจริง {queue.length} งาน · {queue.filter((q) => q.status === 'running').length} กำลังโพสต์
            </div>
          )}
        </Column>

        {/* 5. เสร็จ / วัดผล */}
        <Column title="✅ เสร็จ / วัดผล" tint="bg-green-50 text-green-700" count={done.length}>
          {done.map((c) => (
            <Link key={c.id} href={`/orchestrator/${c.id}`} className="card block p-3 hover:bg-black/[0.02]">
              <div className="text-sm font-medium">{c.title || c.request_no}</div>
              <div className="mt-1 text-xs text-green-700">{STATUS_TH[c.status] ?? c.status}</div>
              <div className="mt-0.5 text-[11px] text-subtle/70">{fmtDate(c.updated_at)}</div>
            </Link>
          ))}
        </Column>
      </div>
    </div>
  );
}
