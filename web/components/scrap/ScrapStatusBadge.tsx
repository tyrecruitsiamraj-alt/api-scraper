import type { ScrapTaskGroup } from '@/lib/scrap-stage';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/** ป้ายสถานะงาน Scrap: สีตามกลุ่ม (ติดปัญหา / ต้องตรวจรับ / กำลังทำ / เสร็จแล้ว) */
export function ScrapStatusBadge({ group, label }: { group: ScrapTaskGroup; label: string }) {
  if (group === 'attention') return <Badge variant="destructive">{label}</Badge>;
  if (group === 'working') return <Badge variant="secondary">{label}</Badge>;
  return (
    <Badge
      variant="outline"
      className={cn(
        group === 'review' && 'border-warning/30 bg-warning/10 text-warning',
        group === 'done' && 'border-success/30 bg-success/10 text-success',
      )}
    >
      {label}
    </Badge>
  );
}
