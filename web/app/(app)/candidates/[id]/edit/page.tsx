import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { NoticeDialog } from '@/components/NoticeDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateCandidateAction } from '@/lib/actions';
import { getCandidate } from '@/lib/repo';
import { TEXT_FIELDS } from '../../../../../../src/core/resume-fields.js';

export const dynamic = 'force-dynamic';

/** ช่องยาว ใช้กล่องหลายบรรทัด */
const LONG = new Set(['address', 'intro']);

/** แก้ข้อมูลผู้สมัคร — ใช้ได้ทั้งคนที่ได้จาก Scrap และจากอัปโหลด (เจ้าของ 12 พ.ย. 2569) */
export default async function EditCandidatePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await props.params;
  const { notice } = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await getCandidate(id);
  if (!c) notFound();

  return (
    <div className="flex flex-col gap-6">
      {notice && <NoticeDialog key={notice} title="บันทึกไม่ได้" notice={notice} />}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/candidates/${id}`}>
            <ArrowLeftIcon data-icon="inline-start" />
            กลับไปหน้าผู้สมัคร
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">แก้ไข {c.full_name || 'ผู้สมัคร'}</h1>
      <Card>
        <form action={updateCandidateAction}>
          <input type="hidden" name="candidateId" value={id} />
          <CardContent>
            <FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {TEXT_FIELDS.map((f) => (
                <Field key={f.key} className={LONG.has(f.key) ? 'md:col-span-2 lg:col-span-3' : undefined}>
                  <FieldLabel htmlFor={`edit-${f.key}`}>{f.label}</FieldLabel>
                  {LONG.has(f.key) ? (
                    <Textarea id={`edit-${f.key}`} name={f.key} defaultValue={c[f.key] ?? ''} rows={3} />
                  ) : (
                    <Input id={`edit-${f.key}`} name={f.key} defaultValue={c[f.key] ?? ''} required={f.key === 'full_name'} />
                  )}
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
          <CardFooter className="mt-4 flex gap-2">
            <Button type="submit">บันทึก</Button>
            <Button variant="outline" asChild>
              <Link href={`/candidates/${id}`}>ยกเลิก</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
