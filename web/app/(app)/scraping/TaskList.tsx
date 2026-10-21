'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TaskRow } from '@/lib/repo';
import { ScrapingStatusBar } from '@/components/ScrapingStatusBar';
import { deleteTaskAction, expandAdjacentTaskAction, queueTaskAction, toggleTaskAction, updateTaskCriteriaAction } from '@/lib/actions';
import { humanizeOperatorError, operatorJobTitle } from '@/lib/operator-copy';
import { cn } from '@/lib/utils';
import { CheckIcon, ChevronDownIcon, CircleAlertIcon, CircleIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

type LiveStatus = {
  id: string;
  status: string;
  phase: string;
  progress_got: number;
  progress_target: number;
  last_error: string | null;
  last_run_at: string | null;
  updated_at: string | null;
  qualified_count: number;
  needs_review_count: number;
  rejected_count: number;
  assessed_total: number;
  last_progress_at: string | null;
};

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

// The auto pipeline phases, in order, with the message shown while active.
const PHASES = ['scraping', 'ocr', 'enrich'] as const;
const PHASE_LABEL: Record<string, string> = {
  scraping: 'กำลังดึงข้อมูลผู้สมัคร',
  ocr: 'กำลังอ่านเอกสารแนบด้วย AI (OCR)',
  enrich: 'กำลังทำความสะอาดและเติมข้อมูล Candidate ที่ขาด',
};
const PHASE_DONE_LABEL: Record<string, string> = {
  scraping: 'ดึงข้อมูลผู้สมัครเรียบร้อยแล้ว',
  ocr: 'อ่านเอกสารแนบ (OCR) เสร็จแล้ว',
  enrich: 'เติมข้อมูล Candidate เรียบร้อยแล้ว',
};
const STATUS: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  idle: { label: 'พร้อม', variant: 'outline' },
  queued: { label: 'รอคิว', variant: 'outline' },
  running: { label: 'กำลังทำงาน', variant: 'secondary' },
  done: { label: 'เสร็จ', variant: 'secondary' },
  partial: { label: 'ยังไม่ครบเป้า', variant: 'outline' },
  error: { label: 'ผิดพลาด', variant: 'destructive' },
};

function scheduleLabel(cron: string | null): string {
  if (!cron) return 'รันเอง';
  if (cron === '@hourly') return 'ทุกชั่วโมง';
  if (cron === '@daily') return 'ทุกวัน';
  const m = cron.match(/^every:(\d+)$/);
  if (m) return `ทุก ${Math.round(Number(m[1]) / 60)} นาที`;
  return cron;
}

/** Human-readable chips for the criteria/filters saved on a task. */
function filterChips(criteria: Record<string, unknown>): string[] {
  const c = criteria ?? {};
  const val = (k: string) => {
    const v = c[k];
    return v == null || String(v).trim() === '' ? '' : String(v).trim();
  };
  const fmtBaht = (v: string) => (v ? Number(v).toLocaleString('en-US') : v);
  const chips: string[] = [];
  if (val('job_description')) chips.push(`เนื้องาน: ${val('job_description')}`);
  if (val('position')) chips.push(`ตำแหน่ง: ${val('position')}`);
  if (val('keyword')) chips.push(`คำค้น: ${val('keyword')}`);
  if (val('gender')) chips.push(`เพศ: ${val('gender')}`);
  if (val('industry')) chips.push(`ประเภทงาน: ${val('industry')}`);
  if (val('province')) chips.push(`จังหวัด: ${val('province')}`);
  if (val('education')) chips.push(`วุฒิ: ${val('education')}`);
  const smin = val('salaryMin');
  const smax = val('salaryMax');
  if (smin || smax) chips.push(smin && smax ? `เงินเดือน: ${fmtBaht(smin)} ถึง ${fmtBaht(smax)}` : smin ? `เงินเดือน: ${fmtBaht(smin)} ขึ้นไป` : `เงินเดือน: ไม่เกิน ${fmtBaht(smax)}`);
  const amin = val('ageMin');
  const amax = val('ageMax');
  if (amin || amax) chips.push(amin && amax ? `อายุ: ${amin} ถึง ${amax} ปี` : amin ? `อายุ: ${amin} ปีขึ้นไป` : `อายุ: ไม่เกิน ${amax} ปี`);
  return chips;
}

function ExpandBtn({ taskId, position }: { taskId: string; position: string }) {
  return (
    <form action={expandAdjacentTaskAction}>
      <input type="hidden" name="id" value={taskId} />
      <input type="hidden" name="position" value={position} />
      <Button variant="outline" size="xs">
        <PlusIcon data-icon="inline-start" />
        {position}
      </Button>
    </form>
  );
}

/** แผน Job Family จาก AI: ตำแหน่งที่ขยายไปแล้ว (ใกล้มาก) และที่เสนอให้กดค้นเพิ่ม (ใกล้ปานกลาง/ใกล้น้อย) */
function AdjacentPlanPanel({ task }: { task: TaskRow }) {
  const plan = task.adjacent_plan;
  if (!plan) return null;
  const green = plan.expanded_green ?? [];
  const yellow = plan.suggested?.yellow ?? [];
  const red = plan.suggested?.red ?? [];
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
      <p className="font-medium">
        {String(plan.family_label ?? plan.family ?? 'Job Family').replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')}
        {typeof plan.filled === 'number' && plan.target ? (
          <span className="ml-1 font-normal text-muted-foreground">· เติมได้ {plan.filled}/{plan.target}</span>
        ) : null}
      </p>
      {green.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">ขยายไปแล้ว (ใกล้มาก)</span>
          {green.map((g) => (
            <Badge key={g} variant="secondary">{g}</Badge>
          ))}
        </div>
      )}
      {yellow.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">ใกล้ปานกลาง กดเพื่อค้นเพิ่ม</span>
          {yellow.map((p) => <ExpandBtn key={p} taskId={task.id} position={p} />)}
        </div>
      )}
      {red.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">ใกล้น้อย กดเพื่อค้นเพิ่ม</span>
          {red.map((p) => <ExpandBtn key={p} taskId={task.id} position={p} />)}
        </div>
      )}
      {plan.reason && <p className="text-muted-foreground">{plan.reason}</p>}
    </div>
  );
}

export function TaskList({ initialTasks }: { initialTasks: TaskRow[] }) {
  const [live, setLive] = useState<Record<string, LiveStatus>>({});

  // Poll live status. If a task sits in "queued" too long, re-kick the worker
  // (covers cases where the first kick failed silently).
  useEffect(() => {
    let active = true;
    const queuedAt = new Map<string, number>();

    const tick = async () => {
      try {
        const res = await fetch('/api/scrape-tasks', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { tasks: LiveStatus[] };
        const map: Record<string, LiveStatus> = {};
        const now = Date.now();
        let needKick = false;

        for (const t of data.tasks) {
          map[t.id] = t;
          if (t.status === 'queued') {
            if (!queuedAt.has(t.id)) queuedAt.set(t.id, now);
            else if (now - (queuedAt.get(t.id) ?? now) > 5000) needKick = true;
          } else {
            queuedAt.delete(t.id);
          }
        }

        setLive(map);
        if (needKick) {
          await fetch('/api/run-worker', { method: 'POST' }).catch(() => {});
        }
      } catch {
        /* ignore transient poll errors */
      }
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  if (initialTasks.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>ยังไม่มีงานค้นหา</EmptyTitle>
          <EmptyDescription>สร้างงานใหม่จากฟอร์มด้านบน</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const activeTask = initialTasks.find((t) => {
    const status = live[t.id]?.status ?? t.status;
    return status === 'running' || status === 'queued';
  });
  const activeLive = activeTask ? live[activeTask.id] : undefined;

  return (
    <div className="flex flex-col gap-4">
      {activeTask && (
        <div className="sticky top-17 z-20 sm:top-16">
          <ScrapingStatusBar
            taskName={activeTask.name}
            status={activeLive?.status ?? activeTask.status}
            phase={activeLive?.phase ?? activeTask.phase ?? 'idle'}
            qualified={activeLive?.qualified_count ?? activeTask.qualified_count ?? 0}
            assessed={activeLive?.assessed_total ?? activeTask.assessed_total ?? 0}
            got={activeLive?.progress_got ?? activeTask.progress_got}
            target={activeLive?.progress_target ?? activeTask.progress_target}
            lastProgressAt={activeLive?.last_progress_at ?? activeTask.last_progress_at ?? null}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
      {initialTasks.map((t) => {
        const s = live[t.id];
        const status = s?.status ?? t.status;
        const got = s?.progress_got ?? t.progress_got;
        const target = s?.progress_target ?? t.progress_target;
        const error = s?.last_error ?? t.last_error;
        const meta = STATUS[status] ?? STATUS.idle;
        const busy = status === 'running' || status === 'queued';
        const phase = s?.phase ?? t.phase ?? 'idle';
        const qualified = s?.qualified_count ?? t.qualified_count ?? got;
        const needsReview = s?.needs_review_count ?? t.needs_review_count ?? 0;
        const rejected = s?.rejected_count ?? t.rejected_count ?? 0;
        const assessed = s?.assessed_total ?? t.assessed_total ?? 0;
        const pctBase = phase === 'scraping' ? qualified : got;
        const pct = target > 0 ? Math.min(100, Math.round((pctBase / target) * 100)) : 0;
        const phaseIdx = PHASES.indexOf(phase as (typeof PHASES)[number]);
        const alreadyComplete = status === 'done' && target > 0 && qualified >= target;
        const taskTitle = operatorJobTitle({ position: t.criteria?.position || t.criteria?.keyword, title: t.name, requestNo: t.source_request_no });
        const humanError = humanizeOperatorError(error);
        const runDisabled = busy || !t.enabled || alreadyComplete || !t.connector_available;
        const chips = filterChips(t.criteria);

        return (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {taskTitle}
                <Badge variant={meta.variant}>{meta.label}</Badge>
                {!t.enabled && <Badge variant="outline">ปิดอยู่</Badge>}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {PLATFORM_LABEL[t.platform] ?? t.platform} · {t.connector_label} ·{' '}
                {t.mode === 'count' ? `จำนวน ${t.target_count ?? '-'}` : `ตั้งแต่ ${t.updated_since ?? '-'}`} ·{' '}
                {scheduleLabel(t.schedule_cron)}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 leading-relaxed">
              {chips.length > 0 && (
                <p className="text-muted-foreground">{chips.join(' · ')}</p>
              )}

              {assessed > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">ผ่าน {qualified}</Badge>
                  <Badge variant="outline">ต้องตรวจเพิ่ม {needsReview}</Badge>
                  <Badge variant="destructive">ไม่ผ่าน {rejected}</Badge>
                </div>
              )}

              {alreadyComplete && (
                <p className="text-muted-foreground">ได้ผู้สมัครผ่านเกณฑ์ครบ {qualified}/{target} แล้ว ถ้าจะค้นเพิ่ม ให้สร้างงานใหม่หรือเพิ่มเป้า</p>
              )}

              {!t.connector_available && t.connector_block_reason && (
                <Alert>
                  <CircleAlertIcon />
                  <AlertTitle>ยังเริ่มงานนี้ไม่ได้</AlertTitle>
                  <AlertDescription>
                    {t.connector_block_reason}{' '}
                    <Link href="/settings/connectors">ไปตรวจ Connector</Link>
                  </AlertDescription>
                </Alert>
              )}

              {/* ขั้นตอน: ดึงข้อมูล, OCR, เติมข้อมูล, เสร็จ */}
              {(status !== 'idle' || got > 0) && (
                <div className="flex flex-col gap-1.5">
                  {status === 'queued' && <p className="text-muted-foreground">อยู่ในคิว รอเริ่มทำงาน</p>}
                  {status === 'running' && phase === 'login' && (
                    <p className="text-muted-foreground">กำลัง login เข้าแพลตฟอร์ม (เปิด browser)</p>
                  )}

                  <ol className="flex flex-col gap-1.5">
                    {PHASES.map((p, idx) => {
                      let state: 'done' | 'active' | 'pending' | 'error';
                      if (status === 'done' || status === 'partial') state = 'done';
                      else if (status === 'error') state = phaseIdx > idx ? 'done' : phaseIdx === idx ? 'error' : 'pending';
                      else if (phaseIdx < 0) state = 'pending';
                      else state = phaseIdx > idx ? 'done' : phaseIdx === idx ? 'active' : 'pending';

                      return (
                        <li
                          key={p}
                          className={cn(
                            'flex items-center gap-2',
                            state === 'active' && 'font-medium text-foreground',
                            state === 'done' && 'text-muted-foreground',
                            state === 'error' && 'text-destructive',
                            state === 'pending' && 'text-muted-foreground opacity-60',
                          )}
                        >
                          {state === 'done' ? (
                            <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
                          ) : state === 'error' ? (
                            <XIcon className="size-3.5 shrink-0" aria-hidden="true" />
                          ) : state === 'active' ? (
                            <Spinner className="size-3.5 shrink-0" />
                          ) : (
                            <CircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>
                            {state === 'done' ? PHASE_DONE_LABEL[p] : PHASE_LABEL[p]}
                            {state === 'active' && (target > 0
                              ? p === 'scraping'
                                ? <span className="ml-1 font-normal tabular-nums">· ตรวจแล้ว {assessed} โปรไฟล์ · ผ่านเกณฑ์ {qualified}/{target}</span>
                                : <span className="ml-1 font-normal tabular-nums">· {got}/{target}</span>
                              : p === 'ocr' ? ' · ไม่มีเอกสารแนบ' : null)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  {busy && phaseIdx >= 0 && (
                    <Progress value={target > 0 ? pct : 100} className="mt-1" aria-label="ความคืบหน้าขั้นตอนนี้" />
                  )}

                  {status === 'done' && (
                    <p className="mt-1 flex items-center gap-2 font-medium">
                      <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      ได้ Resume ผ่านเกณฑ์ครบ {qualified}/{target}
                    </p>
                  )}
                  {status === 'partial' && (
                    <p className="mt-1 font-medium">
                      ได้ Resume ผ่านเกณฑ์ไม่ซ้ำ {qualified}/{target} กด “รันตอนนี้” เพื่อค้นต่อ
                    </p>
                  )}
                </div>
              )}

              {status === 'done' && got === 0 && (
                <Alert>
                  <CircleAlertIcon />
                  <AlertTitle>รอบนี้ไม่พบผลลัพธ์</AlertTitle>
                  <AlertDescription>
                    ส่วนใหญ่เป็นเพราะใส่ตัวกรองหลายอย่างพร้อมกัน (ตำแหน่ง จังหวัด วุฒิ อายุ) หรือคำค้นตำแหน่งไม่ตรงกับคำที่คนเขียนในเรซูเม่
                    ลองเอาอายุหรือวุฒิออก แล้วกด “รันตอนนี้” อีกครั้ง
                  </AlertDescription>
                </Alert>
              )}
              {status === 'partial' && humanError && (
                <p className="text-muted-foreground">{humanError.detail} · {humanError.next}</p>
              )}
              {status === 'error' && humanError && (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>{humanError.title}</AlertTitle>
                  <AlertDescription className="flex flex-col gap-1.5">
                    <p>{humanError.detail}</p>
                    <p className="font-medium">ทำต่อ: {humanError.next}</p>
                    {humanError.technical && (
                      <p className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs wrap-break-word text-muted-foreground">
                        สาเหตุระบบ: {humanError.technical}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* แก้เกณฑ์การค้นหลังสร้าง — ปิดตอนกำลังวิ่ง (จะมีผลรอบถัดไปที่กดรัน) */}
              {!busy && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="group/trigger -ml-2.5 self-start">
                      <PencilIcon data-icon="inline-start" />
                      แก้เกณฑ์การค้น
                      <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]/trigger:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <form action={updateTaskCriteriaAction} className="mt-2 rounded-lg border p-3">
                      <input type="hidden" name="id" value={t.id} />
                      <FieldGroup className="gap-4">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <Field>
                            <FieldLabel htmlFor={`ed-pos-${t.id}`}>ตำแหน่ง</FieldLabel>
                            <Input id={`ed-pos-${t.id}`} name="position" defaultValue={String(t.criteria?.position ?? '')} />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`ed-kw-${t.id}`}>คำค้น</FieldLabel>
                            <Input id={`ed-kw-${t.id}`} name="keyword" defaultValue={String(t.criteria?.keyword ?? '')} />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`ed-prov-${t.id}`}>จังหวัด</FieldLabel>
                            <Input id={`ed-prov-${t.id}`} name="province" defaultValue={String(t.criteria?.province ?? '')} />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`ed-target-${t.id}`}>เป้า (คน)</FieldLabel>
                            <Input id={`ed-target-${t.id}`} name="targetCount" type="number" min={1} defaultValue={t.target_count ?? ''} />
                          </Field>
                        </div>
                        <FieldDescription>ลบข้อความในช่องออกถ้าจะเลิกใช้เกณฑ์นั้น มีผลตอนกด “รันตอนนี้” รอบถัดไป</FieldDescription>
                        <Field orientation="horizontal">
                          <Button variant="secondary" size="sm">บันทึกเกณฑ์</Button>
                        </Field>
                      </FieldGroup>
                    </form>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <AdjacentPlanPanel task={t} />
            </CardContent>

            <CardFooter className="flex flex-wrap gap-2">
              <form action={queueTaskAction}>
                <input type="hidden" name="id" value={t.id} />
                <Button
                  variant={runDisabled ? 'outline' : 'default'}
                  disabled={runDisabled}
                  title={t.connector_block_reason || undefined}
                >
                  {alreadyComplete ? (
                    <>
                      <CheckIcon data-icon="inline-start" />
                      ครบเป้าแล้ว
                    </>
                  ) : (
                    <>
                      <PlayIcon data-icon="inline-start" />
                      รันตอนนี้
                    </>
                  )}
                </Button>
              </form>
              <Button variant="outline" asChild>
                <Link href={`/scraping/${t.id}`}>เปิดงาน</Link>
              </Button>
              <form action={toggleTaskAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="enabled" value={(!t.enabled).toString()} />
                <Button variant="ghost">{t.enabled ? 'ปิด' : 'เปิด'}</Button>
              </form>
              <form action={deleteTaskAction} className="ml-auto">
                <input type="hidden" name="id" value={t.id} />
                <Button variant="destructive">
                  <Trash2Icon data-icon="inline-start" />
                  ลบ
                </Button>
              </form>
            </CardFooter>
          </Card>
        );
      })}
      </div>
    </div>
  );
}
