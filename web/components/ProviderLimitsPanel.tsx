'use client';

import { useEffect, useState } from 'react';
import type { ProviderLimitRow } from '@/lib/repo';
import { setProviderCapAction } from '@/lib/actions';

const PLATFORM: Record<string, { label: string; avatar: string }> = {
  jobbkk: { label: 'JobBKK', avatar: 'bg-blue-500' },
  jobthai: { label: 'JobThai', avatar: 'bg-orange-500' },
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
    return <p className="text-sm text-subtle">ยังไม่มีข้อมูลโควต้า</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {limits.map((pl) => {
        const meta = PLATFORM[pl.platform] ?? { label: pl.platform, avatar: 'bg-gray-400' };
        const pct = pl.daily_cap > 0 ? Math.min(100, Math.round((pl.used_today / pl.daily_cap) * 100)) : 0;
        const hot = pct >= 100;
        return (
          <div key={pl.platform} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.avatar}`} />
                <span className="font-medium">{meta.label}</span>
              </div>
              <span className="text-[13px] tabular-nums text-subtle">
                วันนี้{' '}
                <span className={`font-semibold ${hot ? 'text-red-600' : 'text-ink'}`}>{pl.used_today}</span> /{' '}
                {pl.daily_cap}
              </span>
            </div>
            <div className="my-3 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${hot ? 'bg-red-500' : 'bg-accent'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <form action={setProviderCapAction} className="flex items-center gap-2">
              <input type="hidden" name="platform" value={pl.platform} />
              <label className="text-xs text-subtle">ปรับเพดาน</label>
              <input
                key={`${pl.platform}-${pl.daily_cap}-${pl.updated_at}`}
                name="dailyCap"
                type="number"
                min={0}
                max={5000}
                defaultValue={pl.daily_cap}
                className="field w-24 py-1.5"
              />
              <button className="btn-secondary btn-sm ml-auto">บันทึก</button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
