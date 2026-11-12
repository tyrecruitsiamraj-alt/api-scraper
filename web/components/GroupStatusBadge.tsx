import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GROUP_STATUSES } from '../../src/core/order-groups.js';
import type { GroupStatusKey } from '../../src/core/order-groups.js';

/** ผลรายกลุ่มของใบสั่งโพสต์ — คำ + สี (หน้ารายละเอียดใบ และหน้ารายกลุ่ม) */
export function GroupStatusBadge({ status }: { status: GroupStatusKey }) {
  const label = GROUP_STATUSES.find((s) => s.key === status)?.label ?? status;
  return (
    <Badge
      variant={status === 'failed' || status === 'declined' || status === 'removed' ? 'destructive' : status === 'waiting' || status.startsWith('not_tried') ? 'secondary' : 'outline'}
      className={cn(
        status === 'posted' && 'border-success/30 bg-success/10 text-success',
        status === 'pending_approval' && 'border-warning/30 bg-warning/10 text-warning',
      )}
    >
      {label}
    </Badge>
  );
}
