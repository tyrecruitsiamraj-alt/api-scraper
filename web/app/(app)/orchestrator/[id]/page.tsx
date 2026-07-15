import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, listCampaignContents, listCampaignPosts, listFacebookAccounts } from '@/lib/repo';
import { approveContentAction, rejectContentAction, measureCampaignAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const CONTENT_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'ร่าง (รออนุมัติ)', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'อนุมัติแล้ว', cls: 'bg-teal-50 text-teal-700' },
  rejected: { label: 'ตีกลับ', cls: 'bg-red-50 text-red-700' },
  posted: { label: 'โพสต์แล้ว', cls: 'bg-green-50 text-green-700' },
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  high: { label: '🔥 คนสนใจเยอะ', cls: 'bg-green-50 text-green-700' },
  low: { label: '📉 คนสนใจน้อย', cls: 'bg-amber-50 text-amber-700' },
  pending: { label: 'รอวัดผล', cls: 'bg-black/5 text-ink' },
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
  const fbAccounts = await listFacebookAccounts();
  const posts = await listCampaignPosts(params.id);
  const canMeasure = ['posting', 'measuring', 'low_engagement'].includes(c.status);

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
                    <div className="mt-4 flex flex-wrap items-end gap-2">
                      <form action={approveContentAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="contentId" value={ct.id} />
                        <input type="hidden" name="campaignId" value={c.id} />
                        {fbAccounts.length > 0 ? (
                          <label className="text-xs text-subtle">
                            <span className="mb-1 block">โพสต์ด้วยบัญชี</span>
                            <select
                              name="fbAccountId"
                              defaultValue=""
                              className="rounded-lg border border-hairline bg-transparent px-2 py-1.5 text-sm text-ink"
                            >
                              <option value="">— อนุมัติเฉย ๆ (ยังไม่โพสต์) —</option>
                              {fbAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label} ({a.group_count} กลุ่ม)
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <span className="text-xs text-subtle">
                            ยังไม่มีบัญชี Facebook ในระบบ — อนุมัติได้ แต่ยังโพสต์อัตโนมัติไม่ได้
                          </span>
                        )}
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

      {(posts.length > 0 || canMeasure) && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">ผลตอบรับ (engagement)</h2>
            {canMeasure && (
              <form action={measureCampaignAction}>
                <input type="hidden" name="campaignId" value={c.id} />
                <button className="btn-ghost btn-sm">📊 วัดผลตอนนี้</button>
              </form>
            )}
          </div>
          {posts.length === 0 ? (
            <div className="card border-dashed p-6 text-center text-sm text-subtle">
              ยังไม่มีโพสต์ — อนุมัติคอนเทนต์พร้อมเลือกบัญชี Facebook เพื่อให้ระบบโพสต์ก่อน
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs text-subtle">
                    <th className="px-4 py-2.5 font-medium">บัญชี</th>
                    <th className="px-4 py-2.5 font-medium text-right">คอมเมนต์</th>
                    <th className="px-4 py-2.5 font-medium text-right">คนทัก/เบอร์</th>
                    <th className="px-4 py-2.5 font-medium text-right">คะแนน</th>
                    <th className="px-4 py-2.5 font-medium">ผล</th>
                    <th className="px-4 py-2.5 font-medium">ลิงก์</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => {
                    const v = VERDICT[p.verdict] ?? VERDICT.pending;
                    return (
                      <tr key={p.id} className="border-b border-hairline/60 last:border-0">
                        <td className="px-4 py-2.5 text-subtle">{p.account_ref || '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.comments}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{p.lead_count}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.engagement_score ?? '—'}</td>
                        <td className="px-4 py-2.5"><span className={`pill ${v.cls}`}>{v.label}</span></td>
                        <td className="px-4 py-2.5">
                          {p.post_link ? (
                            <a href={p.post_link} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                              เปิดโพสต์
                            </a>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-subtle">
            คะแนน = คอมเมนต์ + (คนทัก × 2) · ระบบอ่าน engagement ที่ auto-post collect เก็บไว้ · คนสนใจน้อย = AI คิดคอนเทนต์ใหม่ให้อัตโนมัติ
          </p>
        </div>
      )}
    </div>
  );
}
