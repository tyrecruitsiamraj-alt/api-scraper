import { CheckIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { POST_TASK_STEPS } from '../../../src/core/post-task-state.js';
import type { PostGroupStatus, PostTaskGroup } from '../../../src/core/post-task-state.js';
import type { PostTask } from '@/lib/post-tasks';

// เซิร์ฟเวอร์ Vercel เป็น UTC — บังคับเวลาไทย
export function thaiTime(value: string | null | undefined, withDate = true): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    ...(withDate ? { day: 'numeric', month: 'short', year: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const GROUP_STATUS: Record<PostGroupStatus, { label: string; block: string; badge: string }> = {
  posted: { label: 'สำเร็จ', block: 'bg-success', badge: 'border-success/30 bg-success/10 text-success' },
  failed: { label: 'ไม่สำเร็จ', block: 'bg-destructive', badge: 'border-destructive/30 bg-destructive/10 text-destructive' },
  posting: { label: 'กำลังโพสต์', block: 'bg-warning animate-pulse', badge: 'border-warning/40 bg-warning/10 text-warning' },
  waiting: { label: 'รอคิว', block: 'bg-muted-foreground/25', badge: '' },
  skipped: { label: 'ไม่ได้โพสต์', block: 'border border-dashed border-muted-foreground/40', badge: '' },
};

export function GroupStatusBadge({ status }: { status: PostGroupStatus }) {
  const s = GROUP_STATUS[status];
  return (
    <Badge variant="outline" className={s.badge}>
      {status === 'posting' && <Spinner data-icon="inline-start" />}
      {s.label}
    </Badge>
  );
}

/** แถบช่องสีเรียงตามลำดับกลุ่ม: เขียว = สำเร็จ, แดง = ไม่สำเร็จ, เหลือง = กำลังโพสต์, เทา = รอ */
export function GroupStrip({ groups, className }: { groups: PostTaskGroup[]; className?: string }) {
  if (!groups.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)} aria-label="ผลรายกลุ่ม">
      {groups.map((g) => (
        <Tooltip key={g.group_id}>
          <TooltipTrigger asChild>
            <span className={cn('block h-3 w-5 rounded-sm', GROUP_STATUS[g.status].block)} />
          </TooltipTrigger>
          <TooltipContent>
            กลุ่มที่ {g.order} · {g.name} · {GROUP_STATUS[g.status].label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function taskStageBadge(task: PostTask) {
  const { state, label } = task.stage;
  if (state === 'failed') return <Badge variant="destructive">{label}</Badge>;
  if (task.status === 'running') {
    return (
      <Badge variant="outline" className={GROUP_STATUS.posting.badge}>
        <Spinner data-icon="inline-start" />
        {label}
      </Badge>
    );
  }
  if (state === 'done') return <Badge variant="outline" className={task.counts.failed ? '' : GROUP_STATUS.posted.badge}>{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

/** สรุปตัวเลขสั้น ๆ: สั่ง 15 กลุ่ม · สำเร็จ 4 · ไม่สำเร็จ 2 · กำลังโพสต์กลุ่มที่ 7 */
export function countsLine(task: PostTask): string {
  const c = task.counts;
  const parts = [`สั่ง ${c.planned} กลุ่ม`, `สำเร็จ ${c.posted}`];
  if (c.failed) parts.push(`ไม่สำเร็จ ${c.failed}`);
  if (task.current) parts.push(`กำลังโพสต์กลุ่มที่ ${task.current.order}`);
  else if (c.waiting) parts.push(`รอ ${c.waiting}`);
  if (c.skipped) parts.push(`ไม่ได้โพสต์ ${c.skipped}`);
  return parts.join(' · ');
}

/** ขั้นของรอบโพสต์: สั่งโพสต์ → เครื่องรับงาน → โพสต์ทีละกลุ่ม → เสร็จ */
export function PostTaskSteps({ task }: { task: PostTask }) {
  const { step, state } = task.stage;
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
      {POST_TASK_STEPS.map((label, i) => {
        const done = i < step || (i === step && state === 'done');
        const failed = i === step && state === 'failed';
        const active = i === step && state === 'active';
        return (
          <li key={label} className="flex items-center gap-2 sm:flex-1">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                done && 'border-success bg-success text-primary-foreground',
                failed && 'border-destructive bg-destructive text-primary-foreground',
                active && 'border-foreground text-foreground',
                !done && !failed && !active && 'text-muted-foreground',
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : failed ? <XIcon className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-sm', active || failed ? 'font-medium' : 'text-muted-foreground', failed && 'text-destructive')}>
              {label}
              {active && i === 2 && task.current ? ` (กลุ่มที่ ${task.current.order}/${task.counts.planned})` : ''}
            </span>
            {i < POST_TASK_STEPS.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
