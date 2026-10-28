import { ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { PostTaskGroup } from '../../../src/core/post-task-state.js';
import { GroupStatusBadge, thaiTime } from './post-ui';

function shortError(message: string | null): string {
  return String(message ?? '').replace(/\s*\(.*$/, '').trim() || 'โพสต์ไม่สำเร็จ';
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value === null ? '-' : value.toLocaleString('th-TH')}</dd>
    </div>
  );
}

/** กดแถวกลุ่มแล้วเห็นผลของกลุ่มนั้น: ลิงก์ สถานะในกลุ่ม ยอดคอมเมนต์ ไลก์ แชร์ */
export function GroupDetailDialog({ group, worker }: { group: PostTaskGroup; worker: string | null }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">ดูผล</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            กลุ่มที่ {group.order} · {group.name}
          </DialogTitle>
          <DialogDescription>Facebook group {group.group_id}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <GroupStatusBadge status={group.status} />
            {group.approval && <span className="text-sm text-muted-foreground">ในกลุ่ม: {group.approval}</span>}
          </div>
          {group.error && <p className="text-sm text-destructive">{shortError(group.error)}</p>}
          <dl className="grid grid-cols-3 gap-3">
            <Count label="ไลก์" value={group.reactions} />
            <Count label="คอมเมนต์" value={group.comments} />
            <Count label="แชร์" value={group.shares} />
          </dl>
          {!group.post_link && (group.status === 'unconfirmed' || group.status === 'pending_approval') && (
            <p className="text-sm text-muted-foreground">
              {group.status === 'pending_approval'
                ? 'โพสต์แล้ว รอแอดมินกลุ่มอนุมัติ ยังไม่มีลิงก์ ระบบจะหาลิงก์ให้ในรอบเก็บคอมเมนต์หลังอนุมัติ'
                : 'กดโพสต์แล้ว แต่ยังไม่เจอโพสต์ในกลุ่ม ระบบจะหาลิงก์ให้อีกครั้งในรอบเก็บคอมเมนต์'}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3">
            <Fact label="เริ่มโพสต์" value={thaiTime(group.started_at)} />
            <Fact label="ได้ผล" value={thaiTime(group.finished_at)} />
            <Fact label="เครื่อง" value={worker ?? '-'} />
            <Fact label="นับยอดล่าสุด" value={thaiTime(group.collected_at)} />
          </dl>
        </div>
        {group.post_link && (
          <DialogFooter>
            <Button asChild>
              <a href={group.post_link} target="_blank" rel="noreferrer">
                เปิดโพสต์บน Facebook
                <ExternalLinkIcon data-icon="inline-end" />
              </a>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
