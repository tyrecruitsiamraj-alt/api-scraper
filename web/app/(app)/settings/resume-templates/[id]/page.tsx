import { notFound } from 'next/navigation';
import { NoticeDialog } from '@/components/NoticeDialog';
import { ResumeTemplateEditor } from '@/components/ResumeTemplateEditor';
import { BUILTIN_TEMPLATE_ID, listResumeTemplates } from '@/lib/resume-templates';

export const dynamic = 'force-dynamic';

export default async function ResumeTemplateEditPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; notice?: string }>;
}) {
  const { id } = await props.params;
  const { from, notice } = await props.searchParams;
  const templates = await listResumeTemplates();
  const isNew = id === 'new';
  const current = isNew ? templates.find((t) => t.id === (from || BUILTIN_TEMPLATE_ID)) : templates.find((t) => t.id === id && !t.builtin);
  if (!current) notFound();
  return (
    <>
      {notice && <NoticeDialog key={notice} title="บันทึกไม่ได้" notice={notice} />}
      <ResumeTemplateEditor
        id={isNew ? null : current.id}
        name={isNew ? (from ? `${current.name} (สำเนา)` : '') : current.name}
        settings={current.settings}
      />
    </>
  );
}
