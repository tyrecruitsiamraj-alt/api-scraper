'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  approveContentAction,
  approveScrapeResultAction,
  measureCampaignAction,
  retryCampaignDraftAction,
  retryCampaignPostAction,
  startCampaignAction,
  startSoRecruitScrapeAction,
} from '@/lib/actions';

export type WorkCenterStage = 'intake' | 'working' | 'review' | 'completed' | 'attention';

export type WorkCenterItem = {
  id: string;
  kind: 'content' | 'scraping';
  stage: WorkCenterStage;
  title: string;
  requestNo: string | null;
  detail: string | null;
  requester: string | null;
  connector: string | null;
  statusLabel: string;
  createdAt: string;
  href: string | null;
  progress?: { got: number; target: number } | null;
  content?: { id: string; campaignId: string; caption: string | null; hasImage: boolean } | null;
  taskId?: string | null;
  campaignId?: string | null;
  nextAction?: 'retry_draft' | 'retry_post' | 'measure' | null;
};

type Option = { id: string; label: string };

const TABS: { stage: WorkCenterStage; label: string }[] = [
  { stage: 'intake', label: 'งานเข้าใหม่' },
  { stage: 'attention', label: 'ต้องแก้' },
  { stage: 'working', label: 'กำลังทำงาน' },
  { stage: 'review', label: 'รอตรวจผล' },
  { stage: 'completed', label: 'สำเร็จ' },
];

const STAGE_STYLE: Record<WorkCenterStage, string> = {
  intake: 'bg-amber-50 text-amber-700',
  working: 'bg-blue-50 text-blue-700',
  review: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
  attention: 'bg-red-50 text-red-700',
};

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function TypeBadge({ kind }: { kind: WorkCenterItem['kind'] }) {
  return (
    <span className={`pill ${kind === 'content' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>
      <span className={`dot ${kind === 'content' ? 'bg-orange-500' : 'bg-emerald-500'}`} />
      {kind === 'content' ? 'Content' : 'Scraping'}
    </span>
  );
}

function Timeline({ item }: { item: WorkCenterItem }) {
  const order: WorkCenterStage[] = ['intake', 'working', 'review', 'completed'];
  const current = item.stage === 'attention' ? Math.max(1, order.indexOf('working')) : order.indexOf(item.stage);
  const steps = [
    'รับคำขอจาก So Recruit',
    item.kind === 'content' ? 'AI สร้าง Content' : 'Worker ทำ Scraping',
    'ตรวจผลลัพธ์และอนุมัติ',
    item.kind === 'content' ? 'เผยแพร่และวัดผล' : 'ตรวจรับข้อมูลเรียบร้อย',
  ];
  return (
    <ol className="mt-4 space-y-0">
      {steps.map((step, index) => {
        const done = current > index;
        const active = current === index || (item.stage === 'attention' && index === current);
        return (
          <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
            {index < steps.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-line" />}
            <span className={`relative z-10 mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
              done ? 'border-green-500 bg-green-500' : active ? 'border-accent bg-accent' : 'border-line bg-white'
            }`} />
            <div>
              <div className={`text-sm ${active ? 'font-medium text-ink' : 'text-subtle'}`}>{step}</div>
              {active && <div className="mt-0.5 text-xs text-subtle">{item.statusLabel}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function WorkAction({ item, connectors, facebookAccounts }: {
  item: WorkCenterItem;
  connectors: Option[];
  facebookAccounts: Option[];
}) {
  if (item.campaignId && item.nextAction === 'retry_draft') {
    return (
      <form action={retryCampaignDraftAction}>
        <input type="hidden" name="campaignId" value={item.campaignId} />
        <button className="btn-primary w-full">ลองสร้าง Content ใหม่</button>
      </form>
    );
  }

  if (item.campaignId && item.nextAction === 'retry_post') {
    return (
      <form action={retryCampaignPostAction}>
        <input type="hidden" name="campaignId" value={item.campaignId} />
        <button className="btn-primary w-full">ลองโพสต์ใหม่</button>
      </form>
    );
  }

  if (item.campaignId && item.nextAction === 'measure') {
    return (
      <form action={measureCampaignAction}>
        <input type="hidden" name="campaignId" value={item.campaignId} />
        <button className="btn-primary w-full">ตรวจผล Engagement</button>
      </form>
    );
  }

  if (item.stage === 'intake' && item.requestNo) {
    if (item.kind === 'content') {
      return (
        <form action={startCampaignAction}>
          <input type="hidden" name="requestNo" value={item.requestNo} />
          <button className="btn-primary w-full">อนุมัติรับงาน Content</button>
        </form>
      );
    }
    return (
      <form action={startSoRecruitScrapeAction} className="space-y-2">
        <input type="hidden" name="requestNo" value={item.requestNo} />
        <label className="label" htmlFor={`connector-${item.id}`}>เลือก Connector ก่อนเริ่ม</label>
        <select id={`connector-${item.id}`} name="connectorId" required defaultValue="" className="field">
          <option value="" disabled>เลือกบัญชี Scraping…</option>
          {connectors.map((connector) => <option key={connector.id} value={connector.id}>{connector.label}</option>)}
        </select>
        <button className="btn-primary w-full" disabled={connectors.length === 0}>อนุมัติและเริ่ม Scraping</button>
        {connectors.length === 0 && (
          <Link href="/settings/connectors" className="block text-center text-xs text-accent hover:underline">เพิ่ม Connector ก่อน</Link>
        )}
      </form>
    );
  }

  if (item.stage === 'review' && item.kind === 'content' && item.content) {
    return (
      <form action={approveContentAction} className="space-y-2">
        <input type="hidden" name="contentId" value={item.content.id} />
        <input type="hidden" name="campaignId" value={item.content.campaignId} />
        <label className="label" htmlFor={`facebook-${item.id}`}>บัญชีสำหรับเผยแพร่</label>
        <select id={`facebook-${item.id}`} name="fbAccountId" required defaultValue="" className="field">
          <option value="" disabled>เลือกบัญชี Facebook…</option>
          {facebookAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
        <button className="btn-primary w-full" disabled={facebookAccounts.length === 0}>อนุมัติและส่งโพสต์</button>
      </form>
    );
  }

  if (item.stage === 'review' && item.kind === 'scraping' && item.taskId) {
    return (
      <form action={approveScrapeResultAction}>
        <input type="hidden" name="taskId" value={item.taskId} />
        <button className="btn-primary w-full">ตรวจรับผล Scraping</button>
      </form>
    );
  }

  if (item.href) return <Link href={item.href} className="btn-secondary w-full">เปิดรายละเอียด</Link>;
  return null;
}

export function WorkCenter({ items, connectors, facebookAccounts }: {
  items: WorkCenterItem[];
  connectors: Option[];
  facebookAccounts: Option[];
}) {
  const firstStage = TABS.find((tab) => items.some((item) => item.stage === tab.stage))?.stage ?? 'intake';
  const [stage, setStage] = useState<WorkCenterStage>(firstStage);
  const visible = useMemo(() => items.filter((item) => item.stage === stage), [items, stage]);
  const [selectedId, setSelectedId] = useState<string | null>(visible[0]?.id ?? null);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (!visible.some((item) => item.id === selectedId)) setSelectedId(visible[0]?.id ?? null);
  }, [visible, selectedId]);

  const counts = useMemo(() => {
    const result: Record<WorkCenterStage, number> = { intake: 0, working: 0, review: 0, completed: 0, attention: 0 };
    items.forEach((item) => { result[item.stage] += 1; });
    return result;
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ศูนย์งาน</h1>
          <p className="mt-1 text-sm text-subtle">รับงาน ตรวจงาน แก้ปัญหา และติดตามผลได้จากหน้าเดียว</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-subtle">งานเข้าใหม่</div><div className="mt-1 text-3xl font-semibold tabular-nums">{counts.intake}</div></div>
        <div className="card p-4"><div className="text-xs text-subtle">ต้องแก้ก่อนทำต่อ</div><div className="mt-1 text-3xl font-semibold tabular-nums text-red-600">{counts.attention}</div></div>
        <div className="card p-4"><div className="text-xs text-subtle">สำเร็จ</div><div className="mt-1 text-3xl font-semibold tabular-nums text-green-700">{counts.completed}</div></div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.stage}
            type="button"
            onClick={() => setStage(tab.stage)}
            className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition ${
              stage === tab.stage ? 'bg-accent text-white shadow-sm' : 'bg-black/[0.04] text-subtle hover:bg-black/[0.07] hover:text-ink'
            }`}
          >
            {tab.label} <span className="ml-1 tabular-nums opacity-75">{counts[tab.stage]}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">คิวงาน</h2>
            <span className="text-xs text-subtle">{visible.length} รายการ</span>
          </div>
          {visible.length === 0 ? (
            <div className="card px-5 py-16 text-center text-sm text-subtle">ไม่มีงานในสถานะนี้</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead><tr className="border-b border-line text-left text-xs text-subtle"><th className="px-4 py-3 font-medium">ประเภท</th><th className="px-4 py-3 font-medium">รายละเอียด</th><th className="px-4 py-3 font-medium">ผู้ขอ</th><th className="px-4 py-3 font-medium">สร้างเมื่อ</th><th className="px-4 py-3 font-medium">สถานะ</th></tr></thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer border-b border-line/60 last:border-0 ${selected?.id === item.id ? 'bg-accent/[0.06]' : 'hover:bg-black/[0.015]'}`}>
                      <td className="px-4 py-3"><TypeBadge kind={item.kind} /></td>
                      <td className="px-4 py-3"><div className="font-medium text-ink">{item.title}</div><div className="mt-0.5 text-xs text-subtle">{item.requestNo || item.detail || '—'}</div></td>
                      <td className="px-4 py-3 text-subtle">{item.requester || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-subtle">{fmtDate(item.createdAt)}</td>
                      <td className="px-4 py-3"><span className={`pill ${STAGE_STYLE[item.stage]}`}>{item.statusLabel}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card p-5 lg:sticky lg:top-24">
          {selected ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><TypeBadge kind={selected.kind} /><h2 className="mt-2 text-lg font-semibold leading-snug">{selected.title}</h2><div className="mt-1 text-xs text-subtle">{selected.requestNo || selected.id}</div></div>
                <span className={`pill shrink-0 ${STAGE_STYLE[selected.stage]}`}>{selected.statusLabel}</span>
              </div>
              {selected.content?.hasImage && <img src={`/api/campaign-content/${selected.content.id}/image`} alt="รูป Content" className="mt-4 h-40 w-full rounded-xl object-cover" />}
              {selected.detail && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{selected.detail}</p>}
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-subtle">ผู้ขอ</dt><dd>{selected.requester || '—'}</dd>
                <dt className="text-subtle">Connector</dt><dd>{selected.connector || 'ยังไม่เลือก'}</dd>
                {selected.progress && <><dt className="text-subtle">ความคืบหน้า</dt><dd>{selected.progress.got}/{selected.progress.target || '—'}</dd></>}
              </dl>
              <Timeline item={selected} />
              <div className="mt-5"><WorkAction item={selected} connectors={connectors} facebookAccounts={facebookAccounts} /></div>
            </div>
          ) : <div className="py-12 text-center text-sm text-subtle">เลือกรายการเพื่อดูรายละเอียด</div>}
        </aside>
      </div>
    </div>
  );
}
