'use client';

import { useMemo, useState } from 'react';
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

export type Step = {
  label: string;
  state: 'done' | 'active' | 'failed' | 'skip' | 'todo';
};

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
  steps?: Step[];
};

type Option = { id: string; label: string };
export type FbAccountOption = { id: string; label: string; groupCount: number };

// เรียงตาม "ใครต้องขยับ" — งานพัง/ต้องแก้ ขึ้นบนสุดเสมอ, งานเสร็จจมล่างสุด
const STAGE_PRIORITY: Record<WorkCenterStage, number> = {
  attention: 0,
  review: 1,
  intake: 2,
  working: 3,
  completed: 4,
};

const STAGE_PILL: Record<WorkCenterStage, string> = {
  intake: 'bg-amber-50 text-amber-700',
  working: 'bg-blue-50 text-blue-700',
  review: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
  attention: 'bg-red-50 text-red-700',
};

const CARD_ACCENT: Record<WorkCenterStage, string> = {
  attention: 'border-red-200',
  review: 'border-accent/60 border-2',
  intake: 'border-amber-200',
  working: 'border-line',
  completed: 'border-line',
};

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function KindTag({ kind }: { kind: WorkCenterItem['kind'] }) {
  return <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle/70">{kind === 'content' ? 'Content' : 'Scraping'}</span>;
}

// ---- Stepper 6 ป้าย: done=ดำเข้ม✓, active=แดง(voltage), failed=แดงขอบ✕, skip=จุดจาง, todo=ว่าง ----
function StepDot({ step, index }: { step: Step; index: number }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none';
  switch (step.state) {
    case 'done':
      return (
        <span className={`${base} bg-ink text-white`}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      );
    case 'active':
      return (
        <span className={`${base} bg-accent text-white ring-4 ring-accent/15`}>{index + 1}</span>
      );
    case 'failed':
      return <span className={`${base} border border-accent bg-white text-accent`}>✕</span>;
    case 'skip':
      return <span className="flex h-6 w-6 shrink-0 items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-line" /></span>;
    default:
      return <span className={`${base} border border-line bg-white text-transparent`}>{index + 1}</span>;
  }
}

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="mt-4">
      <div className="flex">
        {steps.map((step, i) => {
          const lineBefore = i > 0 && steps[i - 1].state === 'done' ? 'bg-ink/25' : 'bg-line';
          const lineAfter = step.state === 'done' ? 'bg-ink/25' : 'bg-line';
          return (
            <div key={step.label} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <span className={`h-px flex-1 ${i === 0 ? 'opacity-0' : lineBefore}`} />
                <StepDot step={step} index={i} />
                <span className={`h-px flex-1 ${i === steps.length - 1 ? 'opacity-0' : lineAfter}`} />
              </div>
              <div
                className={`mt-1.5 text-center text-[9.5px] uppercase leading-tight tracking-[0.06em] ${
                  step.state === 'active'
                    ? 'font-semibold text-accent'
                    : step.state === 'failed'
                      ? 'font-semibold text-accent'
                      : step.state === 'done'
                        ? 'text-ink/70'
                        : step.state === 'skip'
                          ? 'text-subtle/50'
                          : 'text-subtle'
                }`}
              >
                {step.label}
                {step.state === 'skip' && <span className="block text-[8.5px]">ข้าม</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkAction({ item, connectors, facebookAccounts }: {
  item: WorkCenterItem;
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
}) {
  if (item.campaignId && item.nextAction === 'retry_draft') {
    return (
      <form action={retryCampaignDraftAction}>
        <input type="hidden" name="campaignId" value={item.campaignId} />
        <button className="btn-primary">ลองสร้าง Content ใหม่</button>
      </form>
    );
  }

  if (item.campaignId && item.nextAction === 'retry_post') {
    return (
      <form action={retryCampaignPostAction}>
        <input type="hidden" name="campaignId" value={item.campaignId} />
        <button className="btn-primary">ลองโพสต์ใหม่</button>
      </form>
    );
  }

  if (item.campaignId && item.nextAction === 'measure') {
    return (
      <form action={measureCampaignAction}>
        <input type="hidden" name="campaignId" value={item.campaignId} />
        <button className="btn-primary">ตรวจผล Engagement</button>
      </form>
    );
  }

  if (item.stage === 'intake' && item.requestNo) {
    if (item.kind === 'content') {
      return (
        <form action={startCampaignAction}>
          <input type="hidden" name="requestNo" value={item.requestNo} />
          <button className="btn-primary">อนุมัติรับงาน Content</button>
        </form>
      );
    }
    return (
      <form action={startSoRecruitScrapeAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="requestNo" value={item.requestNo} />
        <div>
          <label className="label" htmlFor={`connector-${item.id}`}>เลือก Connector</label>
          <select id={`connector-${item.id}`} name="connectorId" required defaultValue="" className="field">
            <option value="" disabled>เลือกบัญชี Scraping…</option>
            {connectors.map((connector) => <option key={connector.id} value={connector.id}>{connector.label}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={connectors.length === 0}>อนุมัติและเริ่ม Scraping</button>
        {connectors.length === 0 && (
          <Link href="/settings/connectors" className="text-xs text-accent hover:underline">เพิ่ม Connector ก่อน</Link>
        )}
      </form>
    );
  }

  if (item.stage === 'review' && item.kind === 'content' && item.content) {
    const readyAccounts = facebookAccounts.filter((a) => a.groupCount > 0);
    const noAccount = facebookAccounts.length === 0;
    const noReady = readyAccounts.length === 0;
    // เลือกบัญชีที่พร้อม (มีกลุ่ม) เป็นค่าเริ่มต้น — บัญชีที่ไม่มีกลุ่มเลือกไม่ได้ (กันโพสต์ไปตายทีหลัง)
    return (
      <form action={approveContentAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="contentId" value={item.content.id} />
        <input type="hidden" name="campaignId" value={item.content.campaignId} />
        <div>
          <label className="label" htmlFor={`facebook-${item.id}`}>บัญชีสำหรับเผยแพร่</label>
          <select id={`facebook-${item.id}`} name="fbAccountId" required defaultValue="" className="field">
            <option value="" disabled>เลือกบัญชี Facebook…</option>
            {facebookAccounts.map((account) => (
              <option key={account.id} value={account.id} disabled={account.groupCount === 0}>
                {account.label}{account.groupCount === 0 ? ' (ยังไม่มีกลุ่ม)' : ` · ${account.groupCount} กลุ่ม`}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={noReady}>
          {noAccount ? 'ยังไม่มีบัญชี' : noReady ? 'ทุกบัญชียังไม่มีกลุ่ม' : 'อนุมัติและโพสต์'}
        </button>
        {noReady && (
          <Link href="/settings/posting" className="text-xs text-accent hover:underline">
            {noAccount ? 'เพิ่มบัญชี Facebook ก่อน' : 'เลือกกลุ่มให้บัญชีก่อน'}
          </Link>
        )}
      </form>
    );
  }

  if (item.stage === 'review' && item.kind === 'scraping' && item.taskId) {
    return (
      <form action={approveScrapeResultAction}>
        <input type="hidden" name="taskId" value={item.taskId} />
        <button className="btn-primary">ตรวจรับผล Scraping</button>
      </form>
    );
  }

  if (item.href) return <Link href={item.href} className="btn-secondary">เปิดรายละเอียด</Link>;
  return null;
}

// ---- แถบ "งานตั้งค่าที่ค้าง": สแกนสิ่งที่ถ้าไม่ทำแล้วงานเดินต่อไม่ได้ แล้วเด้งขึ้นให้ทำก่อน ----
function Readiness({ facebookAccounts }: { facebookAccounts: FbAccountOption[] }) {
  const problems: { text: string; href: string; btn: string }[] = [];
  if (facebookAccounts.length === 0) {
    problems.push({
      text: 'ยังไม่มีบัญชี Facebook สำหรับโพสต์ — งาน Auto post จะทำไม่ได้',
      href: '/settings/connectors',
      btn: 'เพิ่มบัญชี',
    });
  } else {
    const noGroup = facebookAccounts.filter((a) => a.groupCount === 0);
    if (noGroup.length > 0) {
      const names = noGroup.map((a) => a.label).join(', ');
      problems.push({
        text: `บัญชี ${names} ยังไม่ได้เลือกกลุ่มโพสต์ — งานที่ต้อง Auto post จะค้างที่ป้ายอนุมัติ`,
        href: '/settings/posting',
        btn: 'เลือกกลุ่มตอนนี้',
      });
    }
  }
  if (problems.length === 0) return null;
  return (
    <div className="space-y-2">
      {problems.map((p) => (
        <div key={p.text} className="flex flex-wrap items-center gap-3 border-l-2 border-amber-500 bg-amber-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-amber-700">ตั้งค่าที่ต้องทำก่อนงานถึงจะเดิน</div>
            <div className="mt-1 text-[13px] text-amber-800">{p.text}</div>
          </div>
          <Link href={p.href} className="shrink-0 bg-amber-600 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white hover:bg-amber-700">
            {p.btn}
          </Link>
        </div>
      ))}
    </div>
  );
}

function WorkItemCard({ item, connectors, facebookAccounts }: {
  item: WorkCenterItem;
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
}) {
  const showImage = item.stage === 'review' && item.content?.hasImage;
  return (
    <div className={`card p-4 sm:p-5 ${CARD_ACCENT[item.stage]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-medium leading-tight text-ink">
            {item.title}<KindTag kind={item.kind} />
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.04em] text-subtle/80">
            {item.requestNo || item.id.split(':')[1] || item.id}
            {item.requester ? ` · ${item.requester}` : ''} · {fmtDate(item.createdAt)}
          </div>
        </div>
        <span className={`pill shrink-0 ${STAGE_PILL[item.stage]}`}>{item.statusLabel}</span>
      </div>

      {item.steps && item.steps.length > 0 && <Stepper steps={item.steps} />}

      {(showImage || item.detail) && (
        <div className="mt-4 flex gap-3">
          {showImage && item.content && (
            <img
              src={`/api/campaign-content/${item.content.id}/image`}
              alt="รูป Content"
              className="h-16 w-16 shrink-0 border border-line object-cover"
            />
          )}
          {item.detail && (
            <p className={`min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed ${item.stage === 'attention' ? 'border-l-2 border-accent bg-red-50 px-3 py-2 text-red-700' : 'text-ink/70'}`}>
              {item.detail.length > 240 ? `${item.detail.slice(0, 240)}…` : item.detail}
            </p>
          )}
        </div>
      )}

      {item.progress && item.progress.target > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[11px] uppercase tracking-[0.06em] text-subtle">
            <span>ดึงผู้สมัคร</span>
            <span className="tabular-nums text-ink">{item.progress.got} / {item.progress.target}</span>
          </div>
          <div className="h-1 overflow-hidden bg-black/[0.06]">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(100, Math.round((item.progress.got / item.progress.target) * 100))}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <WorkAction item={item} connectors={connectors} facebookAccounts={facebookAccounts} />
      </div>
    </div>
  );
}

export function WorkCenter({ items, connectors, facebookAccounts }: {
  items: WorkCenterItem[];
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
}) {
  const [showDone, setShowDone] = useState(false);

  const counts = useMemo(() => {
    const result: Record<WorkCenterStage, number> = { intake: 0, working: 0, review: 0, completed: 0, attention: 0 };
    items.forEach((item) => { result[item.stage] += 1; });
    return result;
  }, [items]);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const pa = STAGE_PRIORITY[a.stage];
        const pb = STAGE_PRIORITY[b.stage];
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [items],
  );

  const active = sorted.filter((item) => item.stage !== 'completed');
  const done = sorted.filter((item) => item.stage === 'completed');

  const STAT = [
    { label: 'ต้องแก้', value: counts.attention, tone: 'text-accent', bar: 'bg-accent' },
    { label: 'รอคุณ', value: counts.intake + counts.review, tone: 'text-amber-600', bar: 'bg-amber-500' },
    { label: 'ระบบกำลังทำ', value: counts.working, tone: 'text-ink', bar: 'bg-ink/40' },
    { label: 'เสร็จ', value: counts.completed, tone: 'text-emerald-700', bar: 'bg-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow text-accent">SO Recruitment</div>
        <h1 className="mt-1 text-[28px] font-medium tracking-tight">ศูนย์งาน</h1>
        <p className="mt-1 text-sm text-subtle">งานจาก So Recruit ทุกใบ — รับงาน ตรวจ อนุมัติ และติดตามจนเสร็จ ในหน้าเดียว</p>
      </div>

      <Readiness facebookAccounts={facebookAccounts} />

      <div className="grid grid-cols-2 border border-line bg-white sm:grid-cols-4">
        {STAT.map((s, i) => (
          <div key={s.label} className={`relative px-5 py-4 ${i > 0 ? 'border-l border-line' : ''}`}>
            <span className={`absolute left-0 top-0 h-full w-[3px] ${s.value > 0 ? s.bar : 'bg-transparent'}`} />
            <div className="eyebrow">{s.label}</div>
            <div className={`mt-1.5 text-[30px] font-medium leading-none tabular-nums ${s.value > 0 ? s.tone : 'text-subtle/40'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {active.length === 0 ? (
        <div className="border border-line bg-white px-5 py-16 text-center text-sm text-subtle">ไม่มีงานค้าง — ทุกอย่างเรียบร้อย</div>
      ) : (
        <div className="space-y-3">
          {active.map((item) => (
            <WorkItemCard key={item.id} item={item} connectors={connectors} facebookAccounts={facebookAccounts} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
          >
            <span className="text-[9px]">{showDone ? '▼' : '▶'}</span> งานที่เสร็จแล้ว · {done.length}
          </button>
          {showDone && (
            <div className="mt-3 space-y-3">
              {done.map((item) => (
                <WorkItemCard key={item.id} item={item} connectors={connectors} facebookAccounts={facebookAccounts} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
