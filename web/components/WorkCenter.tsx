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
  return <span className="text-xs font-normal text-subtle">· งาน {kind === 'content' ? 'Content' : 'Scraping'}</span>;
}

// ---- Stepper 6 ป้าย แนวนอน: done=เขียว✓, active=น้ำเงินเลข, failed=แดง✕, skip=จุดประ», todo=ว่าง ----
function StepDot({ step, index }: { step: Step; index: number }) {
  const base = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium';
  switch (step.state) {
    case 'done':
      return <span className={`${base} bg-green-100 text-green-700`}>✓</span>;
    case 'active':
      return <span className={`${base} bg-accent text-white`}>{index + 1}</span>;
    case 'failed':
      return <span className={`${base} bg-red-100 text-red-700`}>✕</span>;
    case 'skip':
      return <span className={`${base} border border-dashed border-line text-subtle`}>»</span>;
    default:
      return <span className={`${base} border border-line bg-white`} />;
  }
}

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="mt-3">
      <div className="flex">
        {steps.map((step, i) => {
          const lineBefore = i > 0 && (steps[i - 1].state === 'done') ? 'bg-green-300' : 'bg-line';
          const lineAfter = step.state === 'done' ? 'bg-green-300' : 'bg-line';
          return (
            <div key={step.label} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : lineBefore}`} />
                <StepDot step={step} index={i} />
                <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : lineAfter}`} />
              </div>
              <div
                className={`mt-1 text-center text-[10px] leading-tight ${
                  step.state === 'active'
                    ? 'font-medium text-accent'
                    : step.state === 'failed'
                      ? 'font-medium text-red-600'
                      : step.state === 'skip'
                        ? 'text-subtle/60'
                        : 'text-subtle'
                }`}
              >
                {step.label}
                {step.state === 'skip' && <span className="block text-[9px]">ข้าม</span>}
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
        <div key={p.text} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-lg leading-none text-amber-600">⚙</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-amber-800">ตั้งค่าที่ต้องทำก่อนงานถึงจะเดิน</div>
            <div className="mt-0.5 text-xs text-amber-700">{p.text}</div>
          </div>
          <Link href={p.href} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
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
          <div className="text-sm font-medium text-ink">
            {item.title} <KindTag kind={item.kind} />
          </div>
          <div className="mt-0.5 text-xs text-subtle">
            {item.requestNo || item.id.split(':')[1] || item.id}
            {item.requester ? ` · ${item.requester}` : ''} · {fmtDate(item.createdAt)}
          </div>
        </div>
        <span className={`pill shrink-0 ${STAGE_PILL[item.stage]}`}>{item.statusLabel}</span>
      </div>

      {item.steps && item.steps.length > 0 && <Stepper steps={item.steps} />}

      {(showImage || item.detail) && (
        <div className="mt-3 flex gap-3">
          {showImage && item.content && (
            <img
              src={`/api/campaign-content/${item.content.id}/image`}
              alt="รูป Content"
              className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover"
            />
          )}
          {item.detail && (
            <p className={`min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed ${item.stage === 'attention' ? 'rounded-lg bg-red-50 px-3 py-2 text-red-700' : 'text-ink/75'}`}>
              {item.stage === 'attention' && <span className="mr-1">⚠</span>}
              {item.detail.length > 240 ? `${item.detail.slice(0, 240)}…` : item.detail}
            </p>
          )}
        </div>
      )}

      {item.progress && item.progress.target > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-subtle">
            ดึงผู้สมัคร {item.progress.got} จาก {item.progress.target} คน
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full bg-accent/75"
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ศูนย์งาน</h1>
        <p className="mt-1 text-sm text-subtle">งานจาก So Recruit ทุกใบ — รับงาน ตรวจ อนุมัติ และติดตามจนเสร็จ ในหน้าเดียว</p>
      </div>

      <Readiness facebookAccounts={facebookAccounts} />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="card p-4"><div className="text-xs text-subtle">ต้องแก้</div><div className="mt-1 text-3xl font-semibold tabular-nums text-red-600">{counts.attention}</div></div>
        <div className="card p-4"><div className="text-xs text-subtle">รอคุณ</div><div className="mt-1 text-3xl font-semibold tabular-nums text-orange-600">{counts.intake + counts.review}</div></div>
        <div className="card p-4"><div className="text-xs text-subtle">ระบบกำลังทำ</div><div className="mt-1 text-3xl font-semibold tabular-nums text-blue-600">{counts.working}</div></div>
        <div className="card p-4"><div className="text-xs text-subtle">เสร็จ</div><div className="mt-1 text-3xl font-semibold tabular-nums text-green-700">{counts.completed}</div></div>
      </div>

      {active.length === 0 ? (
        <div className="card px-5 py-16 text-center text-sm text-subtle">ไม่มีงานค้าง — ทุกอย่างเรียบร้อย 🎉</div>
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
            className="text-sm text-subtle hover:text-ink"
          >
            {showDone ? '▾' : '▸'} งานที่เสร็จแล้ว ({done.length})
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
