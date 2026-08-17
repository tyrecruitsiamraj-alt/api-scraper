'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CaptionViewer } from '@/components/CaptionViewer';
import {
  approveContentAction,
  approveScrapeResultAction,
  measureCampaignAction,
  rejectContentAction,
  rejectRequestAction,
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
  progress?: { qualified: number; assessed: number; target: number; running: boolean } | null;
  content?: {
    id: string;
    campaignId: string;
    caption: string | null;
    hasImage: boolean;
    qualityStatus: 'pending' | 'pass' | 'warning' | 'fail';
    qualityScore: number | null;
    qualitySummary: string | null;
  } | null;
  taskId?: string | null;
  campaignId?: string | null;
  nextAction?: 'retry_draft' | 'retry_post' | 'measure' | null;
  steps?: Step[];
  /** ใบตรวจข้อมูลใบขอ (เฉพาะ intake) — ช่องไหนมี ✓ / ขาด ✗ ให้ตัดสินใจรับ/ตีกลับ */
  checklist?: { label: string; ok: boolean }[];
  /** ข้อมูลใบขอเต็ม (เฉพาะ intake) — กดกางดู + แก้ไขได้ก่อนรับงาน */
  requestFields?: Record<string, string> | null;
};

type Option = { id: string; label: string };
export type FbAccountOption = {
  id: string;
  label: string;
  groupCount: number;
  preferredWorker: string | null;
  workerOnline: boolean;
  preflightReady: boolean;
  preflightVerified: boolean;
};

function facebookAccountProblem(account: FbAccountOption): string | null {
  if (account.groupCount <= 0) return 'ยังไม่มีกลุ่ม';
  if (!account.preferredWorker) return 'ยังไม่ผูกเครื่อง';
  if (!account.workerOnline) return 'เครื่องออฟไลน์';
  if (!account.preflightReady) return 'Worker ยังเป็นรุ่นเดิม';
  if (!account.preflightVerified) return 'ยังไม่ผ่านการทดสอบ';
  return null;
}

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

// กล่องสถานะบนหัว = เส้นทางงาน 6 ป้ายเดียวกับ stepper บนการ์ด (นับว่างานค้างป้ายไหนกี่งาน)
const STEP_BOXES: { label: string; hint: string }[] = [
  { label: 'รับงาน', hint: 'รอคุณกดรับ' },
  { label: 'เตรียมงาน', hint: 'ระบบกำลังเตรียม' },
  { label: 'ตรวจงาน', hint: 'รอคุณตรวจ' },
  { label: 'หาผู้สมัคร', hint: 'กำลังค้นหา' },
  { label: 'เผยแพร่', hint: 'กำลังโพสต์' },
  { label: 'เห็นผล', hint: 'งานเสร็จแล้ว' },
];

/** งานอยู่ป้ายไหนของเส้นทาง — ป้ายแรกที่ active/failed; ไม่มีเลย = เสร็จ (ป้ายสุดท้าย) */
function stepIndexOf(item: WorkCenterItem): number {
  const idx = item.steps?.findIndex((s) => s.state === 'active' || s.state === 'failed') ?? -1;
  if (idx >= 0) return idx;
  return item.stage === 'completed' ? STEP_BOXES.length - 1 : 0;
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function KindTag({ kind }: { kind: WorkCenterItem['kind'] }) {
  return <span className="ml-1.5 text-[10px] font-semibold tracking-[0.04em] text-subtle/70">{kind === 'content' ? 'สร้างประกาศ' : 'ค้นหาผู้สมัคร'}</span>;
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

// ช่องข้อมูลใบขอที่ "ดูอย่างเดียว" (ตรวจว่าดึงครบไหม — ไม่ให้แก้ตรงนี้ ผิดให้ตีกลับ)
const REQUEST_VIEW_DEFS: { key: string; label: string }[] = [
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'location', label: 'พื้นที่/จังหวัด' },
  { key: 'qty', label: 'จำนวน (คน)' },
  { key: 'work_schedule', label: 'เวลางาน' },
  { key: 'gender', label: 'เพศ' },
];

/**
 * กล่อง "ดูรายละเอียดใบขอ" — ตรวจว่าดึงข้อมูลมาครบไหม (ช่องส่วนใหญ่ดูอย่างเดียว)
 * แก้ได้เฉพาะ "รายได้" + "เพิ่มเติม/สวัสดิการ" (บางทีใบขอไม่ครบ เติมได้ก่อนกดอนุมัติ)
 * ค่าที่แก้ส่งไปกับปุ่มอนุมัติของ form นั้น (ผ่าน form= attribute) — ช่องอื่นผิด ให้ตีกลับ
 */
function RequestFieldsEditor({ fields, formId }: { fields: Record<string, string>; formId: string }) {
  const age = [fields.age_min, fields.age_max].filter(Boolean).join('–');
  const view: { label: string; value: string }[] = [
    ...REQUEST_VIEW_DEFS.map((d) => ({ label: d.label, value: fields[d.key] ?? '' })),
    { label: 'อายุ', value: age },
    { label: 'หน่วยงาน', value: fields.unit_name ?? '' },
  ];
  return (
    <details className="rounded-2xl border border-line bg-black/[0.015] px-4 py-3">
      <summary className="cursor-pointer select-none text-[13px] font-medium text-ink">
        📋 ดูรายละเอียดใบขอ
        <span className="ml-1 font-normal text-subtle">— ตรวจว่าดึงครบไหม · แก้ได้เฉพาะรายได้/สวัสดิการ</span>
      </summary>
      {/* ดูอย่างเดียว */}
      <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {view.map((v) => (
          <div key={v.label} className="flex items-baseline justify-between gap-2 border-b border-hairline/50 pb-1.5">
            <span className="text-xs text-subtle">{v.label}</span>
            <span className={`text-right text-[13px] ${v.value ? 'text-ink' : 'text-red-500/80'}`}>{v.value || '— ไม่มีในใบขอ —'}</span>
          </div>
        ))}
      </div>
      {/* แก้ได้เฉพาะ 2 ช่องนี้ */}
      <div className="mt-3 grid gap-x-3 gap-y-2 border-t border-line/60 pt-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${formId}-income`}>รายได้ <span className="text-subtle">(แก้ได้)</span></label>
          <input id={`${formId}-income`} name="ov_income" form={formId} defaultValue={fields.income ?? ''} placeholder="เช่น 25,000+ /เดือน" className="field w-full" />
        </div>
        <div>
          <label className="label" htmlFor={`${formId}-note`}>เพิ่มเติม / สวัสดิการ <span className="text-subtle">(เติมได้)</span></label>
          <input id={`${formId}-note`} name="ov_note" form={formId} defaultValue={fields.note ?? ''} placeholder="เช่น มี OT, ประกันสังคม, ที่พัก, เบี้ยขยัน" className="field w-full" />
        </div>
      </div>
    </details>
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
        <button className="btn-primary">ลองสร้างประกาศใหม่</button>
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
        <button className="btn-primary">ตรวจผลตอบรับ</button>
      </form>
    );
  }

  if (item.stage === 'intake' && item.requestNo) {
    const rejectForm = (
      <form action={rejectRequestAction} className="space-y-2 border-t border-line/60 pt-3">
        <input type="hidden" name="requestNo" value={item.requestNo} />
        {item.checklist && item.checklist.length > 0 && (
          <div>
            <div className="label">ติกข้อที่ขาด/ให้แก้ แล้วตีกลับ</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
              {item.checklist.map((c) => (
                <label key={c.label} className="inline-flex items-center gap-1.5 text-[13px] text-ink">
                  <input type="checkbox" name="missing" value={c.label} defaultChecked={!c.ok} className="h-4 w-4 accent-[var(--accent,#e41c24)]" />
                  {c.label}{c.ok ? '' : ' (ขาด)'}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <input
            name="reason"
            placeholder="เหตุผลเพิ่มเติม (ไม่บังคับ)"
            className="field min-w-[220px] flex-1"
          />
          <button className="btn-secondary">ตีกลับใบขอ</button>
        </div>
      </form>
    );
    if (item.kind === 'content') {
      // ช่องแก้ไขใน RequestFieldsEditor ผูกกับ form นี้ผ่าน form= attribute
      const formId = `approve-req-${item.id}`;
      return (
        <div className="w-full space-y-3">
          {item.requestFields && <RequestFieldsEditor fields={item.requestFields} formId={formId} />}
          <form id={formId} action={startCampaignAction}>
            <input type="hidden" name="requestNo" value={item.requestNo} />
            <button className="btn-primary">รับงานและเริ่มสร้างประกาศ</button>
          </form>
          {rejectForm}
        </div>
      );
    }
    // scraping: โชว์แผนการค้นก่อนกดเสมอ — คนเห็นว่าจะ scrape อะไร + แก้ได้ตรงนี้
    const f = item.requestFields ?? {};
    return (
      <div className="w-full space-y-3">
        <form action={startSoRecruitScrapeAction} className="space-y-3">
          <input type="hidden" name="requestNo" value={item.requestNo} />
          <div className="rounded-2xl border border-line bg-black/[0.015] px-4 py-3">
            <div className="text-[13px] font-medium text-ink">
              🔎 แผนการค้น
              <span className="ml-1 font-normal text-subtle">— ระบบจะค้นหาตามนี้ แก้ได้ก่อนกด</span>
            </div>
            <div className="mt-2 grid gap-x-3 gap-y-2 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor={`sp-pos-${item.id}`}>ตำแหน่งที่ค้น</label>
                <input id={`sp-pos-${item.id}`} name="scrapePosition" defaultValue={f.position ?? ''} placeholder="เช่น พนักงานขับรถ" className="field w-full" />
              </div>
              <div>
                <label className="label" htmlFor={`sp-prov-${item.id}`}>จังหวัด</label>
                <input id={`sp-prov-${item.id}`} name="scrapeProvince" defaultValue={f.location ?? ''} placeholder="ว่าง = ทุกจังหวัด" className="field w-full" />
              </div>
              <div>
                <label className="label" htmlFor={`sp-target-${item.id}`}>เป้า (คน)</label>
                <input id={`sp-target-${item.id}`} name="scrapeTarget" type="number" min={1} defaultValue={f.qty || ''} placeholder="20" className="field w-full" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor={`connector-${item.id}`}>เลือกบัญชีสำหรับค้นหา</label>
              <select id={`connector-${item.id}`} name="connectorId" required defaultValue="" className="field">
                <option value="" disabled>เลือกบัญชี JobBKK หรือ JobThai…</option>
                {connectors.map((connector) => <option key={connector.id} value={connector.id}>{connector.label}</option>)}
              </select>
            </div>
            <button className="btn-primary" disabled={connectors.length === 0}>รับงานและเริ่มค้นหา</button>
            {connectors.length === 0 && (
              <Link href="/settings/connectors" className="text-xs text-accent hover:underline">เพิ่มบัญชีสำหรับค้นหาก่อน</Link>
            )}
          </div>
        </form>
        {rejectForm}
      </div>
    );
  }

  if (item.stage === 'review' && item.kind === 'content' && item.content) {
    const readyAccounts = facebookAccounts.filter((account) => !facebookAccountProblem(account));
    const noAccount = facebookAccounts.length === 0;
    const noReady = readyAccounts.length === 0;
    // เลือกบัญชีที่พร้อม (มีกลุ่ม) เป็นค่าเริ่มต้น — บัญชีที่ไม่มีกลุ่มเลือกไม่ได้ (กันโพสต์ไปตายทีหลัง)
    return (
      <div className="w-full space-y-3">
        <div className={`rounded-lg border px-3 py-2 text-sm ${
          item.content.qualityStatus === 'fail'
            ? 'border-red-200 bg-red-50 text-red-700'
            : item.content.qualityStatus === 'pass'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          <span className="font-medium">
            {item.content.qualityStatus === 'fail' ? 'ยังอนุมัติไม่ได้' : item.content.qualityStatus === 'pass' ? 'ตรวจข้อมูลสำคัญแล้ว' : 'ควรตรวจเพิ่ม'}
          </span>
          {item.content.qualityScore != null ? ` · ${item.content.qualityScore}/100` : ''}
          {item.content.qualitySummary ? ` — ${item.content.qualitySummary}` : ''}
        </div>
        <form action={approveContentAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="contentId" value={item.content.id} />
          <input type="hidden" name="campaignId" value={item.content.campaignId} />
          <div>
            <label className="label" htmlFor={`facebook-${item.id}`}>บัญชีสำหรับเผยแพร่</label>
            <select id={`facebook-${item.id}`} name="fbAccountId" required defaultValue="" className="field">
              <option value="" disabled>เลือกบัญชี Facebook…</option>
              {facebookAccounts.map((account) => (
                <option key={account.id} value={account.id} disabled={!!facebookAccountProblem(account)}>
                  {account.label}{facebookAccountProblem(account) ? ` (${facebookAccountProblem(account)})` : ` · พร้อมเผยแพร่ ${account.groupCount} กลุ่ม`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`postmode-${item.id}`}>โพสต์อะไร</label>
            <select id={`postmode-${item.id}`} name="postMode" defaultValue="both" className="field">
              <option value="both">รูป + แคปชัน</option>
              <option value="image" disabled={!item.content.hasImage}>เฉพาะรูป{item.content.hasImage ? '' : ' (ไม่มีรูป)'}</option>
              <option value="caption">เฉพาะแคปชัน</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`approve-feedback-${item.id}`}>จุดที่ทำได้ดี</label>
            <select id={`approve-feedback-${item.id}`} name="feedbackCode" defaultValue="ready" className="field">
              <option value="ready">พร้อมใช้ ไม่ต้องแก้</option>
              <option value="strong_hook">ประโยคเปิดน่าสนใจ</option>
              <option value="complete_info">ข้อมูลครบและถูกต้อง</option>
              <option value="good_visual">รูปเหมาะกับงาน</option>
            </select>
          </div>
          <button className="btn-primary" disabled={noReady || item.content.qualityStatus === 'fail'}>
            {item.content.qualityStatus === 'fail' ? 'แก้ข้อมูลก่อนอนุมัติ' : noAccount ? 'ยังไม่มีบัญชี' : noReady ? 'ยังไม่มีบัญชีที่ผ่านการทดสอบ' : 'อนุมัติและโพสต์'}
          </button>
          {noReady && (
            <Link href="/settings/connectors" className="text-xs text-accent hover:underline">
              {noAccount ? 'เพิ่มบัญชี Facebook ก่อน' : 'เตรียมและทดสอบบัญชีก่อน'}
            </Link>
          )}
        </form>

        {/* ตีกลับให้ AI แก้ใหม่ พร้อมบอกว่าขาด/ผิดอะไร */}
        <form action={rejectContentAction} className="flex flex-wrap items-end gap-2 border-t border-line/60 pt-3">
          <input type="hidden" name="contentId" value={item.content.id} />
          <input type="hidden" name="campaignId" value={item.content.campaignId} />
          <div>
            <label className="label" htmlFor={`reject-code-${item.id}`}>ปัญหาหลัก</label>
            <select id={`reject-code-${item.id}`} name="reasonCode" required defaultValue="" className="field">
              <option value="" disabled>เลือกเหตุผล…</option>
              <option value="incorrect_info">ข้อมูลไม่ถูกต้อง</option>
              <option value="weak_hook">ประโยคเปิดไม่น่าสนใจ</option>
              <option value="too_long">เนื้อหายาวเกินไป</option>
              <option value="missing_details">ข้อมูลสำคัญไม่ครบ</option>
              <option value="wrong_tone">ภาษาไม่เหมาะกับกลุ่มเป้าหมาย</option>
              <option value="poor_visual">รูปไม่เหมาะสม</option>
              <option value="other">เหตุผลอื่น</option>
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor={`reject-${item.id}`}>รายละเอียดเพิ่มเติม</label>
            <input
              id={`reject-${item.id}`}
              name="reason"
              placeholder="บอกให้ AI รู้ว่ารอบใหม่ควรแก้อะไร"
              className="field"
            />
          </div>
          <button className="btn-secondary">ตีกลับให้แก้ใหม่</button>
        </form>
      </div>
    );
  }

  if (item.stage === 'review' && item.kind === 'scraping' && item.taskId) {
    return (
      <form action={approveScrapeResultAction}>
        <input type="hidden" name="taskId" value={item.taskId} />
        <button className="btn-primary">ยืนยันว่าข้อมูลผู้สมัครถูกต้อง</button>
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
      text: 'ยังไม่มีบัญชี Facebook สำหรับเผยแพร่ — งานจะไปต่อไม่ได้',
      href: '/settings/connectors',
      btn: 'เพิ่มบัญชี',
    });
  } else {
    const notReady = facebookAccounts.filter((account) => !!facebookAccountProblem(account));
    if (notReady.length > 0) {
      const names = notReady.map((account) => `${account.label} (${facebookAccountProblem(account)})`).join(', ');
      problems.push({
        text: `บัญชี ${names} ยังไม่พร้อมเผยแพร่ — ผูกเครื่อง เลือกกลุ่ม และกดทดสอบแบบไม่โพสต์จริงให้ผ่านก่อน`,
        href: '/settings/connectors',
        btn: 'เตรียมบัญชีให้พร้อม',
      });
    }
  }
  if (problems.length === 0) return null;
  return (
    <div className="space-y-2">
      {problems.map((p) => (
        <div key={p.text} className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 shadow-card">
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-amber-700">ตั้งค่าที่ต้องทำก่อนงานถึงจะเดิน</div>
            <div className="mt-1 text-[13px] text-amber-800">{p.text}</div>
          </div>
          <Link href={p.href} className="btn-primary btn-sm shrink-0 !bg-amber-600 hover:!bg-amber-700">
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
    <div className={`card card-hover animate-fadeUp p-4 sm:p-5 ${CARD_ACCENT[item.stage]}`}>
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

      {item.checklist && item.checklist.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-subtle">ข้อมูลใบขอ:</span>
          {item.checklist.map((c) => (
            <span
              key={c.label}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                c.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
              }`}
            >
              {c.ok ? '✓' : '✗'} {c.label}
            </span>
          ))}
          {item.checklist.some((c) => !c.ok) && (
            <span className="text-[11px] text-subtle">— ขาดเยอะ ตีกลับพร้อมบอกได้เลย</span>
          )}
        </div>
      )}

      {(showImage || item.detail) && (
        <div className="mt-4 flex gap-3">
          {showImage && item.content && (
            // คลิกเปิดรูปเต็มในแท็บใหม่ (ดูก่อนอนุมัติ)
            <a
              href={`/api/campaign-content/${item.content.id}/image`}
              target="_blank"
              rel="noreferrer"
              title="คลิกดูรูปเต็ม"
              className="shrink-0 transition hover:opacity-85"
            >
              <img
                src={`/api/campaign-content/${item.content.id}/image`}
                alt="รูป Content"
                className="h-16 w-16 border border-line object-cover"
              />
            </a>
          )}
          {item.detail && (
            <div className={`min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed ${item.stage === 'attention' ? 'rounded-xl border-l-2 border-accent bg-red-50 px-3.5 py-2.5 text-red-700' : 'text-ink/70'}`}>
              {item.stage === 'review' && item.kind === 'content'
                ? <CaptionViewer caption={item.content?.caption ?? item.detail} />
                : (item.detail.length > 240 ? `${item.detail.slice(0, 240)}…` : item.detail)}
            </div>
          )}
        </div>
      )}

      {item.progress && item.progress.target > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-subtle">
            <span className="uppercase tracking-[0.06em]">Resume ผ่านเกณฑ์</span>
            <span className="tabular-nums text-ink">
              {item.progress.qualified} / {item.progress.target}
              {item.progress.running && ` · ตรวจแล้ว ${item.progress.assessed} โปรไฟล์`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.round((item.progress.qualified / item.progress.target) * 100))}%` }}
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
  // กล่องตัวเลขตามเส้นทางงาน 6 ป้าย (รับงาน→เสร็จ) — กดกรองดูงานที่ค้างป้ายนั้น
  const [filter, setFilter] = useState<number | null>(null);

  const stepStats = useMemo(() => {
    const counts = Array<number>(STEP_BOXES.length).fill(0);
    const attention = Array<boolean>(STEP_BOXES.length).fill(false);
    items.forEach((item) => {
      const i = stepIndexOf(item);
      counts[i] += 1;
      if (item.stage === 'attention') attention[i] = true;
    });
    return { counts, attention };
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

  const filtered = filter != null ? sorted.filter((item) => stepIndexOf(item) === filter) : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow text-accent">SO Recruitment</div>
        <h1 className="mt-1 text-[28px] font-medium tracking-tight">ศูนย์งาน</h1>
        <p className="mt-1 text-sm text-subtle">งานจาก So Recruit ทุกใบ — รับงาน ตรวจ อนุมัติ และติดตามจนเสร็จ ในหน้าเดียว</p>
      </div>

      <Readiness facebookAccounts={facebookAccounts} />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {STEP_BOXES.map((s, i) => {
          const n = stepStats.counts[i];
          const warn = stepStats.attention[i];
          const isLast = i === STEP_BOXES.length - 1;
          const tone = warn ? 'text-accent' : isLast ? 'text-emerald-700' : n > 0 ? 'text-ink' : 'text-subtle/40';
          const bar = warn ? 'bg-accent' : isLast ? 'bg-emerald-600' : 'bg-ink/30';
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setFilter((cur) => (cur === i ? null : i))}
              className={`card card-hover relative overflow-hidden px-3.5 py-3 text-left ${filter === i ? 'ring-2 ring-accent' : ''}`}
              aria-pressed={filter === i}
            >
              <span className={`absolute left-0 top-0 h-full w-1 ${n > 0 ? bar : 'bg-transparent'}`} />
              <div className="text-[11px] font-medium text-subtle">{s.label}</div>
              <div className={`mt-1 text-[26px] font-semibold leading-none tabular-nums ${tone}`}>{n}</div>
              <div className={`mt-0.5 truncate text-[10px] ${warn ? 'font-medium text-accent' : 'text-subtle/60'}`}>
                {warn ? 'มีงานพัง — กดดู' : n > 0 ? s.hint : '—'}
              </div>
            </button>
          );
        })}
      </div>

      {filter != null ? (
        /* โหมดกรอง: โชว์เฉพาะกลุ่มที่กด */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{filter != null ? STEP_BOXES[filter].label : ''} · {filtered.length} งาน</div>
            <button type="button" onClick={() => setFilter(null)} className="text-xs text-accent hover:underline">← กลับหน้ารวม</button>
          </div>
          {filtered.length === 0 ? (
            <div className="card px-5 py-12 text-center text-sm text-subtle">ไม่มีงานในกลุ่มนี้</div>
          ) : (
            filtered.map((item) => (
              <WorkItemCard key={item.id} item={item} connectors={connectors} facebookAccounts={facebookAccounts} />
            ))
          )}
        </div>
      ) : (
        /* โหมดปกติ: งานค้างเรียงตามด่วน + งานเสร็จยุบไว้ */
        <>
          {active.length === 0 ? (
            <div className="card px-5 py-16 text-center text-sm text-subtle">ไม่มีงานค้าง — ทุกอย่างเรียบร้อย</div>
          ) : (
            <div className="space-y-3">
              {active.map((item) => (
                <WorkItemCard key={item.id} item={item} connectors={connectors} facebookAccounts={facebookAccounts} />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter(STEP_BOXES.length - 1)}
              className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
            >
              <span className="text-[9px]">▶</span> ดูงานที่เสร็จแล้ว · {done.length}
            </button>
          )}
        </>
      )}
    </div>
  );
}
