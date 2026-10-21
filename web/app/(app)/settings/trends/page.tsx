import { Fragment } from 'react';
import { SparklesIcon, TrendingUpIcon } from 'lucide-react';
import { listContentTrends } from '@/lib/repo';
import { createTrendAction, toggleTrendAction, deleteTrendAction } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from '@/components/ui/item';

export const dynamic = 'force-dynamic';

export default async function TrendsSettingsPage() {
  const trends = await listContentTrends();
  const activeCount = trends.filter((t) => t.active).length;
  const pendingCount = trends.filter((t) => t.source === 'discovered' && !t.active).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">เทรนด์ที่กำลังมา</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          ใส่เทรนด์หรือมีมที่อยากให้คอนเทนต์เกาะกระแส เช่น “ไอติมอัลตร้าสมูท” ตอน AI คิดแคปชันและรูป จะหยิบเฉพาะเทรนด์ที่เปิดอยู่ไปใช้
          {activeCount > 0 ? ` (เปิดอยู่ ${activeCount} รายการ)` : ''}
        </p>
      </div>

      {pendingCount > 0 && (
        <Alert>
          <SparklesIcon />
          <AlertTitle>ระบบเสนอเทรนด์ใหม่จากกลุ่ม Facebook</AlertTitle>
          <AlertDescription>
            มี {pendingCount} เทรนด์ที่ระบบเจอในกลุ่ม FB รออนุมัติ ดูก่อนว่าเข้ากับแบรนด์ไหม แล้วกด “อนุมัติ” เพื่อเปิดใช้
          </AlertDescription>
        </Alert>
      )}

      <form action={createTrendAction}>
        <Card>
          <CardHeader>
            <CardTitle>เพิ่มเทรนด์</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="trend-label">เทรนด์ / มีม</FieldLabel>
                  <Input id="trend-label" name="label" required placeholder="เช่น ไอติมอัลตร้าสมูท" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="trend-note">วิธีเกาะกระแส (ไม่บังคับ)</FieldLabel>
                  <Input id="trend-note" name="note" placeholder="เช่น ใช้มุกเนียน ๆ กับพาดหัว" />
                </Field>
              </div>
              <FieldSet>
                <FieldLegend variant="label">ใช้กับ</FieldLegend>
                <div className="flex flex-wrap gap-6">
                  <Field orientation="horizontal" className="w-auto">
                    <Checkbox id="trend-for-caption" name="forCaption" defaultChecked />
                    <FieldLabel htmlFor="trend-for-caption" className="font-normal">แคปชัน</FieldLabel>
                  </Field>
                  <Field orientation="horizontal" className="w-auto">
                    <Checkbox id="trend-for-image" name="forImage" defaultChecked />
                    <FieldLabel htmlFor="trend-for-image" className="font-normal">รูป</FieldLabel>
                  </Field>
                </div>
              </FieldSet>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit">เพิ่มเทรนด์</Button>
          </CardFooter>
        </Card>
      </form>

      {trends.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUpIcon /></EmptyMedia>
            <EmptyTitle>ยังไม่มีเทรนด์</EmptyTitle>
            <EmptyDescription>
              เพิ่มจากฟอร์มด้านบนได้เลย ถ้าเพิ่มแล้วยังไม่ขึ้น ให้ตรวจว่ารัน migrate ที่ worker แล้ว
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <ItemGroup className="gap-0">
            {trends.map((t, index) => (
              <Fragment key={t.id}>
                {index > 0 && <ItemSeparator className="my-0" />}
                <Item role="listitem" className={cn('rounded-none px-4 py-3', !t.active && 'opacity-60')}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="flex-wrap">
                      {t.label}
                      <Badge variant={t.active ? 'secondary' : 'outline'}>{t.active ? 'เปิด' : 'ปิด'}</Badge>
                      {t.source === 'discovered' && (
                        <Badge variant="outline">{t.active ? 'ระบบเสนอ' : 'ระบบเสนอ · รออนุมัติ'}</Badge>
                      )}
                      {t.for_caption && <Badge variant="ghost" className="text-muted-foreground">แคปชัน</Badge>}
                      {t.for_image && <Badge variant="ghost" className="text-muted-foreground">รูป</Badge>}
                    </ItemTitle>
                    {t.note && <ItemDescription>{t.note}</ItemDescription>}
                  </ItemContent>
                  <ItemActions className="gap-1">
                    <form action={toggleTrendAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="active" value={(!t.active).toString()} />
                      <Button variant="ghost" size="sm" type="submit">{t.active ? 'ปิด' : t.source === 'discovered' ? 'อนุมัติ' : 'เปิด'}</Button>
                    </form>
                    <form action={deleteTrendAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button variant="destructive" size="sm" type="submit">ลบ</Button>
                    </form>
                  </ItemActions>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
        </Card>
      )}

      <p className="text-sm leading-relaxed text-muted-foreground">
        เทรนด์อยู่ได้ไม่นาน ตัวไหนหมดกระแสแล้วให้ปิดหรือลบ คอนเทนต์จะได้ไม่ดูเอาต์ ฝั่ง worker ต้องรัน <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npm run migrate</code> แล้ว restart ก่อน ถึงจะดึงเทรนด์ไปใช้ได้
      </p>
    </div>
  );
}
