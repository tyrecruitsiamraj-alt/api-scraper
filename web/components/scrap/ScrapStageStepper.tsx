import { CheckIcon, XIcon } from 'lucide-react';
import type { ScrapStageState, ScrapStageStep } from '@/lib/scrap-stage';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

const STATE_TEXT: Record<ScrapStageState, string> = {
  done: 'เสร็จ',
  failed: 'ติดที่ขั้นนี้',
  current: '',
  upcoming: '',
};

/**
 * ขั้นของงาน Scrap: แนวนอนบนจอกว้าง แนวตั้งบนมือถือ
 * running=true แสดง spinner ที่ขั้นปัจจุบัน; false แปลว่ารอคนทำต่อ (เช่น รอตรวจรับ)
 */
export function ScrapStageStepper({ steps, running }: { steps: ScrapStageStep[]; running: boolean }) {
  return (
    <ol className="flex flex-col md:flex-row md:items-start" aria-label="ขั้นของงาน">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const isCurrent = step.state === 'current';
        const sub = isCurrent ? (running ? 'กำลังทำ' : 'รอคนทำต่อ') : STATE_TEXT[step.state];
        return (
          <li
            key={step.key}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'relative flex gap-3 pb-5 last:pb-0',
              'md:flex-1 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center',
            )}
          >
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-9 bottom-1 left-4 w-px',
                  'md:top-4 md:right-[calc(-50%+1.5rem)] md:bottom-auto md:left-[calc(50%+1.5rem)] md:h-px md:w-auto',
                  step.state === 'done' ? 'bg-success/50' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'relative flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium tabular-nums',
                step.state === 'done' && 'border-success/30 bg-success/10 text-success',
                step.state === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
                isCurrent && running && 'border-primary bg-primary/10 text-primary',
                isCurrent && !running && 'border-warning/40 bg-warning/10 text-warning',
                step.state === 'upcoming' && 'bg-background text-muted-foreground',
              )}
            >
              {step.state === 'done' ? (
                <CheckIcon className="size-4" aria-hidden="true" />
              ) : step.state === 'failed' ? (
                <XIcon className="size-4" aria-hidden="true" />
              ) : isCurrent && running ? (
                <Spinner className="size-4" aria-label="กำลังทำ" />
              ) : (
                idx + 1
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 pt-1 md:px-1 md:pt-0">
              <span
                className={cn(
                  'text-sm leading-snug',
                  isCurrent && 'font-medium text-foreground',
                  step.state === 'failed' && 'font-medium text-destructive',
                  step.state === 'done' && 'text-foreground',
                  step.state === 'upcoming' && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
              {sub && (
                <span className={cn('text-xs', step.state === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
                  {sub}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
