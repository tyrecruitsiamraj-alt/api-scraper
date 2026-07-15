import Link from 'next/link';
import { FLOW_COLUMNS, MOCK_FLOW, type FlowStage, type MockFlowItem } from '@/lib/orchestrator-mock';

export const dynamic = 'force-dynamic';

const COL_TONE: Record<FlowStage, { head: string; ring: string }> = {
  new: { head: 'bg-black/[0.04] text-ink', ring: 'border-hairline' },
  researching: { head: 'bg-indigo-50 text-indigo-800', ring: 'border-indigo-100' },
  drafting: { head: 'bg-amber-50 text-amber-800', ring: 'border-amber-100' },
  pending_approval: { head: 'bg-orange-50 text-orange-800', ring: 'border-orange-100' },
  approved: { head: 'bg-teal-50 text-teal-800', ring: 'border-teal-100' },
  posting: { head: 'bg-blue-50 text-blue-800', ring: 'border-blue-100' },
  measuring: { head: 'bg-violet-50 text-violet-800', ring: 'border-violet-100' },
  low_engagement: { head: 'bg-red-50 text-red-800', ring: 'border-red-100' },
  done: { head: 'bg-green-50 text-green-800', ring: 'border-green-100' },
};

function Card({ item }: { item: MockFlowItem }) {
  const stuck = Boolean(item.blocked);
  return (
    <article
      className={`rounded-xl border bg-white p-3 shadow-sm ${
        stuck ? 'border-red-200 ring-1 ring-red-100' : 'border-hairline'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold tabular-nums text-accent">{item.request_no}</div>
          <div className="mt-0.5 truncate text-[13px] font-medium text-ink">{item.title}</div>
        </div>
        <span className="shrink-0 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[11px] tabular-nums text-subtle">
          ขาด {item.remaining_qty}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-subtle">
        {item.province} · {item.owner}
      </div>

      <div className="mt-2.5 rounded-lg bg-black/[0.025] px-2.5 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-subtle">กำลังทำ</div>
        <p className="mt-0.5 text-[12px] leading-snug text-ink">{item.doing}</p>
      </div>

      {stuck ? (
        <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-red-600">ติดอยู่</div>
          <p className="mt-0.5 text-[12px] leading-snug text-red-800">{item.blocked}</p>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-teal-700">✓ ไม่ติดค้าง</div>
      )}

      <div className="mt-2 text-[10px] text-subtle">{item.updated_ago}</div>
    </article>
  );
}

export default function OrchestratorFlowMockPage() {
  const byStatus = Object.fromEntries(FLOW_COLUMNS.map((c) => [c.key, [] as MockFlowItem[]])) as Record<
    FlowStage,
    MockFlowItem[]
  >;
  for (const item of MOCK_FLOW) byStatus[item.status].push(item);

  const blocked = MOCK_FLOW.filter((x) => x.blocked).length;
  const inFlight = MOCK_FLOW.filter((x) => x.status !== 'done').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">การไหลของใบงาน</h1>
            <span className="pill bg-amber-50 text-amber-800">MOCK DATA</span>
          </div>
          <p className="text-sm text-subtle">
            เห็นว่าใบขอเข้ามา → อยู่ขั้นไหน → กำลังทำอะไร → ติดอะไร · ตัวอย่างครบทุกสถานะ (ยังไม่ผูก ERP จริง)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orchestrator" className="btn-ghost btn-sm">
            ← ภาพรวมจริง
          </Link>
          <Link href="/orchestrator/imports" className="btn-secondary btn-sm">
            ใบขอ ERP
          </Link>
        </div>
      </div>

      {/* สรุปบนสุด */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs text-subtle">ใบงานทั้งหมด (mock)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{MOCK_FLOW.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-subtle">กำลังไหลในสาย</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{inFlight}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-subtle">ติดค้าง (มี blocker)</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${blocked ? 'text-red-600' : ''}`}>{blocked}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-subtle">เสร็จแล้ว</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-green-700">{byStatus.done.length}</div>
        </div>
      </div>

      {/* แถบลำดับสั้นๆ */}
      <div className="card overflow-x-auto p-4">
        <div className="mb-2 text-xs font-medium text-subtle">ลำดับ pipeline</div>
        <div className="flex min-w-max items-center gap-1.5 text-[12px]">
          {FLOW_COLUMNS.map((c, i) => (
            <div key={c.key} className="flex items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-1 font-medium ${COL_TONE[c.key].head}`}>
                {c.label}
                <span className="ml-1 tabular-nums opacity-70">({byStatus[c.key].length})</span>
              </span>
              {i < FLOW_COLUMNS.length - 1 && <span className="text-subtle/40">›</span>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-subtle">
          สาขาพิเศษ: <span className="font-medium text-red-700">คนสนใจน้อย</span> จะวนกลับไป “คิด content” อัตโนมัติ
        </p>
      </div>

      {/* บอร์ดคอลัมน์ — การไหล */}
      <div className="-mx-1 overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3 px-1">
          {FLOW_COLUMNS.map((col) => {
            const items = byStatus[col.key];
            const stuckN = items.filter((x) => x.blocked).length;
            const tone = COL_TONE[col.key];
            return (
              <section key={col.key} className={`flex w-[260px] shrink-0 flex-col rounded-2xl border ${tone.ring} bg-canvas/80`}>
                <header className={`rounded-t-2xl px-3 py-2.5 ${tone.head}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[13px] font-semibold">{col.label}</h2>
                    <span className="tabular-nums text-sm font-semibold">{items.length}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] opacity-80">{col.hint}</p>
                  {stuckN > 0 && (
                    <p className="mt-1 text-[10px] font-medium text-red-700">ติด {stuckN} ใบ</p>
                  )}
                </header>
                <div className="flex flex-1 flex-col gap-2.5 p-2.5">
                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-hairline px-3 py-8 text-center text-[11px] text-subtle">
                      ไม่มีใบงานในสเตจนี้
                    </div>
                  ) : (
                    items.map((item) => <Card key={item.id} item={item} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-subtle">
        นี่คือ mockup เพื่อดูกระบวนการ — ต่อไปจะสลับเป็นข้อมูลจาก <code className="text-[11px]">recruit_campaigns</code> จริง
      </p>
    </div>
  );
}
