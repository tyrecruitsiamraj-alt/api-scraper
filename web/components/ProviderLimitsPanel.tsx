'use client';

import { useEffect, useState } from 'react';
import type { ProviderLimitRow, FacebookQuotaSummary } from '@/lib/repo';
import { setProviderCapAction, setFacebookDailyCapAction } from '@/lib/actions';

const PLATFORM: Record<string, { label: string; avatar: string }> = {
  jobbkk: { label: 'JobBKK', avatar: 'bg-blue-500' },
  jobthai: { label: 'JobThai', avatar: 'bg-orange-500' },
};

export function ProviderLimitsPanel({
  initialLimits,
  initialFb = null,
}: {
  initialLimits: ProviderLimitRow[];
  initialFb?: FacebookQuotaSummary | null;
}) {
  const [limits, setLimits] = useState(initialLimits);
  const [fb, setFb] = useState(initialFb);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/provider-limits', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { limits: ProviderLimitRow[]; fb: FacebookQuotaSummary | null };
        setLimits(data.limits);
        setFb(data.fb);
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

  if (limits.length === 0 && !fb) {
    return <p className="text-sm text-subtle">ยังไม่มีข้อมูลโควต้า</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fb && <FacebookQuotaCard fb={fb} />}
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

/**
 * Facebook: cap เป็นรายบัญชี (15/บัญชี/วัน) — แสดง "ทุกบัญชี" เรียงใช้เยอะสุดก่อน
 * จะได้เห็นทันทีว่าบัญชีไหนโพสต์เกิน/ใกล้เต็ม = ตัวเสี่ยงโดน block. span 2 คอลัมน์
 */
function FacebookQuotaCard({ fb }: { fb: FacebookQuotaSummary }) {
  const totalPct = fb.capacity > 0 ? Math.min(100, Math.round((fb.posts_today / fb.capacity) * 100)) : 0;
  return (
    <div className="card p-5 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#1877F2]" />
          <span className="font-medium">Facebook — รายบัญชี</span>
          <span className="pill bg-black/5 text-subtle">
            {fb.accounts} บัญชี{fb.paused > 0 && <span className="text-amber-600"> · พัก {fb.paused}</span>}
          </span>
        </div>
        <span className="text-[13px] tabular-nums text-subtle">
          รวมวันนี้ <span className={`font-semibold ${totalPct >= 100 ? 'text-red-600' : 'text-ink'}`}>{fb.posts_today}</span> /{' '}
          {fb.capacity}
        </span>
      </div>

      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {fb.list.map((a) => {
          const pct = a.cap > 0 ? Math.min(100, Math.round((a.used_today / a.cap) * 100)) : 0;
          const full = a.used_today >= a.cap;
          return (
            <div key={a.id} className="flex items-center gap-3">
              <div className="w-40 shrink-0 truncate text-[13px] text-ink" title={a.label}>
                {a.label}
                {a.paused && <span className="ml-1 text-[11px] text-amber-600">· พัก</span>}
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className={`h-full rounded-full ${full ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[#1877F2]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={`w-16 shrink-0 text-right text-[13px] tabular-nums ${full ? 'font-semibold text-red-600' : 'text-subtle'}`}>
                {a.used_today}/{a.cap}
              </div>
            </div>
          );
        })}
      </div>

      <form action={setFacebookDailyCapAction} className="mt-4 flex items-center gap-2 border-t border-hairline/60 pt-3">
        <label className="text-xs text-subtle">ตั้ง cap ต่อบัญชี/วัน (ทุกบัญชี)</label>
        <input
          key={`fb-${fb.cap_default}`}
          name="dailyCap"
          type="number"
          min={1}
          max={50}
          defaultValue={fb.cap_default}
          className="field w-24 py-1.5"
        />
        <button className="btn-secondary btn-sm ml-auto">ใช้กับทุกบัญชี</button>
      </form>
      <p className="mt-2 text-[11px] text-subtle">แดง = เต็มโควต้าวันนี้ (จะถูกข้ามตอนโพสต์อัตโนมัติ) · แนะนำ 15/บัญชี กัน Facebook block</p>
    </div>
  );
}
