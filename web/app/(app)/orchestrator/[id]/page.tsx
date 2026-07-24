import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contentGenIngredients, getCampaign, listCampaignContents, listCampaignPosts, listFacebookAccounts, soRecruitCheck } from '@/lib/repo';
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
  const pool = await soRecruitCheck(c.request_no);
  const ingredients = await contentGenIngredients(c.title);

  // ป้ายบอกว่า "ต้องทำอะไรต่อ" — คนเปิดหน้ามาแล้วรู้ทันทีว่างานค้างที่ใคร
  const NEXT_ACTION: Record<string, { text: string; cls: string }> = {
    drafting: { text: '🤖 AI กำลังคิดร่าง — รอสักครู่ ร่างใหม่จะโผล่ด้านล่างเอง', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
    pending_approval: { text: '👉 รอคุณ: ตรวจร่างด้านล่าง เลือกเวอร์ชันที่ชอบแล้วกดอนุมัติ (หรือตีกลับให้ AI แก้)', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    posting: { text: '📤 กำลังโพสต์/รอคิวโพสต์ — เสร็จแล้วระบบจะเก็บคอมเมนต์และวัดผลเอง', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
    measuring: { text: '⏳ รอเก็บ engagement — ระบบวัดผลอัตโนมัติ หรือกด "วัดผลตอนนี้" มุมขวาบน', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    low_engagement: { text: '📉 คนสนใจน้อย — ระบบบันทึกแนวนี้เป็น "ห้ามทำซ้ำ" และสั่ง AI คิดเวอร์ชันใหม่แล้ว', cls: 'border-red-200 bg-red-50 text-red-700' },
    done: { text: '✅ เสร็จสิ้น — แนวที่ได้ผลถูกเก็บเป็นต้นแบบ ระบบจะใช้เป็นแนวทางในงานถัดไป', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    draft_error: { text: '⚠️ สร้างร่างไม่สำเร็จ — กลับไปหน้าศูนย์งานแล้วกด "ลองสร้าง Content ใหม่"', cls: 'border-red-200 bg-red-50 text-red-700' },
  };
  const nextAction = NEXT_ACTION[c.status];

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
        {nextAction && (
          <div className={`mt-4 rounded-xl border px-4 py-2.5 text-[13px] font-medium ${nextAction.cls}`}>
            {nextAction.text}
          </div>
        )}
      </div>

      {/* Pool pre-check: มีคนใน So Recruit สำหรับใบขอนี้หรือยัง (อ่านอย่างเดียว คนตัดสินใจเอง) */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">So Recruit:</span>
          {pool === null ? (
            <span className="text-subtle">เชื่อมข้อมูล So Recruit ไม่ได้ (สิทธิ์/สคีมา)</span>
          ) : !pool.found ? (
            <span className="text-subtle">
              ยังไม่พบใบขอนี้ใน So Recruit (jobs.request_no ยังไม่ผูก) — ถือว่ายังไม่มีคน → ควรคิด content
            </span>
          ) : pool.totalAssigned > 0 ? (
            <span className="rounded-md bg-green-50 px-2 py-0.5 text-green-700">
              ✅ มีคนแล้ว {pool.totalAssigned} — อาจไม่ต้องคิด content (ตรวจก่อนอนุมัติ)
            </span>
          ) : (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">
              พบงานใน So Recruit แต่ยังไม่มีคนถูก assign → ควรคิด content
            </span>
          )}
        </div>
        {pool?.found && pool.jobs.length > 0 && (
          <div className="mt-2 text-xs text-subtle">
            {pool.jobs.map((j) => (
              <span key={j.id} className="mr-3">
                · {j.unit_name || j.location || 'งาน'} [{j.status || '—'}] · assign {j.assigned}
              </span>
            ))}
          </div>
        )}
      </div>

      {snap.source === 'so_recruit' ? (
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-subtle">
            ข้อมูลคำขอ (จาก So Recruit)
            {snap.user_edited && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium normal-case text-amber-700">✎ มีการแก้ไขตอนรับงาน</span>}
          </h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="ตำแหน่ง" value={snap.position || snap.request_name} />
            <Field label="พื้นที่/สถานที่" value={snap.location || snap.work_addr} />
            <Field label="รายได้" value={snap.income} />
            <Field label="จำนวนที่รับ" value={snap.qty} />
            <Field label="เวลางาน" value={snap.work_schedule} />
            <Field label="เพศ" value={snap.gender} />
            <Field label="อายุ" value={snap.age_min || snap.age_max ? `${snap.age_min ?? ''}-${snap.age_max ?? ''} ปี` : ''} />
            <Field label="หน่วยงาน" value={snap.unit_name} />
            <Field label="ผู้ขอ" value={snap.requested_by_name} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="เหตุผลที่ขอโพส" value={snap.reason} />
            </div>
            {snap.note && (
              <div className="col-span-2 sm:col-span-3">
                <Field label="หมายเหตุ" value={snap.note} />
              </div>
            )}
          </dl>
        </div>
      ) : (
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
      )}

      {/* โปร่งใส: บอกคนตรวจว่า AI เอาอะไรมาประกอบตอนคิดร่าง — จะได้รู้ว่าต้องเช็คอะไร */}
      <details className="card px-6 py-4">
        <summary className="cursor-pointer select-none text-sm font-semibold">
          🧠 AI ใช้อะไรคิดร่างนี้
          <span className="ml-2 text-xs font-normal text-subtle">กดดูส่วนผสมที่ระบบส่งให้ AI</span>
        </summary>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="text-xs font-medium text-subtle">1 · ข้อมูลใบขอ (ด้านบน)</div>
            <p className="mt-0.5 text-ink/80">ตำแหน่ง พื้นที่ รายได้ จำนวน เวลางาน — กติกาเหล็ก: <b>ไม่มีในใบขอ = ห้าม AI แต่งเอง</b> (เงินเดือน/สวัสดิการใช้คำกลางแทน)</p>
          </div>
          <div>
            <div className="text-xs font-medium text-subtle">2 · สองเวอร์ชันคนละแนว (A/B)</div>
            <p className="mt-0.5 text-ink/80">A — ตรงไปตรงมา: พาดหัวชัด ข้อมูลครบ กระชับ · B — เน้นจุดขาย: นำด้วยรายได้/สวัสดิการ โทนชวนคุย</p>
          </div>
          <div>
            <div className="text-xs font-medium text-subtle">3 · แนวที่เคยได้ผลดี ({ingredients.winning.length} ตัวอย่าง)</div>
            {ingredients.winning.length === 0 ? (
              <p className="mt-0.5 text-subtle">ยังไม่มี — จะสะสมเองเมื่อโพสต์ไหนวัดผลแล้ว "คนสนใจเยอะ"</p>
            ) : (
              ingredients.winning.map((w, i) => (
                <p key={i} className="mt-1 rounded-lg border border-hairline bg-emerald-50/40 px-3 py-1.5 text-xs text-ink/70">
                  {w.length > 160 ? `${w.slice(0, 160)}…` : w}
                </p>
              ))
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-subtle">4 · แนวที่ห้ามทำซ้ำ ({ingredients.losing.length} ตัวอย่าง)</div>
            {ingredients.losing.length === 0 ? (
              <p className="mt-0.5 text-subtle">ยังไม่มี — จะสะสมเองเมื่อโพสต์ไหนวัดผลแล้ว "คนสนใจน้อย"</p>
            ) : (
              ingredients.losing.map((w, i) => (
                <p key={i} className="mt-1 rounded-lg border border-hairline bg-red-50/40 px-3 py-1.5 text-xs text-ink/70">
                  {w.length > 160 ? `${w.slice(0, 160)}…` : w}
                </p>
              ))
            )}
          </div>
          <p className="text-xs text-subtle">ตัวอย่างข้อ 3-4 เลือกจากตำแหน่งใกล้เคียงก่อน แล้วเรียงตามคะแนน engagement — อัปเดตทุกครั้งที่มีการวัดผลใหม่</p>
        </div>
      </details>

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

                      {/* provenance จริงของร่างนี้ — AI คิดจากอะไร (research + A/B + ตัวอย่างที่ใช้) */}
                      {ct.gen_notes && (ct.gen_notes.angles?.length || ct.gen_notes.hooks?.length || ct.gen_notes.imageStyle || ct.gen_notes.style) && (
                        <details className="mt-3 rounded-lg border border-hairline bg-black/[0.015] px-3 py-2">
                          <summary className="cursor-pointer select-none text-xs font-medium text-subtle">🧠 ร่างนี้ AI คิดจากอะไร</summary>
                          <div className="mt-2 space-y-1.5 text-xs text-ink/75">
                            {ct.gen_notes.style && <div><span className="text-subtle">แนวเขียน:</span> {ct.gen_notes.style}</div>}
                            {ct.gen_notes.angles && ct.gen_notes.angles.length > 0 && (
                              <div><span className="text-subtle">มุมที่เล่น (research):</span> {ct.gen_notes.angles.join(' · ')}</div>
                            )}
                            {ct.gen_notes.hooks && ct.gen_notes.hooks.length > 0 && (
                              <div><span className="text-subtle">ฮุกที่แนะ:</span> {ct.gen_notes.hooks.join(' | ')}</div>
                            )}
                            {ct.gen_notes.imageStyle && <div><span className="text-subtle">สไตล์รูป:</span> {ct.gen_notes.imageStyle}</div>}
                            <div className="text-subtle/70">
                              อ้างอิงแนวที่เวิร์ค {ct.gen_notes.used_winning ?? 0} · เลี่ยงแนวที่ไม่เวิร์ค {ct.gen_notes.used_losing ?? 0}
                              {ct.gen_notes.research_model ? ` · research: ${ct.gen_notes.research_model}` : ''}
                            </div>
                          </div>
                        </details>
                      )}
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
                                required
                                defaultValue=""
                                className="rounded-lg border border-hairline bg-transparent px-2 py-1.5 text-sm text-ink"
                              >
                                <option value="" disabled>เลือกบัญชี Facebook…</option>
                                {fbAccounts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.label} ({a.group_count} กลุ่ม)
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <Link href="/settings/connectors" className="text-xs text-accent hover:underline">
                              เพิ่มและผูกบัญชี Facebook ก่อนอนุมัติ
                            </Link>
                          )}
                          <button className="btn-primary btn-sm" disabled={fbAccounts.length === 0}>✓ อนุมัติและโพสต์</button>
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
