'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  approveScrapeResultAction,
  rejectDisabledContentRequestsAction,
  rejectRequestAction,
  startSoRecruitScrapeAction,
} from '@/lib/actions';
import { EDUCATION_LEVELS, GENDERS, PROVINCES, SALARY_LABELS, SALARY_STEPS } from '@/lib/filter-options';

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

export type DisabledContentRequest = {
  requestNo: string;
  title: string;
};

type TabKey = 'todo' | 'running' | 'done';

const STAGE_PRIORITY: Record<WorkCenterStage, number> = {
  attention: 0,
  review: 1,
  intake: 2,
  working: 3,
  completed: 4,
};

const STAGE_PILL: Record<WorkCenterStage, string> = {
  intake: 'bg-amber-50 text-amber-800',
  working: 'bg-sky-50 text-sky-800',
  review: 'bg-orange-50 text-orange-800',
  completed: 'bg-emerald-50 text-emerald-800',
  attention: 'bg-red-50 text-red-800',
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

function scrapePlanSummary(f: Record<string, string>) {
  const bits = [
    f.position,
    f.location,
    f.qty ? `เป้า ${f.qty} คน` : '',
    f.gender && f.gender !== 'ไม่ระบุ' ? f.gender : '',
  ].filter(Boolean);
  return bits.join(' · ') || 'ตามใบขอ';
}

function RoomSwitcher() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">ห้องนี้</p>
        <h2 className="mt-1 text-lg font-semibold text-emerald-950">ค้นหาผู้สมัคร</h2>
        <p className="mt-1 text-sm text-emerald-900/80">รับใบขอ → เลือก JobBKK/JobThai → เริ่มค้นหา</p>
      </div>
      <Link
        href="/autopost"
        className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 transition hover:border-sky-400 hover:bg-sky-100"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">ไปอีกห้อง</p>
        <h2 className="mt-1 text-lg font-semibold text-sky-950">โพสต์ Facebook →</h2>
        <p className="mt-1 text-sm text-sky-900/80">ใส่ caption + รูป แล้วสั่งโพสต์ที่ Autopost</p>
      </Link>
    </div>
  );
}

function DisabledContentBanner({ requests }: { requests: DisabledContentRequest[] }) {
  if (requests.length === 0) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-950">
            มี {requests.length} คำขอสร้างประกาศ — ระบบนี้ไม่รับแล้ว
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            {requests.slice(0, 3).map((r) => r.title || r.requestNo).join(' · ')}
            {requests.length > 3 ? ` · +${requests.length - 3}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/autopost" className="btn-ghost btn-sm">ไปโพสต์ Facebook</Link>
          <form action={rejectDisabledContentRequestsAction}>
            {requests.map((r) => (
              <input key={r.requestNo} type="hidden" name="requestNo" value={r.requestNo} />
            ))}
            <button className="btn-secondary btn-sm">ตีกลับทั้งหมด</button>
          </form>
        </div>
      </div>
    </div>
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

function ScrapeQuickRunForm({ item, connectors }: { item: WorkCenterItem; connectors: Option[] }) {
  const f = item.requestFields ?? {};
  const defaultConnector = connectors.find((c) => c.available)?.id ?? '';
  const canRun = Boolean(defaultConnector);
  return (
    <form action={startSoRecruitScrapeAction} className="space-y-3" data-pause-refresh="1">
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
        <button className="btn-primary" disabled={!canRun}>เริ่มค้นหา</button>
      </div>
      {!canRun && (
        <Link href="/settings/connectors" className="text-xs text-accent hover:underline">เพิ่มบัญชีค้นหาก่อน</Link>
      )}
    </form>
  );
}

function ScrapeIntakeForm({ item, connectors }: { item: WorkCenterItem; connectors: Option[] }) {
  const f = item.requestFields ?? {};
  return (
    <form action={startSoRecruitScrapeAction} className="space-y-3" data-pause-refresh="1">
      <input type="hidden" name="requestNo" value={item.requestNo ?? ''} />
      <div className="rounded-xl border border-line bg-black/[0.02] px-3 py-3">
        <div className="text-sm font-medium text-ink">แก้แผนก่อนเริ่ม</div>
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
        <button className="btn-primary" disabled={!connectors.some((c) => c.available)}>เริ่มค้นหา</button>
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
  expanded: boolean;
  onTogglePlan: () => void;
}) {
  if (item.stage === 'intake' && item.requestNo && item.kind === 'scraping') {
    return (
      <div className="w-full space-y-3" data-pause-refresh="1">
        {expanded ? (
          <ScrapeIntakeForm item={item} connectors={connectors} />
        ) : (
          <ScrapeQuickRunForm item={item} connectors={connectors} />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onTogglePlan}>
            {expanded ? 'ย่อแผน' : 'แก้แผนก่อนรัน'}
          </button>
          <RejectBlock item={item} />
        </div>
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
  defaultExpanded,
}: {
  item: WorkCenterItem;
  connectors: Option[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const f = item.requestFields ?? {};
  const missing = item.checklist?.filter((c) => !c.ok) ?? [];
  const metaBits = [
    item.requestNo,
    item.stage === 'intake' ? scrapePlanSummary(f) : item.context,
    fmtDate(item.createdAt),
  ].filter(Boolean);

  return (
    <article className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink">
            {item.href ? (
              <Link href={item.href} className="hover:text-accent hover:underline">
                {item.title}
              </Link>
            ) : item.title}
          </h3>
          <p className="mt-1 text-xs text-subtle">{metaBits.join(' · ')}</p>
        </div>
        <span className={`pill shrink-0 ${STAGE_PILL[item.stage]}`}>{item.statusLabel}</span>
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-xs text-red-600">ขาดในใบขอ: {missing.map((m) => m.label).join(', ')}</p>
      )}

      {item.detail && item.stage === 'attention' && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg border-l-2 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          {item.detail.length > 280 ? `${item.detail.slice(0, 280)}…` : item.detail}
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
          expanded={expanded}
          onTogglePlan={() => setExpanded((v) => !v)}
        />
      </div>
    </article>
  );
}

export function WorkCenter({
  items,
  connectors,
  facebookAccounts,
  disabledContentRequests = [],
}: {
  items: WorkCenterItem[];
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
  disabledContentRequests?: DisabledContentRequest[];
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
      : done;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'todo', label: 'ต้องทำวันนี้', count: todo.length },
    { key: 'running', label: 'กำลังค้นหา', count: running.length },
    { key: 'done', label: 'เสร็จแล้ว', count: done.length },
  ];

  const fbProblems = facebookAccounts.filter((a) => (
    a.groupCount <= 0
    || !a.preferredWorker
    || !a.workerOnline
    || !a.preflightReady
    || !a.preflightVerified
  )).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ศูนย์งาน</h1>
        <p className="mt-1 text-sm text-subtle">โฟกัสงานค้นหาผู้สมัคร — โพสต์ Facebook อยู่อีกห้อง</p>
      </div>

      <RoomSwitcher />
      <DisabledContentBanner requests={disabledContentRequests} />

      {(fbProblems > 0 || facebookAccounts.length === 0) && (
        <details className="rounded-xl border border-line bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm text-subtle">
            บัญชี Facebook ยังไม่พร้อม {facebookAccounts.length === 0 ? '(ยังไม่มีบัญชี)' : `(${fbProblems} บัญชี)`} — กดดูถ้าจะโพสต์
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/autopost/accounts" className="btn-secondary btn-sm">ไปเตรียมบัญชี</Link>
            <Link href="/settings/connectors" className="btn-ghost btn-sm">ตั้งค่าบัญชี</Link>
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="กรองงานค้นหา">
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
          {tab === 'todo' ? 'ไม่มีงานค้นหาที่ต้องทำตอนนี้' : tab === 'running' ? 'ไม่มีงานที่กำลังค้นหา' : 'ยังไม่มีงานที่เสร็จ'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item, index) => (
            <WorkItemCard
              key={item.id}
              item={item}
              connectors={connectors}
              defaultExpanded={tab === 'todo' && todo.length === 1 && index === 0 && item.stage === 'intake'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
