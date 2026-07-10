'use client';

import { useEffect, useState } from 'react';
import type { FacebookQuotaSummary } from '@/lib/repo';
import { setFacebookDailyCapAction } from '@/lib/actions';

/**
 * โควต้าโพสต์ Facebook รายบัญชี (โหมด Auto-Post) — เรียงบัญชีใช้เยอะสุดก่อน
 * เห็นทันทีว่าบัญชีไหนเต็ม/ใกล้เต็ม = ตัวเสี่ยงโดน block. โพลทุก 4 วิ
 */
export function FacebookQuotaPanel({ initialFb }: { initialFb: FacebookQuotaSummary | null }) {
  const [fb, setFb] = useState(initialFb);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/provider-limits', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { fb: FacebookQuotaSummary | null };
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

  if (!fb) return <p className="text-sm text-subtle">ยังไม่มีบัญชี Facebook</p>;

  const totalPct = fb.capacity > 0 ? Math.min(100, Math.round((fb.posts_today / fb.capacity) * 100)) : 0;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#1877F2]" />
          <span className="font-medium">โควต้าโพสต์รายบัญชี</span>
          <span className="pill bg-black/5 text-subtle">
            {fb.accounts} บัญชี{fb.paused > 0 && <span className="text-amber-600"> · พัก {fb.paused}</span>}
          </span>
        </div>
        <span className="text-[13px] tabular-nums text-subtle">
          รวมวันนี้ <span className={`font-semibold ${totalPct >= 100 ? 'text-red-600' : 'text-ink'}`}>{fb.posts_today}</span> /{' '}
          {fb.capacity}
        </span>
      </div>

      <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {fb.list.map((a) => {
          const pct = a.cap > 0 ? Math.min(100, Math.round((a.used_today / a.cap) * 100)) : 0;
          const full = a.used_today >= a.cap;
          return (
            <div key={a.id} className="flex items-center gap-3">
              <div className="w-44 shrink-0 truncate text-[13px] text-ink" title={a.label}>
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
