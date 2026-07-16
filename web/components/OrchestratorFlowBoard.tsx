'use client';

import { useMemo, useRef, useState } from 'react';
import { FLOW_COLUMNS, MOCK_FLOW, type FlowStage, type MockFlowItem } from '@/lib/orchestrator-mock';

const BOX_ACTIVE: Record<FlowStage, string> = {
  new: 'border-slate-500 bg-slate-100 ring-2 ring-slate-300',
  researching: 'border-indigo-500 bg-indigo-100 ring-2 ring-indigo-300',
  drafting: 'border-amber-500 bg-amber-100 ring-2 ring-amber-300',
  pending_approval: 'border-orange-500 bg-orange-100 ring-2 ring-orange-300',
  approved: 'border-teal-500 bg-teal-100 ring-2 ring-teal-300',
  posting: 'border-blue-500 bg-blue-100 ring-2 ring-blue-300',
  measuring: 'border-violet-500 bg-violet-100 ring-2 ring-violet-300',
  low_engagement: 'border-red-500 bg-red-100 ring-2 ring-red-300',
  done: 'border-green-500 bg-green-100 ring-2 ring-green-300',
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

const LOOP_MAIN: { key: FlowStage; t: string; sub: string }[] = [
  { key: 'new', t: 'งานใหม่', sub: 'รับใบขอ ERP' },
  { key: 'researching', t: 'เช็ค Data เก่า', sub: 'แนวที่เคยเวิร์ค' },
  { key: 'drafting', t: 'คิด content', sub: 'แคปชัน + รูป' },
  { key: 'pending_approval', t: 'รออนุมัติ', sub: 'คนกดผ่าน' },
  { key: 'approved', t: 'อนุมัติแล้ว', sub: 'พร้อมเข้าคิว' },
  { key: 'posting', t: 'Post งาน', sub: 'ลงกลุ่ม Facebook' },
  { key: 'measuring', t: 'วัดผล', sub: 'comment / คนทัก' },
  { key: 'done', t: 'เสร็จ', sub: 'เก็บแนวที่ดี' },
];

function JobCard({ item }: { item: MockFlowItem }) {
  const stuck = Boolean(item.blocked);
  return (
    <article className={`rounded-xl border bg-white p-4 ${stuck ? 'border-red-300 shadow-sm' : 'border-hairline'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tabular-nums text-accent">{item.request_no}</div>
          <div className="mt-0.5 text-[15px] font-medium text-ink">{item.title}</div>
        </div>
        <span className="shrink-0 rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] tabular-nums text-subtle">
          ขาด {item.remaining_qty}
        </span>
      </div>
      <div className="mt-1.5 text-[12px] text-subtle">
        {item.province} · {item.owner} · {item.updated_ago}
      </div>
      <div className="mt-3 rounded-lg bg-black/[0.03] px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-subtle">กำลังทำ</div>
        <p className="mt-1 text-[13px] leading-snug text-ink">{item.doing}</p>
      </div>
      {stuck ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600">ติดอยู่</div>
          <p className="mt-1 text-[13px] leading-snug text-red-800">{item.blocked}</p>
        </div>
      ) : (
        <div className="mt-3 text-[12px] text-teal-700">✓ ไม่ติดค้าง</div>
      )}
    </article>
  );
}

function LoopStep({
  stage,
  label,
  sub,
  count,
  stuck,
  active,
  onSelect,
  highlight,
}: {
  stage: FlowStage;
  label: string;
  sub?: string;
  count: number;
  stuck: number;
  active: boolean;
  onSelect: (s: FlowStage) => void;
  highlight?: 'indigo' | 'green' | 'red' | 'amber' | 'default';
}) {
  const idle =
    highlight === 'indigo'
      ? 'border-indigo-300 bg-indigo-50 hover:border-indigo-400'
      : highlight === 'green'
        ? 'border-green-300 bg-green-50 hover:border-green-400'
        : highlight === 'red'
          ? 'border-red-300 bg-white hover:border-red-400'
          : highlight === 'amber'
            ? 'border-amber-300 bg-white hover:border-amber-400'
            : 'border-hairline bg-white hover:border-black/25';

  return (
    <button
      type="button"
      onClick={() => onSelect(stage)}
      className={`w-[122px] rounded-xl border px-3 py-3 text-center transition ${
        active ? BOX_ACTIVE[stage] : idle
      }`}
    >
      <div className={`text-[13px] font-semibold ${active ? HEAD[stage] : 'text-ink'}`}>{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-subtle">{sub}</div>}
      <div className={`mt-1.5 text-lg font-bold tabular-nums ${active ? HEAD[stage] : 'text-ink'}`}>{count}</div>
      <div className="text-[10px] text-subtle">ใบ</div>
      {stuck > 0 && <div className="mt-1 text-[10px] font-medium text-red-600">ติด {stuck}</div>}
    </button>
  );
}

function LoopMap({
  selected,
  byStatus,
  onSelect,
}: {
  selected: FlowStage;
  byStatus: Record<FlowStage, MockFlowItem[]>;
  onSelect: (s: FlowStage) => void;
}) {
  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">ลูปการทำงาน</h2>
        <p className="mt-1 text-sm text-subtle">กดกล่องสถานะเพื่อดูใบงานที่ค้างในขั้นนั้น</p>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max items-stretch gap-2">
          {LOOP_MAIN.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <LoopStep
                stage={s.key}
                label={s.t}
                sub={s.sub}
                count={byStatus[s.key].length}
                stuck={byStatus[s.key].filter((x) => x.blocked).length}
                active={selected === s.key}
                onSelect={onSelect}
                highlight={s.key === 'researching' ? 'indigo' : s.key === 'done' ? 'green' : 'default'}
              />
              {i < LOOP_MAIN.length - 1 && <span className="text-lg text-subtle">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950">
        <span className="font-semibold">จุดสำคัญ:</span> งานใหม่ต้อง <strong>เช็ค Data เก่า</strong> ก่อน — ไม่ข้ามขั้นนี้
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-900">
        <LoopStep
          stage="low_engagement"
          label="คนสนใจน้อย"
          count={byStatus.low_engagement.length}
          stuck={byStatus.low_engagement.filter((x) => x.blocked).length}
          active={selected === 'low_engagement'}
          onSelect={onSelect}
          highlight="red"
        />
        <span className="text-lg font-bold">↩</span>
        <LoopStep
          stage="researching"
          label="เช็ค Data เก่า"
          count={byStatus.researching.length}
          stuck={byStatus.researching.filter((x) => x.blocked).length}
          active={selected === 'researching'}
          onSelect={onSelect}
          highlight="indigo"
        />
        <span className="text-lg">→</span>
        <LoopStep
          stage="drafting"
          label="คิด content ใหม่"
          count={byStatus.drafting.length}
          stuck={byStatus.drafting.filter((x) => x.blocked).length}
          active={selected === 'drafting'}
          onSelect={onSelect}
          highlight="amber"
        />
      </div>
    </div>
  );
}

export function OrchestratorFlowBoard() {
  const byStatus = useMemo(() => {
    const map = Object.fromEntries(FLOW_COLUMNS.map((c) => [c.key, [] as MockFlowItem[]])) as Record<
      FlowStage,
      MockFlowItem[]
    >;
    for (const item of MOCK_FLOW) map[item.status].push(item);
    return map;
  }, []);

  const [selected, setSelected] = useState<FlowStage>('new');
  const detailRef = useRef<HTMLElement>(null);

  function selectStage(stage: FlowStage) {
    setSelected(stage);
    // เลื่อนไปดูรายการงานของกล่องที่กด
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const col = FLOW_COLUMNS.find((c) => c.key === selected)!;
  const items = byStatus[selected];
  const stuckN = items.filter((x) => x.blocked).length;
  const blocked = MOCK_FLOW.filter((x) => x.blocked).length;
  const inFlight = MOCK_FLOW.filter((x) => x.status !== 'done').length;

  return (
    <div className="space-y-6">
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

      <LoopMap selected={selected} byStatus={byStatus} onSelect={selectStage} />

      <section
        ref={detailRef}
        className={`scroll-mt-4 rounded-2xl border-2 p-4 ${BOX_ACTIVE[selected].replace('ring-2', '')}`}
      >
        <header className="mb-4 border-b border-black/5 pb-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className={`text-lg font-semibold ${HEAD[selected]}`}>{col.label}</h2>
              <p className="mt-0.5 text-sm text-subtle">{col.hint}</p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold tabular-nums ${HEAD[selected]}`}>{items.length}</div>
              <div className="text-xs text-subtle">ใบในกล่องนี้</div>
            </div>
          </div>
          {stuckN > 0 && (
            <div className="mt-2 inline-flex rounded-full bg-red-100 px-3 py-1 text-[12px] font-medium text-red-700">
              ติดค้างในกล่องนี้ {stuckN} ใบ
            </div>
          )}
        </header>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-16 text-center text-sm text-subtle">
            ไม่มีใบงานค้างในกล่องนี้
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <JobCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
