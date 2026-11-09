import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { OUTCOMES } from '../../src/core/order-outcome.js';
import type { OrderOutcomeKey } from '../../src/core/order-outcome.js';

/** ผลของใบสั่งงาน — คำ + สี (หน้าคำสั่งงาน และหน้ารายละเอียดใบ) */
export function OutcomeBadge({ outcome }: { outcome: OrderOutcomeKey }) {
  const label = OUTCOMES.find((o) => o.key === outcome)?.label ?? outcome;
  return (
    <Badge
      variant={outcome === 'failed' ? 'destructive' : outcome === 'working' ? 'secondary' : 'outline'}
      className={cn(
        outcome === 'done' && 'border-success/30 bg-success/10 text-success',
        (outcome === 'partial' || outcome === 'waiting') && 'border-warning/30 bg-warning/10 text-warning',
      )}
    >
      {label}
    </Badge>
  );
}
