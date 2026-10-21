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
import { cn } from '@/lib/utils';
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, CircleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  /** มาจากคำขอใน Jarvis (ใบขอ) — ไม่ใช่งานที่สร้างเองในระบบนี้ */
  fromJarvis?: boolean;
};

/** ตัวนับคำสั่งโพสต์จาก Jarvis แยกตามชนิด (จาก listJarvisPostOrders) */
export type PostOrderSummary = {
  mode: 'caption_only' | 'caption_image' | 'image_only';
  label: string;
  pending: number;
  inProgress: number;
  posted: number;
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

type TabKey = 'todo' | 'running' | 'done' | 'old';

/** งานที่สร้างเกินกี่วันแล้วยังไม่ปิด ให้ย้ายไปแท็บงานเก่า ไม่บังงานใหม่ */
const OLD_AFTER_DAYS = 14;

function isOldItem(item: WorkCenterItem, now: number) {
  if (item.stage === 'intake' || item.stage === 'working') return false;
  return now - new Date(item.createdAt).getTime() > OLD_AFTER_DAYS * 86_400_000;
}

function Stat({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: number;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('text-2xl font-semibold tabular-nums', danger && value > 0 && 'text-destructive')}>{value}</dd>
      {sub && <dd className="text-sm text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function ScrapCounters({ items }: { items: WorkCenterItem[] }) {
  const jarvis = items.filter((i) => i.fromJarvis);
  const waiting = jarvis.filter((i) => i.stage === 'intake').length;
  const started = items.filter((i) => i.stage === 'working').length;
  const finished = jarvis.filter((i) => i.stage === 'completed' || i.stage === 'review').length;
  const problems = jarvis.filter((i) => i.stage === 'attention').length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scrap</CardTitle>
        <CardDescription>คำขอค้นหาผู้สมัครจาก Jarvis</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="ส่งมาจาก Jarvis" value={jarvis.length} sub={waiting ? `รอกดเริ่ม ${waiting}` : 'เริ่มครบแล้ว'} />
          <Stat label="เริ่มแล้ว" value={started} sub="กำลังค้นหา" />
          <Stat label="เสร็จ" value={finished} />
          <Stat label="ติดปัญหา" value={problems} danger />
        </dl>
      </CardContent>
    </Card>
  );
}

function PostCounters({ summary }: { summary: PostOrderSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Autopost</CardTitle>
        <CardDescription>คำสั่งโพสต์จาก Jarvis</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/autopost/jobs">
              ไปหน้างานโพสต์
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {summary.map((s) => {
            const parts = [
              s.pending ? `รอโพสต์ ${s.pending}` : '',
              s.inProgress ? `กำลังโพสต์ ${s.inProgress}` : '',
              s.posted ? `โพสต์แล้ว ${s.posted}` : '',
            ].filter(Boolean);
            return (
              <Link key={s.mode} href="/autopost/jobs" className="-m-2 rounded-lg p-2 transition-colors hover:bg-muted">
                <Stat label={s.label} value={s.pending + s.inProgress + s.posted} sub={parts.join(' · ') || 'ยังไม่มีคำสั่ง'} />
              </Link>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

const STAGE_PRIORITY: Record<WorkCenterStage, number> = {
  attention: 0,
  review: 1,
  intake: 2,
  working: 3,
  completed: 4,
};

const STAGE_BADGE: Record<WorkCenterStage, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  intake: 'outline',
  working: 'secondary',
  review: 'default',
  completed: 'secondary',
  attention: 'destructive',
};

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
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

function StepLine({ steps }: { steps: Step[] }) {
  const shown = steps.filter((s) => s.state !== 'skip');
  if (shown.length === 0) return null;
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-label="ขั้นตอนของงาน">
      {shown.map((s) => (
        <li
          key={s.label}
          aria-current={s.state === 'active' ? 'step' : undefined}
          className={cn(
            'flex items-center gap-1',
            s.state === 'done' && 'text-muted-foreground',
            s.state === 'active' && 'font-medium text-foreground',
            s.state === 'failed' && 'font-medium text-destructive',
            s.state === 'todo' && 'text-muted-foreground opacity-60',
          )}
        >
          {s.state === 'done' && <CheckIcon className="size-3.5" aria-hidden="true" />}
          {s.state === 'failed' && <CircleAlertIcon className="size-3.5" aria-hidden="true" />}
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function DisabledContentBanner({ requests }: { requests: DisabledContentRequest[] }) {
  if (requests.length === 0) return null;
  return (
    <Alert>
      <CircleAlertIcon />
      <AlertTitle>มีคำขอสร้างประกาศ {requests.length} รายการ ระบบนี้ไม่รับแล้ว</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          {requests.slice(0, 3).map((r) => r.title || r.requestNo).join(' · ')}
          {requests.length > 3 ? ` และอีก ${requests.length - 3} รายการ` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={rejectDisabledContentRequestsAction}>
            {requests.map((r) => (
              <input key={r.requestNo} type="hidden" name="requestNo" value={r.requestNo} />
            ))}
            <Button variant="secondary" size="sm">ตีกลับทั้งหมด</Button>
          </form>
          <Button variant="outline" size="sm" asChild>
            <Link href="/autopost">ไปโพสต์ Facebook</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function ConnectorSelect({ id, connectors, defaultValue }: { id: string; connectors: Option[]; defaultValue: string }) {
  return (
    <Field className="min-w-52 flex-1">
      <FieldLabel htmlFor={id}>บัญชีค้นหา</FieldLabel>
      <NativeSelect id={id} name="connectorId" required defaultValue={defaultValue} className="w-full">
        <NativeSelectOption value="" disabled>เลือก JobBKK หรือ JobThai</NativeSelectOption>
        {connectors.map((c) => (
          <NativeSelectOption key={c.id} value={c.id} disabled={!c.available}>
            {c.label}{c.available ? '' : ` (${c.blockReason})`}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function ScrapeQuickRunForm({ item, connectors }: { item: WorkCenterItem; connectors: Option[] }) {
  const f = item.requestFields ?? {};
  const defaultConnector = connectors.find((c) => c.available)?.id ?? '';
  const canRun = Boolean(defaultConnector);
  return (
    <form action={startSoRecruitScrapeAction} className="flex flex-col gap-2" data-pause-refresh="1">
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
        <ConnectorSelect id={`connector-quick-${item.id}`} connectors={connectors} defaultValue={defaultConnector} />
        <Button disabled={!canRun}>เริ่มค้นหา</Button>
      </div>
      {!canRun && (
        <Button variant="link" size="sm" asChild className="self-start px-0">
          <Link href="/settings/connectors">เพิ่มบัญชีค้นหาก่อน</Link>
        </Button>
      )}
    </form>
  );
}

function ScrapeIntakeForm({ item, connectors }: { item: WorkCenterItem; connectors: Option[] }) {
  const f = item.requestFields ?? {};
  return (
    <form action={startSoRecruitScrapeAction} className="flex flex-col gap-4" data-pause-refresh="1">
      <input type="hidden" name="requestNo" value={item.requestNo ?? ''} />
      <input type="hidden" name="scrapeIndustry" value={f.industry ?? ''} />
      <FieldSet className="rounded-lg border p-4">
        <FieldLegend variant="label" className="px-1">แก้แผนก่อนเริ่ม</FieldLegend>
        <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor={`sp-pos-${item.id}`}>ตำแหน่ง</FieldLabel>
            <Input id={`sp-pos-${item.id}`} name="scrapePosition" defaultValue={f.position ?? ''} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-kw-${item.id}`}>Keyword</FieldLabel>
            <Input id={`sp-kw-${item.id}`} name="scrapeKeyword" defaultValue={f.keyword ?? ''} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-prov-${item.id}`}>จังหวัด</FieldLabel>
            <Input id={`sp-prov-${item.id}`} name="scrapeProvince" list={`province-options-${item.id}`} defaultValue={f.location ?? ''} />
            <datalist id={`province-options-${item.id}`}>
              {PROVINCES.map((province) => <option key={province} value={province} />)}
            </datalist>
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-target-${item.id}`}>เป้า (คน)</FieldLabel>
            <Input id={`sp-target-${item.id}`} name="scrapeTarget" type="number" min={1} defaultValue={f.qty || ''} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-gender-${item.id}`}>เพศ</FieldLabel>
            <NativeSelect id={`sp-gender-${item.id}`} name="scrapeGender" defaultValue={f.gender || 'ไม่ระบุ'} className="w-full">
              {GENDERS.map((gender) => <NativeSelectOption key={gender} value={gender}>{gender}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-edu-${item.id}`}>วุฒิ</FieldLabel>
            <NativeSelect id={`sp-edu-${item.id}`} name="scrapeEducation" defaultValue={f.education || 'ไม่ระบุ'} className="w-full">
              {EDUCATION_LEVELS.map((level) => <NativeSelectOption key={level} value={level}>{level}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`sp-sal-min-${item.id}`}>เงินเดือน</FieldLabel>
            <div className="flex items-center gap-2">
              <NativeSelect id={`sp-sal-min-${item.id}`} name="scrapeSalaryMin" defaultValue={f.salary_min ?? ''} className="w-full" aria-label="เงินเดือนต่ำสุด">
                <NativeSelectOption value="">ต่ำสุด</NativeSelectOption>
                {salarySelectOptions(f.salary_min).map((step) => (
                  <NativeSelectOption key={`min-${step}`} value={step}>{salaryLabel(step)}</NativeSelectOption>
                ))}
              </NativeSelect>
              <span className="text-muted-foreground">ถึง</span>
              <NativeSelect name="scrapeSalaryMax" defaultValue={f.salary_max ?? ''} className="w-full" aria-label="เงินเดือนสูงสุด">
                <NativeSelectOption value="">สูงสุด</NativeSelectOption>
                {salarySelectOptions(f.salary_max).map((step) => (
                  <NativeSelectOption key={`max-${step}`} value={step}>{salaryLabel(step)}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-age-min-${item.id}`}>อายุ</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id={`sp-age-min-${item.id}`} name="scrapeAgeMin" type="number" min={15} max={80} defaultValue={f.age_min ?? ''} placeholder="ต่ำสุด" aria-label="อายุต่ำสุด" />
              <span className="text-muted-foreground">ถึง</span>
              <Input name="scrapeAgeMax" type="number" min={15} max={80} defaultValue={f.age_max ?? ''} placeholder="สูงสุด" aria-label="อายุสูงสุด" />
            </div>
          </Field>
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-wrap items-end gap-2">
        <ConnectorSelect
          id={`connector-${item.id}`}
          connectors={connectors}
          defaultValue={connectors.find((c) => c.available)?.id ?? ''}
        />
        <Button disabled={!connectors.some((c) => c.available)}>เริ่มค้นหา</Button>
      </div>
    </form>
  );
}

function RejectForm({ item }: { item: WorkCenterItem }) {
  if (!item.requestNo) return null;
  return (
    <form action={rejectRequestAction} className="mt-3 flex flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="requestNo" value={item.requestNo} />
      <input type="hidden" name="requestType" value={item.kind === 'scraping' ? 'scraping' : 'content'} />
      {item.checklist && item.checklist.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">สิ่งที่ใบขอยังขาด</FieldLegend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {item.checklist.map((c) => {
              const id = `missing-${item.id}-${c.label}`;
              return (
                <Field key={c.label} orientation="horizontal" className="w-auto">
                  <Checkbox id={id} name="missing" value={c.label} defaultChecked={!c.ok} />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {c.label}{c.ok ? '' : ' (ขาด)'}
                  </FieldLabel>
                </Field>
              );
            })}
          </div>
        </FieldSet>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-52 flex-1">
          <FieldLabel htmlFor={`reject-reason-${item.id}`} className="sr-only">เหตุผลเพิ่มเติม</FieldLabel>
          <Input id={`reject-reason-${item.id}`} name="reason" placeholder="เหตุผลเพิ่มเติม (ไม่บังคับ)" />
        </Field>
        <Button variant="secondary">ตีกลับ</Button>
      </div>
    </form>
  );
}

function IntakeActions({
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
  return (
    <div className="flex flex-col gap-3" data-pause-refresh="1">
      {expanded ? (
        <ScrapeIntakeForm item={item} connectors={connectors} />
      ) : (
        <ScrapeQuickRunForm item={item} connectors={connectors} />
      )}
      <Collapsible data-pause-refresh="1">
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onTogglePlan}>
            {expanded ? 'ย่อแผน' : 'แก้แผนก่อนรัน'}
          </Button>
          {item.requestNo && (
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="group/trigger">
                ตีกลับใบขอ
                <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]/trigger:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          )}
        </div>
        <CollapsibleContent>
          <RejectForm item={item} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function FooterActions({ item }: { item: WorkCenterItem }) {
  if (item.stage === 'review' && item.kind === 'scraping' && item.taskId) {
    return (
      <CardFooter className="flex flex-wrap gap-2">
        <form action={approveScrapeResultAction}>
          <input type="hidden" name="taskId" value={item.taskId} />
          <Button>ยืนยันข้อมูลผู้สมัคร</Button>
        </form>
        {item.href && (
          <Button variant="outline" asChild>
            <Link href={item.href}>เปิดดู Resume</Link>
          </Button>
        )}
      </CardFooter>
    );
  }

  if (item.href) {
    return (
      <CardFooter>
        <Button variant={item.stage === 'attention' ? 'default' : 'outline'} asChild>
          <Link href={item.href}>เปิดดูงาน</Link>
        </Button>
      </CardFooter>
    );
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
  const isIntake = item.stage === 'intake' && Boolean(item.requestNo) && item.kind === 'scraping';
  const metaBits = [
    item.requestNo,
    item.stage === 'intake' ? scrapePlanSummary(f) : item.context,
    fmtDate(item.createdAt),
  ].filter(Boolean);
  const hasProgress = Boolean(item.progress && item.progress.target > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-snug">
          {item.href ? (
            <Link href={item.href} className="underline-offset-4 hover:underline">
              {item.title}
            </Link>
          ) : item.title}
        </CardTitle>
        <CardDescription className="leading-relaxed">{metaBits.join(' · ')}</CardDescription>
        <CardAction>
          <Badge variant={STAGE_BADGE[item.stage]}>{item.statusLabel}</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {item.steps && item.steps.length > 0 && <StepLine steps={item.steps} />}

        {missing.length > 0 && (
          <p className="text-sm leading-relaxed text-destructive">
            ใบขอยังไม่มี: {missing.map((m) => m.label).join(', ')}
          </p>
        )}

        {item.detail && item.stage === 'attention' && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription className="leading-relaxed whitespace-pre-wrap">
              {item.detail.length > 280 ? `${item.detail.slice(0, 280)}…` : item.detail}
            </AlertDescription>
          </Alert>
        )}

        {hasProgress && item.progress && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Resume ผ่านเกณฑ์</span>
              <span className="tabular-nums text-foreground">{item.progress.qualified} / {item.progress.target}</span>
            </div>
            <Progress
              value={Math.min(100, Math.round((item.progress.qualified / item.progress.target) * 100))}
              aria-label="Resume ผ่านเกณฑ์"
            />
          </div>
        )}

        {isIntake && (
          <IntakeActions
            item={item}
            connectors={connectors}
            expanded={expanded}
            onTogglePlan={() => setExpanded((v) => !v)}
          />
        )}
      </CardContent>

      {!isIntake && <FooterActions item={item} />}
    </Card>
  );
}

const EMPTY_TEXT: Record<TabKey, string> = {
  todo: 'ไม่มีงานที่ต้องตรวจตอนนี้',
  running: 'ไม่มีงานที่กำลังค้นหา',
  done: 'ยังไม่มีงานที่เสร็จ',
  old: 'ไม่มีงานเก่าค้าง',
};

export function WorkCenter({
  items,
  connectors,
  facebookAccounts,
  disabledContentRequests = [],
  postSummary = [],
}: {
  items: WorkCenterItem[];
  connectors: Option[];
  facebookAccounts: FbAccountOption[];
  disabledContentRequests?: DisabledContentRequest[];
  postSummary?: PostOrderSummary[];
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

  const now = Date.now();
  // คำขอจาก Jarvis ที่รอกดเริ่ม แสดงบนสุดเสมอ ไม่ต้องหาในแท็บ
  const jarvisWaiting = sorted.filter((i) => i.stage === 'intake');
  const current = sorted.filter((i) => i.stage !== 'intake' && !isOldItem(i, now));
  const old = sorted.filter((i) => isOldItem(i, now));
  const todo = current.filter((i) => i.stage === 'attention' || i.stage === 'review');
  const running = current.filter((i) => i.stage === 'working');
  const done = current.filter((i) => i.stage === 'completed');

  const tabs: { key: TabKey; label: string; list: WorkCenterItem[] }[] = [
    { key: 'todo', label: 'ต้องตรวจ', list: todo },
    { key: 'running', label: 'กำลังค้นหา', list: running },
    { key: 'done', label: 'เสร็จแล้ว', list: done },
    { key: 'old', label: 'งานเก่า', list: old },
  ];

  const fbProblems = facebookAccounts.filter((a) => (
    a.groupCount <= 0
    || !a.preferredWorker
    || !a.workerOnline
    || !a.preflightReady
    || !a.preflightVerified
  )).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-snug font-semibold">ศูนย์งาน</h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            ห้องค้นหาผู้สมัคร รับใบขอ เลือก JobBKK หรือ JobThai แล้วเริ่มค้นหา
            ส่วนโพสต์ Facebook (caption และรูป) ทำที่ห้อง Autopost
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/autopost">
            ไปห้องโพสต์ Facebook
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </header>

      <DisabledContentBanner requests={disabledContentRequests} />

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          คำขอ Scrap จาก Jarvis รอกดเริ่ม
          {jarvisWaiting.length > 0 && <Badge variant="secondary" className="tabular-nums">{jarvisWaiting.length}</Badge>}
        </h2>
        {jarvisWaiting.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>ไม่มีคำขอที่รอเริ่ม</EmptyTitle>
              <EmptyDescription>สั่ง Scrap จากหน้าใบขอใน Jarvis แล้วคำขอจะขึ้นที่นี่</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          jarvisWaiting.map((item, index) => (
            <WorkItemCard
              key={item.id}
              item={item}
              connectors={connectors}
              defaultExpanded={jarvisWaiting.length === 1 && index === 0}
            />
          ))
        )}
      </section>

      <div className={cn('grid gap-4', postSummary.length > 0 && 'xl:grid-cols-2')}>
        <ScrapCounters items={items} />
        {postSummary.length > 0 && <PostCounters summary={postSummary} />}
      </div>

      {(fbProblems > 0 || facebookAccounts.length === 0) && (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>
              บัญชี Facebook ยังไม่พร้อม {facebookAccounts.length === 0 ? '(ยังไม่มีบัญชี)' : `(${fbProblems} บัญชี)`}
            </ItemTitle>
            <ItemDescription>ต้องเตรียมก่อนถ้าจะโพสต์</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" asChild>
              <Link href="/autopost/accounts">ไปเตรียมบัญชี</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/settings/connectors">ตั้งค่าบัญชี</Link>
            </Button>
          </ItemActions>
        </Item>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-4">
        <TabsList aria-label="กรองงานค้นหา" className="max-w-full overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="px-3"
              title={t.key === 'old' ? `งานที่สร้างไว้เกิน ${OLD_AFTER_DAYS} วัน` : undefined}
            >
              {t.label}
              <span className="tabular-nums text-muted-foreground">{t.list.length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key} className="flex flex-col gap-3">
            {t.key === 'old' && t.list.length > 0 && (
              <p className="text-sm text-muted-foreground">งานที่สร้างไว้เกิน {OLD_AFTER_DAYS} วัน</p>
            )}
            {t.list.length === 0 ? (
              <Empty className="border py-12">
                <EmptyHeader>
                  <EmptyDescription>{EMPTY_TEXT[t.key]}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              t.list.map((item) => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  connectors={connectors}
                  defaultExpanded={false}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
