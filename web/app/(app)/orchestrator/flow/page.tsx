import Link from 'next/link';
import { FLOW_COLUMNS, MOCK_FLOW, type FlowStage, type MockFlowItem } from '@/lib/orchestrator-mock';

export const dynamic = 'force-dynamic';

const BOX: Record<FlowStage, string> = {
  new: 'border-slate-200 bg-slate-50',
  researching: 'border-indigo-200 bg-indigo-50/70',
  drafting: 'border-amber-200 bg-amber-50/70',
  pending_approval: 'border-orange-200 bg-orange-50/70',
  approved: 'border-teal-200 bg-teal-50/70',
  posting: 'border-blue-200 bg-blue-50/70',
  measuring: 'border-violet-200 bg-violet-50/70',
  low_engagement: 'border-red-200 bg-red-50/70',
  done: 'border-green-200 bg-green-50/70',
};

const HEAD: Record<FlowStage, string> = {
  new: 'text-ink',
  researching: 'text-indigo-900',
  drafting: 'text-amber-900',
  pending_approval: 'text-orange-900',
  approved: 'text-teal-900',
  posting: 'text-blue-900',
  measuring: 'text-violet-900',
  low_engagement: 'text-red-900',
  done: 'text-green-900',
};

function Card({ item }: { item: MockFlowItem }) {
  const stuck = Boolean(item.blocked);
  return (
    <article className={`rounded-xl border bg-white p-3 ${stuck ? 'border-red-300 shadow-sm' : 'border-hairline'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tabular-nums text-accent">{item.request_no}</div>
          <div className="mt-0.5 text-[13px] font-medium text-ink">{item.title}</div>
        </div>
        <span className="shrink-0 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[11px] tabular-nums text-subtle">
          ขาด {item.remaining_qty}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-subtle">
        {item.province} · {item.owner} · {item.updated_ago}
      </div>
      <div className="mt-2 rounded-lg bg-black/[0.03] px-2.5 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-subtle">กำลังทำ</div>
        <p className="mt-0.5 text-[12px] leading-snug text-ink">{item.doing}</p>
      </div>
      {stuck ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600">ติดอยู่</div>
          <p className="mt-0.5 text-[12px] leading-snug text-red-800">{item.blocked}</p>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-teal-700">✓ ไม่ติดค้าง</div>
      )}
    </article>
  );
}

/** แผนภาพลูปหลัก — อ่านง่าย ก่อนลงกล่องรายใบ */
function LoopMap() {
  const main = [
    { t: 'งานใหม่', sub: 'รับใบขอ ERP' },
    { t: 'เช็ค Data เก่า', sub: 'แนวที่เคยเวิร์ค' },
    { t: 'คิด content', sub: 'แคปชัน + รูป' },
    { t: 'รออนุมัติ', sub: 'คนกดผ่าน' },
    { t: 'โพสต์ FB', sub: 'Autopost' },
    { t: 'วัดผล', sub: 'comment / คนทัก' },
    { t: 'เสร็จ', sub: 'เก็บแนวที่ดี' },
  ];
  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">ลูปการทำงาน (อ่านก่อน)</h2>
        <p className="mt-1 text-sm text-subtle">
          ใบงานใหม่จะต้อง <span className="font-medium text-ink">เช็ค Data เก่าก่อน</span> แล้วค่อยไหลไปคิด content /
          อนุมัติ / โพสต์ — ถ้าคนสนใจน้อยจะวนกลับไปเช็ค Data เก่าอีกครั้ง
        </p>
      </div>

      {/* สายหลัก */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-stretch gap-2">
          {main.map((s, i) => (
            <div key={s.t} className="flex items-center gap-2">
              <div
                className={`w-[118px] rounded-xl border px-3 py-3 text-center ${
                  s.t === 'เช็ค Data เก่า'
                    ? 'border-indigo-300 bg-indigo-50'
                    : s.t === 'เสร็จ'
                      ? 'border-green-300 bg-green-50'
                      : 'border-hairline bg-white'
                }`}
              >
                <div className="text-[13px] font-semibold text-ink">{s.t}</div>
                <div className="mt-0.5 text-[10px] text-subtle">{s.sub}</div>
              </div>
              {i < main.length - 1 && (
                <div className="flex flex-col items-center text-subtle">
                  <span className="text-lg leading-none">→</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ลูกศรเน้นหลังงานใหม่ */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950">
        <span className="font-semibold">จุดสำคัญ:</span> งานใหม่ → <strong>เช็ค Data เก่า</strong> (ดูโพสต์/แนวที่เคยได้ leads)
        → แล้วค่อยไป “คิด content” — ไม่ข้ามขั้นนี้
      </div>

      {/* ลูปวนกลับ */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-900">
        <span className="rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold">คนสนใจน้อย</span>
        <span className="text-lg font-bold">↩</span>
        <span className="rounded-lg border border-indigo-300 bg-white px-3 py-2 font-semibold text-indigo-900">
          เช็ค Data เก่า
        </span>
        <span className="text-lg">→</span>
        <span className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold text-amber-900">
          คิด content ใหม่
        </span>
        <span className="text-[13px] text-red-800/80">แล้วไหลอนุมัติ → โพสต์ → วัดผล อีกรอบ</span>
      </div>
    </div>
  );
}

function StageBox({
  col,
  items,
}: {
  col: (typeof FLOW_COLUMNS)[number];
  items: MockFlowItem[];
}) {
  const stuckN = items.filter((x) => x.blocked).length;
  return (
    <section className={`flex flex-col rounded-2xl border-2 ${BOX[col.key]}`}>
      <header className="border-b border-black/5 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className={`text-[15px] font-semibold ${HEAD[col.key]}`}>{col.label}</h2>
            <p className="mt-0.5 text-[12px] text-ink/70">{col.hint}</p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-semibold tabular-nums ${HEAD[col.key]}`}>{items.length}</div>
            <div className="text-[10px] text-subtle">ใบ</div>
          </div>
        </div>
        {stuckN > 0 && (
          <div className="mt-2 inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
            ติดค้าง {stuckN} ใบ
          </div>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 bg-white/50 px-3 py-10 text-center text-[12px] text-subtle">
            ว่าง — ไม่มีใบงานในกล่องนี้
          </div>
        ) : (
          items.map((item) => <Card key={item.id} item={item} />)
        )}
      </div>
    </section>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">การไหลของใบงาน</h1>
            <span className="pill bg-amber-50 text-amber-800">MOCK DATA</span>
          </div>
          <p className="text-sm text-subtle">แยกเป็นกล่องตามสถานะ · แต่ละใบบอกว่ากำลังทำอะไร / ติดอะไร</p>
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-subtle">ใบงานทั้งหมด</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{MOCK_FLOW.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-subtle">กำลังไหลในสาย</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{inFlight}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-subtle">ติดค้าง</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${blocked ? 'text-red-600' : ''}`}>{blocked}</div>
        </div>
      </div>

      <LoopMap />

      {/* กล่องสถานะ — กริดแยกชัด ไม่เลื่อนแนวนอนยาว */}
      <div>
        <h2 className="mb-3 text-base font-semibold">กล่องสถานะ (ใบงาน mock อยู่ในกล่อง)</h2>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {FLOW_COLUMNS.map((col) => (
            <StageBox key={col.key} col={col} items={byStatus[col.key]} />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-subtle">
        mockup เพื่อดูกระบวนการ — ต่อไปจะดึงจาก <code className="text-[11px]">recruit_campaigns</code> จริง
      </p>
    </div>
  );
}
