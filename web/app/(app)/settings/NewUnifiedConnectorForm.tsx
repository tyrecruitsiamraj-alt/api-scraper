'use client';

import { useState } from 'react';
import { AlertCircleIcon, InfoIcon, PlusIcon, XIcon } from 'lucide-react';
import { createConnectorAction } from '@/lib/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';

const PLATFORMS = [
  { value: 'jobbkk', label: 'JobBKK', detail: 'ดึง Resume' },
  { value: 'jobthai', label: 'JobThai', detail: 'ดึง Resume' },
  { value: 'facebook', label: 'Facebook', detail: 'ใช้โพสต์ประกาศ' },
];

export function NewUnifiedConnectorForm({ workers = [] }: { workers?: string[] }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('jobbkk');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const facebook = platform === 'facebook';

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => { setError(''); setOpen(true); }}>
        <PlusIcon data-icon="inline-start" />
        เพิ่มบัญชีใหม่
      </Button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        setError('');
        try {
          await createConnectorAction(fd);
          setPlatform('jobbkk');
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'เพิ่มบัญชีไม่สำเร็จ');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>เพิ่มบัญชีใหม่</CardTitle>
          <CardDescription>บัญชีสำหรับค้นหาผู้สมัคร หรือโพสต์ประกาศบน Facebook</CardDescription>
          <CardAction>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="ปิด">
              <XIcon />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">ประเภทบัญชี</FieldLegend>
              <RadioGroup
                value={platform}
                onValueChange={(value) => { setPlatform(value); setError(''); }}
                className="grid gap-2 sm:grid-cols-3"
              >
                {PLATFORMS.map((p) => (
                  <FieldLabel key={p.value} htmlFor={`new-connector-${p.value}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{p.label}</FieldTitle>
                        <FieldDescription>{p.detail}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={p.value} id={`new-connector-${p.value}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
            <input type="hidden" name="platform" value={platform} />

            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="new-connector-label">ชื่อเรียก</FieldLabel>
                <Input id="new-connector-label" name="label" required placeholder={facebook ? 'Facebook - ทีมสรรหา 1' : 'JobBKK - ทีม HR 1'} />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-connector-username">{facebook ? 'อีเมลหรือเบอร์ที่ใช้เข้าสู่ระบบ' : 'ชื่อผู้ใช้'}</FieldLabel>
                <Input id="new-connector-username" name="username" required autoComplete="off" placeholder={facebook ? 'email@example.com หรือ 08x...' : 'ชื่อผู้ใช้ของบัญชี'} />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-connector-password">รหัสผ่าน</FieldLabel>
                <Input id="new-connector-password" name="password" type="password" required autoComplete="new-password" />
              </Field>

              {facebook && (
                <>
                  <Field>
                    <FieldLabel htmlFor="new-connector-poster">ชื่อที่ใช้โพสต์</FieldLabel>
                    <Input id="new-connector-poster" name="posterName" placeholder="เว้นว่างไว้จะใช้ชื่อเรียก" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-connector-phone">เบอร์ของบัญชีเอง</FieldLabel>
                    <Input id="new-connector-phone" name="contactPhone" placeholder="ใช้แยกเบอร์เราออกจากรายชื่อผู้สนใจ" />
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="new-connector-worker">เครื่องประจำของบัญชี</FieldLabel>
                    <Input
                      id="new-connector-worker"
                      name="preferredWorker"
                      list="facebook-worker-names"
                      placeholder="ชื่อเครื่อง เช่น SONB-RM009"
                      className="font-mono"
                    />
                    <datalist id="facebook-worker-names">
                      {workers.map((worker) => <option key={worker} value={worker} />)}
                    </datalist>
                    <FieldDescription>
                      ใช้เครื่องเดิมกับบัญชีนี้ทุกครั้ง Facebook จะขอยืนยันตัวตนน้อยลง ถ้ายังไม่รู้ชื่อเครื่องเว้นว่างไว้ก่อนได้
                    </FieldDescription>
                  </Field>
                </>
              )}
            </FieldGroup>

            <FieldSeparator />

            <FieldGroup className={facebook ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
              {!facebook && (
                <Field>
                  <FieldLabel htmlFor="new-connector-limit">จำนวนผู้สมัครต่อครั้ง</FieldLabel>
                  <Input id="new-connector-limit" name="scrapeLimit" type="number" min={1} max={100} defaultValue={15} />
                  <FieldDescription>จำนวนสูงสุดที่ค้นได้ในหนึ่งรอบ</FieldDescription>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="new-connector-cap">โควต้าต่อวัน</FieldLabel>
                <Input key={platform} id="new-connector-cap" name="dailyCap" type="number" min={1} max={facebook ? 50 : 2000} defaultValue={facebook ? 15 : 200} />
                <FieldDescription>{facebook ? 'จำนวนโพสต์สูงสุดต่อบัญชีต่อวัน แนะนำ 15' : 'จำนวนโปรไฟล์สะสมสูงสุดต่อบัญชีต่อวัน'}</FieldDescription>
              </Field>
            </FieldGroup>

            {facebook && (
              <Field orientation="horizontal">
                <Checkbox id="new-connector-skip-warmup" name="skipWarmup" value="1" />
                <FieldContent>
                  <FieldLabel htmlFor="new-connector-skip-warmup">บัญชีนี้ใช้งานมานานแล้ว</FieldLabel>
                  <FieldDescription>
                    ไม่ติ๊ก = บัญชีใหม่ ระบบโพสต์ได้แค่ 5 กลุ่มต่อวันในสัปดาห์แรก แล้วเพิ่มเป็น 8 และ 12 จนครบโควต้าในสัปดาห์ที่ 4 ติ๊กเฉพาะบัญชีที่สร้างมานานและใช้งานจริงอยู่แล้ว
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
            {facebook && (
              <Alert>
                <InfoIcon />
                <AlertDescription>
                  ระบบจะเปิด Facebook แล้วเข้าสู่บัญชีนี้ตอนเริ่มงานครั้งแรก ถ้า Facebook ขอรหัส OTP ให้ยืนยันบนเครื่องประจำที่เลือกไว้
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </CardContent>

        <CardFooter className="flex-wrap gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'กำลังบันทึก' : 'เพิ่มบัญชี'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
          {!facebook && <span className="ml-auto text-xs text-muted-foreground">รหัสผ่านจะถูกเข้ารหัสก่อนบันทึก</span>}
        </CardFooter>
      </Card>
    </form>
  );
}
