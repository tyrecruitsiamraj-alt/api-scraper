import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteResumeTemplateAction, setDefaultResumeTemplateAction } from '@/lib/actions';
import { RESUME_LAYOUTS } from '@/lib/resume-template';
import { listResumeTemplates } from '@/lib/resume-templates';

export const dynamic = 'force-dynamic';

/** แบบฟอร์ม PDF เรซูเม่ — มีได้หลายแบบ เลือกตอนกดดาวน์โหลด (เจ้าของ 12 พ.ย. 2569) */
export default async function ResumeTemplatesPage() {
  const templates = await listResumeTemplates();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">แบบฟอร์มเรซูเม่ ({templates.length})</h2>
        <Button asChild>
          <Link href="/settings/resume-templates/new">
            <PlusIcon data-icon="inline-start" />
            เพิ่มแบบฟอร์ม
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="size-3 rounded-full border" style={{ background: t.settings.accentColor }} aria-hidden />
                {t.name}
              </CardTitle>
              <CardDescription>
                {RESUME_LAYOUTS.find((l) => l.key === t.settings.layout)?.label} · ฟอนต์ {t.settings.font}
                {t.settings.logo ? ' · มีโลโก้' : ''}
                {t.settings.watermark !== 'none' ? ' · มีลายน้ำ' : ''}
                {t.settings.showContacts ? '' : ' · ซ่อนเบอร์โทร'}
              </CardDescription>
              <CardAction>{t.isDefault && <Badge variant="secondary">แบบเริ่มต้น</Badge>}</CardAction>
            </CardHeader>
            <CardFooter className="flex flex-wrap gap-2">
              {t.builtin ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/settings/resume-templates/new?from=${t.id}`}>คัดลอกไปแก้</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/settings/resume-templates/${t.id}`}>แก้ไข</Link>
                </Button>
              )}
              {!t.isDefault && (
                <form action={setDefaultResumeTemplateAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <Button variant="ghost" size="sm">ตั้งเป็นแบบเริ่มต้น</Button>
                </form>
              )}
              {!t.builtin && (
                <form action={deleteResumeTemplateAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <Button variant="ghost" size="sm" className="text-destructive">ลบ</Button>
                </form>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
