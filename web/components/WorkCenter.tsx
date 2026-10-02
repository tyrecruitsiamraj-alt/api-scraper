'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CaptionViewer } from '@/components/CaptionViewer';
import {
  approveScrapeResultAction,
  measureCampaignAction,
  rejectContentAction,
  rejectRequestAction,
  retryCampaignDraftAction,
  retryCampaignPostAction,
  startCampaignAction,
  startSoRecruitScrapeAction,
} from '@/lib/actions';
import { EDUCATION_LEVELS, GENDERS, PROVINCES, SALARY_LABELS, SALARY_STEPS } from '@/lib/filter-options';
import { CONTENT_DISABLED_OPERATOR_MESSAGE, isContentGenerationEnabled } from '@/lib/product-scope';

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
  context?: string | null;
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
  checklist?: { label: string; ok: boolean }[];
  requestFields?: Record<string, string> | null;
};

type Option = { id: string; label: string; available: boolean; blockReason: string | null };
export type FbAccountOption = {
  id: string;
  label: string;
  groupCount: number;
  preferredWorker: string | null;
  workerOnline: boolean;
  preflightReady: boolean;
  preflightVerified: boolean;
};

type TabKey = 'todo' | 'running' | 'done' | 'all';

function facebookAccountProblem(account: FbAccountOption): string | null {
  if (account.groupCount <= 0) return 'ยังไม่มีกลุ่ม';
  if (!account.preferredWorker) return 'ยังไม่ผูกเครื่อง';
  if (!account.workerOnline) return 'เครื่องออฟไลน์';
  if (!account.preflightReady) return 'Worker ยังเป็นรุ่นเดิม';
  if (!account.preflightVerified) return 'ยังไม่ผ่านการทดสอบ';
  return null;
}

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

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function salarySelectOptions(extra?: string) {
  const value = String(extra ?? '').replace(/\D/g, '');
  if (value && !(SALARY_STEPS as readonly string[]).includes(value)) return [value, ...SALARY_STEPS];
  return [...SALARY_STEPS];
}

function salaryLabel(step: string) {
  return SALARY_LABELS[step] ?? Number(step).toLocaleString('en-US');
}

function Readiness({ facebookAccounts }: { facebookAccounts: FbAccountOption[] }) {
  const problems: { text: string; href: string; btn: string }[] = [];
  if (facebookAccounts.length === 0) {
    problems.push({
      text: 'ยังไม่มีบัญชี Facebook สำหรับเผยแพร่',
      href: '/settings/connectors',
      btn: 'เพิ่มบัญชี',
    });
  } else {
    const notReady = facebookAccounts.filter((account) => !!facebookAccountProblem(account));
    if (notReady.length > 0) {
      problems.push({
        text: `บัญชียังไม่พร้อม: ${notReady.map((a) => `${a.label} (${facebookAccountProblem(a)})`).join(', ')}`,
        href: '/settings/connectors',
        btn: 'เตรียมบัญชี',
      });
    }
  }
  if (problems.length === 0) return null;
  return (
    <div className="space-y-2">
      {problems.map((p) => (
        <div key={p.text} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="min-w-0 flex-1 text-sm text-amber-900">{p.text}</div>
          <Link href={p.href} className="btn-primary btn-sm shrink-0 !bg-amber-600 hover:!bg-amber-700">{p.btn}</Link>
        </div>
      ))}
    </div>
  );
}

function RequestFieldsEditor({ fields, formId }: { fields: Record<string, string>; formId: string }) {
  const age = [fields.age_min, fields.age_max].filter(Boolean).join('–');
  const view = [
    { label: 'ตำแหน่ง', value: fields.position ?? '' },
    { label: 'พื้นที่', value: fields.location ?? '' },
    { label: 'จำนวน', value: fields.qty ?? '' },
    { label: 'เวลางาน', value: fields.work_schedule ?? '' },
    { label: 'เพศ', value: fields.gender ?? '' },
    { label: 'อายุ', value: age },
  ];
  return (
    <details className="rounded-xl border border-line bg-black/[0.02] px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-ink">ดูรายละเอียดใบขอ</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {view.map((v) => (
          <div key={v.label} className="flex justify-between gap-2 border-b border-line/40 pb-1 text-sm">
            <span className="text-subtle">{v.label}</span>
            <span className={v.value ? 'text-ink' : 'text-red-500'}>{v.value || '—'}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${formId}-income`}>รายได้ (แก้ได้)</label>
          <input id={`${formId}-income`} name="ov_income" form={formId} defaultValue={fields.income ?? ''} className="field" />
        </div>
        <div>
          <label className="label" htmlFor={`${formId}-note`}>สวัสดิการ (เติมได้)</label>
          <input id={`${formId}-note`} name="ov_note" form={formId} defaultValue={fields.note ?? ''} className="field" />
        </div>
      </div>
    </details>
  );
}

function RejectBlock({ item }: { item: WorkCenterItem }) {
  if (!item.requestNo) return null;
  return (
    <details className="rounded-xl border border-line px-3 py-2" data-pause-refresh="1">
      <summary className="cursor-pointer text-sm text-subtle">ตีกลับใบขอ</summary>
      <form action={rejectRequestAction} className="mt-2 space-y-2">
        <input type="hidden" name="requestNo" value={item.requestNo} />
        {item.checklist && item.checklist.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {item.checklist.map((c) => (
              <label key={c.label} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="missing" value={c.label} defaultChecked={!c.ok} />
                {c.label}{c.ok ? '' : ' (ขาด)'}
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input name="reason" placeholder="เหตุผลเพิ่มเติม (ไม่บังคับ)" className="field min-w-[200px] flex-1" />
          <button className="btn-secondary">ตีกลับ</button>
        </div>
      </form>
    </details>
  );
}

function scrapePlanSummary(f: Record<string, string>) {
  const bits = [
    f.position,
    f.location,
    f.qty ? `เป้า ${f.qty} คน` : '',
    f.gender && f.gender !== 'ไม่ระบุ' ? f.gender : '',
  ].filter(Boolean);
  return bits.join(' · ') || 'ตามใบขอ';
}

/** ฟอร์มรันทันทีจากค่าใบขอ — ไม่ต้องกางแผนก่อน */
function ScrapeQuickRunForm({ item, connectors }: { item: WorkCenterItem; connectors: Option[] }) {
  const f = item.requestFields ?? {};
  const defaultConnector = connectors.find((c) => c.available)?.id ?? '';
  const canRun = Boolean(defaultConnector);
  return (
    <form action={startSoRecruitScrapeAction} className="space-y-2" data-pause-refresh="1">
      <input type="hidden" name="requestNo" value={item.requestNo ?? ''} />
      <input type="hidden" name="scrapePosition" value={f.position ?? ''} />
      <input type="hidden" name="scrapeKeyword" value={f.keyword ?? ''} />
      <input type="hidden" name="scrapeIndustry" value={f.industry ?? ''} />
      <input type="hidden" name="scrapeProvince" value={f.location ?? ''} />
      <input type="hidden" name="scrapeTarget" value={f.qty ?? ''} />
      <input type="hidden" name="scrapeGender" value={f.gender || 'ไม่ระบุ'} />
      <input type="hidden" name="scrapeEducation" value={f.education || 'ไม่ระบุ'} />
      <input type="hidden" name="scrapeSalaryMin" value={f.salary_min ?? ''} />
      <input type="hidden" name="scrapeSalaryMax" value={f.salary_max ?? ''} />
      <input type="hidden" name="scrapeAgeMin" value={f.age_min ?? ''} />
      <input type="hidden" name="scrapeAgeMax" value={f.age_max ?? ''} />
      <p className="text-xs text-subtle">จะค้น: {scrapePlanSummary(f)}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor={`connector-quick-${item.id}`}>บัญชีค้นหา</label>
          <select
            id={`connector-quick-${item.id}`}
            name="connectorId"
            required
            defaultValue={defaultConnector}
            className="field"
          >
            <option value="" disabled>เลือก JobBKK / JobThai…</option>
            {connectors.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.available}>
                {c.label}{c.available ? '' : ` — ${c.blockReason}`}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={!canRun}>เริ่มค้นหาเลย</button>
        {!canRun && (
          <Link href="/settings/connectors" className="text-xs text-accent hover:underline">เพิ่มบัญชีก่อน</Link>
        )}
      </div>
    </form>
  );
}

function ScrapeIntakeForm({ item, connectors }: { item: WorkCenterItem; connectors: Option[] }) {
  const f = item.requestFields ?? {};
  return (
    <form action={startSoRecruitScrapeAction} className="space-y-3" data-pause-refresh="1">
      <input type="hidden" name="requestNo" value={item.requestNo ?? ''} />
      <div className="rounded-xl border border-line bg-black/[0.02] px-3 py-3">
        <div className="text-sm font-medium text-ink">แก้แผนการค้น แล้วกดเริ่ม</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor={`sp-pos-${item.id}`}>ตำแหน่ง</label>
            <input id={`sp-pos-${item.id}`} name="scrapePosition" defaultValue={f.position ?? ''} className="field" />
          </div>
          <div>
            <label className="label" htmlFor={`sp-kw-${item.id}`}>Keyword</label>
            <input id={`sp-kw-${item.id}`} name="scrapeKeyword" defaultValue={f.keyword ?? ''} className="field" />
          </div>
          <div>
            <label className="label" htmlFor={`sp-prov-${item.id}`}>จังหวัด</label>
            <input id={`sp-prov-${item.id}`} name="scrapeProvince" list={`province-options-${item.id}`} defaultValue={f.location ?? ''} className="field" />
            <datalist id={`province-options-${item.id}`}>
              {PROVINCES.map((province) => <option key={province} value={province} />)}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor={`sp-target-${item.id}`}>เป้า (คน)</label>
            <input id={`sp-target-${item.id}`} name="scrapeTarget" type="number" min={1} defaultValue={f.qty || ''} className="field" />
          </div>
          <div>
            <label className="label" htmlFor={`sp-gender-${item.id}`}>เพศ</label>
            <select id={`sp-gender-${item.id}`} name="scrapeGender" defaultValue={f.gender || 'ไม่ระบุ'} className="field">
              {GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`sp-edu-${item.id}`}>วุฒิ</label>
            <select id={`sp-edu-${item.id}`} name="scrapeEducation" defaultValue={f.education || 'ไม่ระบุ'} className="field">
              {EDUCATION_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">เงินเดือน</label>
            <div className="flex items-center gap-2">
              <select name="scrapeSalaryMin" defaultValue={f.salary_min ?? ''} className="field">
                <option value="">ต่ำสุด</option>
                {salarySelectOptions(f.salary_min).map((step) => (
                  <option key={`min-${step}`} value={step}>{salaryLabel(step)}</option>
                ))}
              </select>
              <span className="text-subtle">–</span>
              <select name="scrapeSalaryMax" defaultValue={f.salary_max ?? ''} className="field">
                <option value="">สูงสุด</option>
                {salarySelectOptions(f.salary_max).map((step) => (
                  <option key={`max-${step}`} value={step}>{salaryLabel(step)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">อายุ</label>
            <div className="flex items-center gap-2">
              <input name="scrapeAgeMin" type="number" min={15} max={80} defaultValue={f.age_min ?? ''} placeholder="ต่ำสุด" className="field" />
              <span className="text-subtle">–</span>
              <input name="scrapeAgeMax" type="number" min={15} max={80} defaultValue={f.age_max ?? ''} placeholder="สูงสุด" className="field" />
            </div>
          </div>
          <input type="hidden" name="scrapeIndustry" value={f.industry ?? ''} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor={`connector-${item.id}`}>บัญชีค้นหา</label>
          <select
            id={`connector-${item.id}`}
            name="connectorId"
            required
            defaultValue={connectors.find((c) => c.available)?.id ?? ''}
            className="field"
          >
            <option value="" disabled>เลือก JobBKK / JobThai…</option>
            {connectors.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.available}>
                {c.label}{c.available ? '' : ` — ${c.blockReason}`}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={!connectors.some((c) => c.available)}>เริ่มค้นหาเลย</button>
      </div>
    </form>
  );
}

function WorkAction({
  item,
  connectors,
  expanded,
  onTogglePlan,
}: {
  item: WorkCenterItem;
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
  expanded: boolean;
  onTogglePlan: () => void;
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
    if (item.kind === 'content') {
      if (!isContentGenerationEnabled()) {
        return (
          <div className="space-y-2" data-pause-refresh="1">
            <p className="text-sm text-amber-800">{CONTENT_DISABLED_OPERATOR_MESSAGE}</p>
            <div className="flex flex-wrap gap-2">
              <form action={rejectRequestAction}>
                <input type="hidden" name="requestNo" value={item.requestNo} />
                <input type="hidden" name="reason" value={CONTENT_DISABLED_OPERATOR_MESSAGE} />
                <button className="btn-secondary">ตีกลับคำขอสร้างประกาศ</button>
              </form>
              <Link href="/autopost" className="btn-ghost btn-sm">ไปหน้าโพสต์ Facebook</Link>
            </div>
          </div>
        );
      }
      const formId = `approve-req-${item.id}`;
      return (
        <div className="w-full space-y-3" data-pause-refresh="1">
          {item.requestFields && <RequestFieldsEditor fields={item.requestFields} formId={formId} />}
          <form id={formId} action={startCampaignAction}>
            <input type="hidden" name="requestNo" value={item.requestNo} />
            <button className="btn-primary">รับงานและเริ่มสร้างประกาศ</button>
          </form>
          <RejectBlock item={item} />
        </div>
      );
    }

    // scraping intake — รันจากหน้านี้ได้เลย; กางแผนเฉพาะตอนอยากแก้
    return (
      <div className="w-full space-y-3" data-pause-refresh="1">
        {expanded ? (
          <ScrapeIntakeForm item={item} connectors={connectors} />
        ) : (
          <ScrapeQuickRunForm item={item} connectors={connectors} />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={onExpand}
            disabled={expanded}
          >
            {expanded ? 'กำลังแก้แผนด้านบน' : 'แก้แผนก่อนรัน'}
          </button>
          {item.href && <Link href={item.href} className="btn-ghost btn-sm">ดูใบงาน</Link>}
        </div>
        <RejectBlock item={item} />
      </div>
    );
  }

  if (item.stage === 'review' && item.kind === 'content' && item.content) {
    return (
      <div className="w-full space-y-3" data-pause-refresh="1">
        <div className={`rounded-lg border px-3 py-2 text-sm ${
          item.content.qualityStatus === 'fail' ? 'border-red-200 bg-red-50 text-red-700'
            : item.content.qualityStatus === 'pass' ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          {item.content.qualityStatus === 'fail' ? 'ยังอนุมัติไม่ได้' : item.content.qualityStatus === 'pass' ? 'พร้อมตรวจ' : 'ควรตรวจเพิ่ม'}
          {item.content.qualitySummary ? ` — ${item.content.qualitySummary}` : ''}
        </div>
        <Link href={`/orchestrator/${item.content.campaignId}`} className="btn-primary">เปิดตรวจรูป + Caption</Link>
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm text-subtle">ตีกลับให้แก้ใหม่</summary>
          <form action={rejectContentAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="contentId" value={item.content.id} />
            <input type="hidden" name="campaignId" value={item.content.campaignId} />
            <select name="reasonCode" required defaultValue="" className="field max-w-[220px]">
              <option value="" disabled>เลือกเหตุผล…</option>
              <option value="incorrect_info">ข้อมูลไม่ถูกต้อง</option>
              <option value="weak_hook">ประโยคเปิดไม่น่าสนใจ</option>
              <option value="too_long">เนื้อหายาวเกินไป</option>
              <option value="missing_details">ข้อมูลสำคัญไม่ครบ</option>
              <option value="wrong_tone">ภาษาไม่เหมาะ</option>
              <option value="poor_visual">รูปไม่เหมาะสม</option>
              <option value="other">อื่น ๆ</option>
            </select>
            <input name="reason" placeholder="รายละเอียด" className="field min-w-[180px] flex-1" />
            <button className="btn-secondary">ตีกลับ</button>
          </form>
        </details>
      </div>
    );
  }

  if (item.stage === 'review' && item.kind === 'scraping' && item.taskId) {
    return (
      <div className="flex flex-wrap gap-2">
        <form action={approveScrapeResultAction}>
          <input type="hidden" name="taskId" value={item.taskId} />
          <button className="btn-primary">ยืนยันข้อมูลผู้สมัคร</button>
        </form>
        {item.href && <Link href={item.href} className="btn-secondary">เปิดดู Resume</Link>}
      </div>
    );
  }

  if (item.href) {
    return <Link href={item.href} className="btn-primary">เปิดดูงาน</Link>;
  }
  return null;
}

function WorkItemCard({
  item,
  connectors,
  facebookAccounts,
  defaultExpanded,
}: {
  item: WorkCenterItem;
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const missing = item.checklist?.filter((c) => !c.ok) ?? [];

  return (
    <article className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink">
            {item.href ? (
              <Link href={item.href} className="hover:text-accent hover:underline">
                {item.title}
              </Link>
            ) : item.title}
          </h3>
          <p className="mt-1 text-xs text-subtle">
            {item.requestNo || '—'}
            {item.context ? ` · ${item.context}` : ''}
            {' · '}{fmtDate(item.createdAt)}
            {' · '}{item.kind === 'scraping' ? 'ค้นหาผู้สมัคร' : 'สร้างประกาศ'}
          </p>
        </div>
        <span className={`pill shrink-0 ${STAGE_PILL[item.stage]}`}>{item.statusLabel}</span>
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-xs text-red-600">ขาดในใบขอ: {missing.map((m) => m.label).join(', ')}</p>
      )}

      {item.detail && (
        <p className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed ${
          item.stage === 'attention' ? 'rounded-lg border-l-2 border-accent bg-red-50 px-3 py-2 text-red-700' : 'text-ink/75'
        }`}>
          {item.stage === 'review' && item.kind === 'content'
            ? <CaptionViewer caption={item.content?.caption ?? item.detail} />
            : (item.detail.length > 280 ? `${item.detail.slice(0, 280)}…` : item.detail)}
        </p>
      )}

      {item.progress && item.progress.target > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-subtle">
            <span>Resume ผ่านเกณฑ์</span>
            <span className="tabular-nums text-ink">{item.progress.qualified} / {item.progress.target}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, Math.round((item.progress.qualified / item.progress.target) * 100))}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4">
        <WorkAction
          item={item}
          connectors={connectors}
          facebookAccounts={facebookAccounts}
          expanded={expanded}
          onExpand={() => setExpanded(true)}
        />
      </div>
    </article>
  );
}

export function WorkCenter({ items, connectors, facebookAccounts }: {
  items: WorkCenterItem[];
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
}) {
  const [tab, setTab] = useState<TabKey>('todo');

  const sorted = useMemo(
    () => [...items].sort((a, b) => {
      const pa = STAGE_PRIORITY[a.stage];
      const pb = STAGE_PRIORITY[b.stage];
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }),
    [items],
  );

  const todo = sorted.filter((i) => ['attention', 'review', 'intake'].includes(i.stage));
  const running = sorted.filter((i) => i.stage === 'working');
  const done = sorted.filter((i) => i.stage === 'completed');

  const visible = tab === 'todo' ? todo
    : tab === 'running' ? running
      : tab === 'done' ? done
        : sorted;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'todo', label: 'ต้องทำ', count: todo.length },
    { key: 'running', label: 'กำลังทำ', count: running.length },
    { key: 'done', label: 'เสร็จแล้ว', count: done.length },
    { key: 'all', label: 'ทั้งหมด', count: sorted.length },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ศูนย์งาน</h1>
        <p className="mt-1 text-sm text-subtle">เลือกแท็บ → เปิดการ์ด → กดปุ่มหลักเพียงปุ่มเดียว</p>
      </div>

      <details className="rounded-xl border border-line bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm text-subtle">ตั้งค่าที่อาจทำให้งานค้าง (ผู้ดูแล)</summary>
        <div className="mt-3"><Readiness facebookAccounts={facebookAccounts} /></div>
      </details>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองงาน">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-ink text-white'
                : 'bg-black/[0.05] text-ink hover:bg-black/[0.08]'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 tabular-nums ${tab === t.key ? 'text-white/80' : 'text-subtle'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-12 text-center text-sm text-subtle">
          {tab === 'todo' ? 'ไม่มีงานที่รอคุณทำตอนนี้' : tab === 'running' ? 'ไม่มีงานที่ระบบกำลังทำ' : tab === 'done' ? 'ยังไม่มีงานที่เสร็จ' : 'ยังไม่มีงาน'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item, index) => (
            <WorkItemCard
              key={item.id}
              item={item}
              connectors={connectors}
              facebookAccounts={facebookAccounts}
              defaultExpanded={tab === 'todo' && todo.length === 1 && index === 0 && item.stage === 'intake'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
