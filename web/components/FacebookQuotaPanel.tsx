'use client';

import { useEffect, useState } from 'react';
import type { FacebookQuotaSummary } from '@/lib/repo';
import { setFacebookDailyCapAction } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

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

  if (!fb) return <p className="text-sm text-muted-foreground">ยังไม่มีบัญชี Facebook</p>;

  const totalPct = fb.capacity > 0 ? Math.min(100, Math.round((fb.posts_today / fb.capacity) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>โควต้าโพสต์รายบัญชี</CardTitle>
        <CardDescription>
          {fb.accounts} บัญชี{fb.paused > 0 && ` พักอยู่ ${fb.paused}`}
        </CardDescription>
        <CardAction className="text-sm tabular-nums text-muted-foreground">
          วันนี้{' '}
          <span className={cn('font-semibold', totalPct >= 100 ? 'text-destructive' : 'text-foreground')}>
            {fb.posts_today}
          </span>{' '}
          / {fb.capacity}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <Progress value={totalPct} aria-label="โพสต์รวมวันนี้เทียบโควต้า" />

        <ul className="flex max-h-112 flex-col gap-3 overflow-y-auto pr-1">
          {fb.list.map((a) => {
            const pct = a.cap > 0 ? Math.min(100, Math.round((a.used_today / a.cap) * 100)) : 0;
            const full = a.used_today >= a.cap;
            return (
              <li key={a.id} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-1.5" title={a.label}>
                  <span className="truncate">{a.label}</span>
                  {a.paused && <Badge variant="outline">พัก</Badge>}
                </div>
                <Progress value={pct} aria-label={`${a.label} ใช้ไป ${a.used_today} จาก ${a.cap}`} />
                <div className="flex items-center justify-end gap-1.5 tabular-nums">
                  {full && <Badge variant="destructive">เต็ม</Badge>}
                  <span className={cn(full ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                    {a.used_today}/{a.cap}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>

      <CardFooter>
        <form action={setFacebookDailyCapAction} className="w-full">
          <Field orientation="horizontal" className="flex-wrap">
            <FieldLabel htmlFor="fb-daily-cap" className="font-normal text-muted-foreground">
              โพสต์สูงสุดต่อบัญชีต่อวัน (ทุกบัญชี)
            </FieldLabel>
            <Input
              key={`fb-${fb.cap_default}`}
              id="fb-daily-cap"
              name="dailyCap"
              type="number"
              min={1}
              max={50}
              defaultValue={fb.cap_default}
              className="w-24"
            />
            <Button variant="secondary" size="sm" className="ml-auto">
              ใช้กับทุกบัญชี
            </Button>
            <FieldDescription className="basis-full text-xs">
              บัญชีที่เต็มโควต้าวันนี้จะถูกข้ามตอนโพสต์อัตโนมัติ แนะนำ 15 โพสต์ต่อบัญชี เพื่อลดโอกาสโดน Facebook บล็อก
            </FieldDescription>
          </Field>
        </form>
      </CardFooter>
    </Card>
  );
}
