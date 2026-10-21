import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
import type { ScrapStageResult } from '@/lib/scrap-stage';
import { Badge } from '@/components/ui/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { ScrapStatusBadge } from './ScrapStatusBadge';

export type ScrapTaskRowData = {
  id: string;
  title: string;
  requestNo: string | null;
  /** "JobThai · บัญชี A" */
  source: string;
  stage: ScrapStageResult;
  qualified: number;
  target: number;
  /** ข้อความเวลาที่จัดรูปแบบแล้ว (เวลาไทย) */
  updatedLabel: string;
  enabled: boolean;
};

/** งาน Scrap หนึ่งแถว ทั้งแถวกดเพื่อเปิดหน้ารายละเอียดงาน */
export function ScrapTaskRow({ task }: { task: ScrapTaskRowData }) {
  const { stage } = task;
  return (
    <Item variant="outline" asChild>
      <Link href={`/scraping/${task.id}`}>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex-wrap">
            <span className="truncate">{task.title}</span>
            <ScrapStatusBadge group={stage.group} label={stage.statusLabel} />
            {!task.enabled && <Badge variant="outline">ปิดอยู่</Badge>}
          </ItemTitle>
          <ItemDescription>
            {[task.requestNo ?? 'สร้างเอง', task.source].join(' · ')}
          </ItemDescription>
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            {stage.running && <Spinner className="size-3.5 text-muted-foreground" />}
            {stage.stepText}
            {stage.note && <span className="text-muted-foreground">· {stage.note}</span>}
          </p>
        </ItemContent>
        <ItemActions className="ml-auto flex-col items-end gap-0.5 text-right">
          <span className="text-sm font-medium tabular-nums">
            ผ่านเกณฑ์ {task.qualified}/{task.target || '-'}
          </span>
          <span className="text-xs text-muted-foreground">อัปเดต {task.updatedLabel}</span>
        </ItemActions>
        <ChevronRightIcon className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
      </Link>
    </Item>
  );
}
