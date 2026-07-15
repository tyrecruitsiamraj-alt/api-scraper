import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, listCampaignContents, listCampaignPosts, listFacebookAccounts } from '@/lib/repo';
import type { CampaignPostRow } from '@/lib/repo';
import { approveContentAction, rejectContentAction, editCaptionAction, measureCampaignAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const CONTENT_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'ร่าง (รออนุมัติ)', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'อนุมัติแล้ว', cls: 'bg-teal-50 text-teal-700' },
  rejected: { label: 'ตีกลับ', cls: 'bg-red-50 text-red-700' },
  posted: { label: 'โพสต์แล้ว', cls: 'bg-green-50 text-green-700' },
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  high: { label: '🔥 คนสนใจเยอะ', cls: 'bg-green-50 text-green-700' },
  low: { label: '📉 คนสนใจน้อย → คิดใหม่', cls: 'bg-amber-50 text-amber-700' },
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

// แถบสเตจบนหน้า detail — ไฮไลต์ว่างานนี้อยู่ช่วงไหน
const STRIP = [
  { label: 'งานใหม่' },
  { label: 'สำรวจแนว' },
  { label: 'ทำคอนเทนต์' },
  { label: 'รออนุมัติ' },
  { label: 'โพสต์' },
  { label: 'วัดผล' },
  { label: 'เสร็จ' },
];
const STATUS_TO_STEP: Record<string, number> = {
  new: 0,
  researching: 1,
  drafting: 2,
  low_engagement: 2,
  pending_approval: 3,
  approved: 4,
  posting: 4,
  measuring: 5,
  done: 6,
};

function StageStrip({ status }: { status: string }) {
  const cur = STATUS_TO_STEP[status] ?? 0;
  const lowEng = status === 'low_engagement';
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STRIP.map((s, i) => {
        const done = i < cur;
        const active = i === cur;
        return (
          <div key={s.label} className="flex items-center gap-1">
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                active
                  ? lowEng
                    ? 'bg-red-100 font-medium text-red-700'
                    : 'bg-accent/15 font-medium text-ink'
                  : done
                    ? 'bg-teal-50 text-teal-700'
                    : 'bg-black/[0.04] text-subtle/60'
              }`}
            >
              {done && '✓ '}
              {s.label}
            </span>
            {i < STRIP.length - 1 && <span className="text-subtle/40">›</span>}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: unknown }) {
  const v = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm">{v}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-subtle">{label}</div>
    </div>
  );
}

type Engagement = { likes: number; comments: number; leads: number; verdict: string; postLink: string | null };

function aggregateByContent(posts: CampaignPostRow[]): Map<string, Engagement> {
  const map = new Map<string, Engagement>();
  for (const p of posts) {
    if (!p.content_id) continue;
    const e = map.get(p.content_id) ?? { likes: 0, comments: 0, leads: 0, verdict: 'pending', postLink: null };
    e.likes += p.likes ?? 0;
    e.comments += p.comments ?? 0;
    e.leads += p.lead_count ?? 0;
    if (p.verdict === 'high') e.verdict = 'high';
    else if (p.verdict === 'low' && e.verdict !== 'high') e.verdict = 'low';
    if (!e.postLink && p.post_link) e.postLink = p.post_link;
    map.set(p.content_id, e);
  }
  return map;
}

export default async function CampaignDetail({ params }: { params: { id: string } }) {
  const c = await getCampaign(params.id);
  if (!c) notFound();
  const snap = (c.request_snapshot ?? {}) as Record<string, any>;
  const contents = await listCampaignContents(params.id);
  const fbAccounts = await listFacebookAccounts();
  const posts = await listCampaignPosts(params.id);
  const engByContent = aggregateByContent(posts);
  const canMeasure = ['posting', 'measuring', 'low_engagement'].includes(c.status);

  return (
    <div className="space-y-6">
      <Link href="/orchestrator" className="text-sm text-subtle hover:text-accent">← กลับ Dashboard</Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{c.title || c.request_no || 'Campaign'}</h1>
            <p className="mt-1 text-sm text-subtle">
              ใบขอ {c.request_no || '—'}
              {c.province && ` · ${c.province}`}
              {c.remaining_qty != null && ` · ยังขาด ${c.remaining_qty} อัตรา`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="pill bg-black/5 text-ink">{STAGE_LABEL[c.status] ?? c.status}</span>
            {canMeasure && (
              <form action={measureCampaignAction}>
                <input type="hidden" name="campaignId" value={c.id} />
                <button className="btn-ghost btn-sm">📊 วัดผลตอนนี้</button>
              </form>
            )}
          </div>
        </div>
        <div className="mt-4">
          <StageStrip status={c.status} />
        </div>
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
            ยังไม่มีร่างคอนเทนต์ — ระบบจะให้ AI คิด caption + รูป + แนววิดีโอ (ต้องตั้ง ANTHROPIC/OPENAI key บนเครื่อง worker)
          </div>
        ) : (
          <div className="space-y-4">
            {contents.map((ct, idx) => {
              const meta = CONTENT_STATUS[ct.status] ?? { label: ct.status, cls: 'bg-black/5 text-ink' };
              const eng = engByContent.get(ct.id);
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

                  {/* engagement ของเวอร์ชันนี้ (ถ้าเคยโพสต์+วัดผลแล้ว) */}
                  {eng && (
                    <div className="mt-4 flex flex-wrap items-center gap-5 rounded-lg border border-hairline bg-black/[0.015] px-4 py-2.5">
                      <span className="text-xs font-medium text-subtle">ผลตอบรับ</span>
                      <Metric label="ไลก์" value={eng.likes} />
                      <Metric label="คอมเมนต์" value={eng.comments} />
                      <Metric label="คนทัก" value={eng.leads} />
                      <span className={`pill ${(VERDICT[eng.verdict] ?? VERDICT.pending).cls}`}>
                        {(VERDICT[eng.verdict] ?? VERDICT.pending).label}
                      </span>
                      {eng.postLink && (
                        <a href={eng.postLink} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                          เปิดโพสต์จริง ↗
                        </a>
                      )}
                    </div>
                  )}

                  {ct.status === 'draft' && (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap items-end gap-2">
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
                          <button className="btn-ghost btn-sm">↻ ตีกลับ ให้ AI คิดใหม่</button>
                        </form>
                      </div>

                      {/* แก้แคปชัน — ใช้ <details> เปิด/ปิดได้โดยไม่ต้อง client JS */}
                      <details className="group">
                        <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs text-subtle hover:text-accent">
                          ✎ แก้แคปชัน
                        </summary>
                        <form action={editCaptionAction} className="mt-2 space-y-2">
                          <input type="hidden" name="contentId" value={ct.id} />
                          <input type="hidden" name="campaignId" value={c.id} />
                          <textarea
                            name="caption"
                            defaultValue={ct.caption ?? ''}
                            rows={6}
                            className="w-full rounded-lg border border-hairline bg-transparent p-3 text-sm"
                          />
                          <button className="btn-secondary btn-sm">บันทึกแคปชัน</button>
                        </form>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {posts.length > 0 && (
        <p className="text-xs text-subtle">
          คะแนนผล = คอมเมนต์ + (คนทัก × 2) · “ไลก์” จะมีเมื่อเปิดการอ่าน reactions ในตัวเก็บคอมเมนต์ (งานย่อยที่เหลือ) · คนสนใจน้อย = AI คิดคอนเทนต์ใหม่อัตโนมัติ
        </p>
      )}
    </div>
  );
}
