import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, listCampaignContents } from '@/lib/repo';
import { approveContentAction, rejectContentAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const CONTENT_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'ร่าง (รออนุมัติ)', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'อนุมัติแล้ว', cls: 'bg-teal-50 text-teal-700' },
  rejected: { label: 'ตีกลับ', cls: 'bg-red-50 text-red-700' },
  posted: { label: 'โพสต์แล้ว', cls: 'bg-green-50 text-green-700' },
};

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
  const contents = await listCampaignContents(params.id);

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

      <div>
        <h2 className="mb-3 text-base font-semibold">ร่างคอนเทนต์</h2>
        {contents.length === 0 ? (
          <div className="card border-dashed p-6 text-center text-sm text-subtle">
            ยังไม่มีร่างคอนเทนต์ — ระบบจะให้ AI คิด caption + รูป + แนววิดีโอ ในเฟสถัดไป
          </div>
        ) : (
          <div className="space-y-4">
            {contents.map((ct, idx) => {
              const meta = CONTENT_STATUS[ct.status] ?? { label: ct.status, cls: 'bg-black/5 text-ink' };
              return (
                <div key={ct.id} className="card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium">
                      เวอร์ชัน {ct.version}
                      {idx === 0 && contents.length > 1 && <span className="ml-1 text-subtle">(ล่าสุด)</span>}
                      <span className="ml-2 text-xs text-subtle">· {ct.platform}</span>
                    </div>
                    <span className={`pill ${meta.cls}`}>{meta.label}</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                    {ct.has_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/campaign-content/${ct.id}/image`}
                        alt="รูปคอนเทนต์ที่ AI สร้าง"
                        className="aspect-square w-full rounded-lg border border-hairline object-cover"
                      />
                    ) : (
                      <div className="grid aspect-square place-items-center rounded-lg bg-accent/10 text-center text-xs text-accent">
                        ยังไม่มีรูป
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="mb-1 text-xs text-subtle">แคปชัน</div>
                      <div className="whitespace-pre-line rounded-lg border border-hairline bg-black/[0.02] p-3 text-sm">
                        {ct.caption || '—'}
                      </div>
                      {ct.video_brief && (
                        <>
                          <div className="mb-1 mt-3 text-xs text-subtle">แนววิดีโอ (brief)</div>
                          <div className="text-sm text-ink/70">{ct.video_brief}</div>
                        </>
                      )}
                      {ct.reject_reason && <div className="mt-2 text-xs text-red-600">เหตุผลตีกลับ: {ct.reject_reason}</div>}
                    </div>
                  </div>
                  {ct.status === 'draft' && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <form action={approveContentAction}>
                        <input type="hidden" name="contentId" value={ct.id} />
                        <input type="hidden" name="campaignId" value={c.id} />
                        <button className="btn-primary btn-sm">✓ อนุมัติและโพสต์</button>
                      </form>
                      <form action={rejectContentAction}>
                        <input type="hidden" name="contentId" value={ct.id} />
                        <input type="hidden" name="campaignId" value={c.id} />
                        <button className="btn-ghost btn-sm">↻ ตีกลับ ให้คิดใหม่</button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
