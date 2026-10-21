'use client';

import { CheckIcon, CircleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

const PHASES = ['scraping', 'ocr', 'enrich'] as const;
type Phase = (typeof PHASES)[number];

const PHASE_SHORT: Record<Phase, string> = {
  scraping: 'ดึงข้อมูล',
  ocr: 'OCR',
  enrich: 'เติมข้อมูล',
};
const PHASE_LABEL: Record<Phase, string> = {
  scraping: 'กำลังดึงข้อมูลผู้สมัคร',
  ocr: 'กำลังอ่านเอกสารแนบด้วย AI (OCR)',
  enrich: 'กำลังทำความสะอาดและเติมข้อมูล Candidate',
};

type Props = {
  taskName: string;
  status: string;
  phase: string;
  /** จำนวน Resume ที่ผ่าน Hard Filter และนับเข้ากับเป้าหมายจริง */
  qualified: number;
  /** จำนวน Resume ที่ระบบเปิดอ่าน/ประเมินแล้วระหว่างการค้นหา */
  assessed: number;
  got: number;
  target: number;
  /** Latest candidate result or queue start; unlike updated_at this ignores heartbeats. */
  lastProgressAt?: string | null;
};

export function ScrapingStatusBar({ taskName, status, phase, qualified, assessed, got, target, lastProgressAt }: Props) {
  const busy = status === 'running' || status === 'queued';
  if (!busy) return null;

  const staleSec = lastProgressAt ? Math.round((Date.now() - new Date(lastProgressAt).getTime()) / 1000) : 0;
  const looksStuck = status === 'running' && staleSec > 600;

  const phaseIdx = PHASES.indexOf(phase as Phase);
  // แถบความสำเร็จของงานต้องอิง Resume ที่ผ่านเกณฑ์ ไม่ใช่จำนวนโปรไฟล์ที่เปิดดู.
  const successProgress = phase === 'scraping' ? qualified : got;
  const withinPct = target > 0 ? Math.min(1, successProgress / target) : status === 'queued' ? 0 : 0.35;
  const overallPct =
    status === 'queued'
      ? 2
      : Math.min(100, Math.round(((Math.max(0, phaseIdx) + withinPct) / PHASES.length) * 100));

  const stepNum = status === 'queued' ? 0 : phase === 'login' ? 0 : Math.max(1, phaseIdx + 1);

  const currentLabel =
    status === 'queued'
      ? 'รอเริ่มทำงาน'
      : phase === 'login'
        ? 'กำลัง login เข้าแพลตฟอร์ม'
        : phaseIdx >= 0
          ? PHASE_LABEL[PHASES[phaseIdx]]
          : 'กำลังเตรียมงาน';
  // progress_got ระหว่าง phase scraping คือจำนวนโปรไฟล์ที่เปิดตรวจ ไม่ใช่จำนวน
  // Resume ที่ผ่านเกณฑ์ ห้ามนำไปแสดงเป็นผลลัพธ์ 4/15 เพราะทำให้คนเข้าใจว่าได้คนแล้ว.
  const phaseProgress = phase === 'scraping' ? assessed : got;
  const phaseProgressLabel = phase === 'scraping'
    ? `ตรวจแล้ว ${phaseProgress} โปรไฟล์ · ผ่านเกณฑ์ ${qualified}/${target}`
    : `${phaseProgress}/${target}`;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Spinner className="shrink-0 text-muted-foreground" />
          <span className="truncate">
            {status === 'queued' ? 'อยู่ในคิว' : 'กำลังทำงาน'}: {taskName}
          </span>
        </CardTitle>
        <CardDescription className="leading-relaxed">
          ขั้นตอนที่ {stepNum} จาก {PHASES.length} · {currentLabel}
          {status === 'running' && target > 0 && (
            <span className="ml-1 tabular-nums text-foreground">({phaseProgressLabel})</span>
          )}
        </CardDescription>
        <CardAction>
          <span className="text-sm font-medium tabular-nums">{overallPct}%</span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={overallPct} aria-label="ความคืบหน้าทั้งงาน" />
        <ol className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {PHASES.map((p, idx) => {
            let state: 'done' | 'active' | 'pending';
            if (status === 'queued') state = idx === 0 ? 'active' : 'pending';
            else if (phaseIdx < 0) state = 'pending';
            else state = phaseIdx > idx ? 'done' : phaseIdx === idx ? 'active' : 'pending';

            return (
              <li
                key={p}
                className={cn(
                  'flex items-center gap-1.5',
                  state === 'active' ? 'font-medium text-foreground' : 'text-muted-foreground',
                  state === 'pending' && 'opacity-60',
                )}
              >
                {state === 'done' ? (
                  <CheckIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  <span className="tabular-nums">{idx + 1}.</span>
                )}
                {PHASE_SHORT[p]}
              </li>
            );
          })}
        </ol>
        {looksStuck && (
          <p className="flex items-start gap-2 text-sm leading-relaxed text-destructive">
            <CircleAlertIcon className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
            ไม่มีผลลัพธ์ใหม่มา {Math.floor(staleSec / 60)} นาทีแล้ว ระบบยังไม่นับว่างานเดินหน้า
          </p>
        )}
      </CardContent>
    </Card>
  );
}
