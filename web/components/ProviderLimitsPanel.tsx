'use client';

import { useEffect, useState } from 'react';
import type { ProviderLimitRow } from '@/lib/repo';
import { setProviderCapAction } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

const PLATFORM: Record<string, { label: string }> = {
  jobbkk: { label: 'JobBKK' },
  jobthai: { label: 'JobThai' },
};

export function ProviderLimitsPanel({ initialLimits }: { initialLimits: ProviderLimitRow[] }) {
  const [limits, setLimits] = useState(initialLimits);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/provider-limits', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { limits: ProviderLimitRow[] };
        setLimits(data.limits);
      } catch {
        /* ignore */
      }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  if (limits.length === 0) {
    return <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลโควต้า</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {limits.map((pl) => {
        const meta = PLATFORM[pl.platform] ?? { label: pl.platform };
        const pct = pl.daily_cap > 0 ? Math.min(100, Math.round((pl.used_today / pl.daily_cap) * 100)) : 0;
        const hot = pct >= 100;
        const inputId = `provider-cap-${pl.platform}`;
        return (
          <Card key={pl.platform}>
            <CardHeader>
              <CardTitle>{meta.label}</CardTitle>
              <CardAction className="text-sm tabular-nums text-muted-foreground">
                วันนี้{' '}
                <span className={cn('font-semibold', hot ? 'text-destructive' : 'text-foreground')}>{pl.used_today}</span> /{' '}
                {pl.daily_cap}
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Progress value={pct} aria-label={`ใช้ไป ${pct}% ของเพดาน ${meta.label}`} />
              <form action={setProviderCapAction} className="flex items-center gap-2">
                <input type="hidden" name="platform" value={pl.platform} />
                <FieldLabel htmlFor={inputId} className="text-muted-foreground">ปรับเพดาน</FieldLabel>
                <Input
                  key={`${pl.platform}-${pl.daily_cap}-${pl.updated_at}`}
                  id={inputId}
                  name="dailyCap"
                  type="number"
                  min={0}
                  max={5000}
                  defaultValue={pl.daily_cap}
                  className="w-24"
                />
                <Button variant="secondary" size="sm" type="submit" className="ml-auto">บันทึก</Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
