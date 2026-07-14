import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  new: 'งานใหม่',
  researching: 'สำรวจแนว content',
  drafting: 'กำลังทำ content',
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  posting: 'กำลังโพสต์',
  measuring: 'วัดผล',
  done: 'เสร็จ',
  low_engagement: 'คนสนใจน้อย (คิดใหม่)',
};

function Field({ label, value }: { label: string; value?: unknown }) {
  const v = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm">{v}</dd>
    </div>
  );
}

export default async function CampaignDetail({ params }: { params: { id: string } }) {
  const c = await getCampaign(params.id);
  if (!c) notFound();
  const snap = (c.request_snapshot ?? {}) as Record<string, any>;

  return (
    <div className="space-y-6">
      <Link href="/orchestrator" className="text-sm text-subtle hover:text-accent">← กลับ Dashboard</Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{c.title || c.request_no || 'Campaign'}</h1>
            <p className="mt-1 text-sm text-subtle">ใบขอ {c.request_no || '—'}</p>
          </div>
          <span className="pill bg-black/5 text-ink">{STAGE_LABEL[c.status] ?? c.status}</span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="จังหวัด/ไซต์" value={c.province} />
          <Field label="ต้องการ" value={c.qty} />
          <Field label="ยังขาด" value={c.remaining_qty} />
          <Field label="ผู้สร้าง" value={c.created_by} />
        </dl>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-subtle">ข้อมูลใบขอ (จาก ERP)</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="ไซต์" value={snap.site_name} />
          <Field label="รหัสไซต์" value={snap.site_code} />
          <Field label="แผนก" value={snap.department_code} />
          <Field label="ประเภทใบขอ" value={snap.request_name} />
          <Field label="ผู้ขอ" value={snap.requester_name} />
          <Field label="สถานที่ทำงาน" value={snap.work_addr} />
        </dl>
      </div>

      <div className="card border-dashed p-6 text-center text-sm text-subtle">
        🚧 การคิด Content + อนุมัติ + โพสต์ + วัดผล จะเพิ่มในเฟสถัดไป
      </div>
    </div>
  );
}
