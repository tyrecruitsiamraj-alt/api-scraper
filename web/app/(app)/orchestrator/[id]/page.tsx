import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contentGenIngredients, getCampaign, getCampaignAutopostProgress, getCampaignPostQueueState, listCampaignContents, listCampaignPosts, listFacebookAccounts, soRecruitCheck } from '@/lib/repo';
import type { CampaignPostRow } from '@/lib/repo';
import { approveContentAction, rejectContentAction, editCaptionAction, editPosterAction, measureCampaignAction, retryCampaignDraftAction, runFacebookPreflightAction } from '@/lib/actions';
import { CaptionViewer } from '@/components/CaptionViewer';
import { AutopostSummaryForm } from '@/components/AutopostSummaryForm';
import { CampaignContentWorkspace } from '@/components/CampaignContentWorkspace';

export const dynamic = 'force-dynamic';

const humanText = (value: unknown) => String(value ?? '').replace(/โรงงาร/g, 'โรงงาน');

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
  needs_input: 'ต้องยืนยันข้อมูล',
  researching: 'กำลังหาแนวทางที่เหมาะกับงานนี้',
  drafting: 'กำลังทำ content',
  pending_approval: 'รออนุมัติ',
  approved: 'พร้อมสรุปก่อน Auto-post',
  posting: 'กำลัง Auto-post',
  measuring: 'วัดผล',
  done: 'เสร็จ',
  low_engagement: 'คนสนใจน้อย (คิดใหม่)',
};

// แถบสเตจบนหน้า detail — ไฮไลต์ว่างานนี้อยู่ช่วงไหน
const STRIP = [
  { label: 'ตรวจใบขอ' },
  { label: 'ค้นผู้สมัคร' },
  { label: 'ทำและแก้สื่อ' },
  { label: 'ตรวจสรุป' },
  { label: 'เสร็จสิ้น' },
];
const STATUS_TO_STEP: Record<string, number> = {
  new: 0,
  needs_input: 0,
  researching: 2,
  drafting: 2,
  low_engagement: 2,
  pending_approval: 2,
  approved: 3,
  posting: 3,
  measuring: 3,
  done: 4,
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

export default async function CampaignDetail({ params, searchParams }: { params: { id: string }; searchParams?: { contentError?: string; contentSaved?: string } }) {
  const c = await getCampaign(params.id);
  if (!c) notFound();
  const contentError = typeof searchParams?.contentError === 'string' ? searchParams.contentError : null;
  const posterSaved = searchParams?.contentSaved === 'poster';
  const snap = (c.request_snapshot ?? {}) as Record<string, any>;
  const contents = await listCampaignContents(params.id);
  const approvedContent = contents.find((item) => item.status === 'approved') ?? null;
  const readyContents = contents.filter((item) => item.status === 'draft' && item.has_image && item.image_generation_ok && item.quality_status !== 'fail');
  const recommendedContentId = readyContents[0]?.id ?? null;
  // หน้าอนุมัติควรมีตัวเลือกที่ตัดสินใจได้จริง ไม่ควรเอาร่างที่ระบบรู้อยู่แล้วว่า
  // ไม่ผ่านมาวางแข่งกัน ผู้ใช้ยังเห็นจำนวนประวัติที่ถูกคัดออกได้ด้านบน.
  const reviewContents = readyContents.length ? readyContents : contents.slice(0, 1);
  const hiddenHistoryCount = Math.max(0, contents.length - reviewContents.length);
  const fbAccounts = await listFacebookAccounts();
  const preflightAccounts = fbAccounts.filter((account) => account.group_count > 0 && account.preflight_ready);
  const publishAccounts = fbAccounts.filter((account) => account.group_count > 0 && account.preflight_verified && account.preflight_ready);
  const posts = await listCampaignPosts(params.id);
  const postQueue = await getCampaignPostQueueState(params.id);
  const autopostProgress = await getCampaignAutopostProgress(params.id);
  const engByContent = aggregateByContent(posts);
  const canMeasure = ['posting', 'measuring', 'low_engagement'].includes(c.status);
  const activePostQueue = postQueue?.status === 'queued' || postQueue?.status === 'running';
  const regenerateBusy = ['researching', 'drafting', 'posting', 'measuring'].includes(c.status) || activePostQueue;
  const pool = await soRecruitCheck(c.request_no);
  const ingredients = await contentGenIngredients(c.title);

  // ป้ายบอกว่า "ต้องทำอะไรต่อ" — คนเปิดหน้ามาแล้วรู้ทันทีว่างานค้างที่ใคร
  const NEXT_ACTION: Record<string, { text: string; cls: string }> = {
    drafting: { text: '🤖 AI กำลังคิดร่าง — รอสักครู่ ร่างใหม่จะโผล่ด้านล่างเอง', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
    pending_approval: { text: '👉 รอคุณ: ตรวจร่างด้านล่าง เลือกเวอร์ชันที่ชอบแล้วกดอนุมัติ (หรือตีกลับให้ AI แก้)', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    posting: { text: '📤 กำลังโพสต์/รอคิวโพสต์ — เสร็จแล้วระบบจะเก็บคอมเมนต์และวัดผลเอง', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
    measuring: { text: '⏳ รอเก็บผลตอบรับจากโพสต์ — เมื่อข้อมูลพร้อมให้กด “ตรวจผลตอนนี้”', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    low_engagement: { text: '📉 คนสนใจน้อย — ระบบบันทึกแนวนี้เป็น "ห้ามทำซ้ำ" และสั่ง AI คิดเวอร์ชันใหม่แล้ว', cls: 'border-red-200 bg-red-50 text-red-700' },
    done: { text: '✅ เสร็จสิ้น — แนวที่ได้ผลถูกเก็บเป็นต้นแบบ ระบบจะใช้เป็นแนวทางในงานถัดไป', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    draft_error: { text: '⚠️ สร้างประกาศไม่สำเร็จ — กลับไปหน้าศูนย์งานแล้วกด “ลองสร้างประกาศใหม่”', cls: 'border-red-200 bg-red-50 text-red-700' },
  };
  const nextAction = NEXT_ACTION[c.status];

  return (
    <div className="space-y-6">
      <Link href="/orchestrator" className="text-sm text-subtle hover:text-accent">← กลับ Dashboard</Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{c.title || c.request_no || 'งานรับสมัคร'}</h1>
            <p className="mt-1 text-sm text-subtle">
              ใบขอ {c.request_no || '—'}
              {c.province && ` · ${humanText(c.province)}`}
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
            {!regenerateBusy && (
              <form action={retryCampaignDraftAction}>
                <input type="hidden" name="campaignId" value={c.id} />
                <button className="btn-ghost btn-sm" title="สร้างเวอร์ชันใหม่ — ของเดิมยังอยู่ให้เทียบ">↻ ให้ AI คิดใหม่</button>
              </form>
            )}
            {regenerateBusy && ['posting', 'measuring'].includes(c.status) && (
              <span className="text-xs text-subtle" title="ป้องกันประกาศคนละฉบับชนกับงานที่กำลังเผยแพร่">
                รอโพสต์และวัดผลเสร็จก่อนจึงคิดใหม่ได้
              </span>
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
        {contentError && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <b>บันทึกรูปยังไม่สำเร็จ:</b> {contentError}
            <p className="mt-1 text-xs text-red-800">ข้อมูลเดิมยังอยู่ครบ ลองบันทึกอีกครั้งได้โดยไม่ต้องสร้าง Content หรือโพสต์ใหม่</p>
          </div>
        )}
        {posterSaved && (
          <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <b>บันทึกรูปใหม่แล้ว</b> ระบบประกอบ PNG จากภาพต้นฉบับและตรวจข้อมูลสำคัญเรียบร้อยแล้ว
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
            <Field label="พื้นที่/สถานที่" value={humanText(snap.location || snap.work_addr)} />
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
            <Field label="สถานที่ทำงาน" value={humanText(snap.work_addr)} />
          </dl>
        </div>
      )}

      {c.status === 'approved' && approvedContent && (
        <section className="overflow-hidden rounded-2xl border-2 border-violet-300 bg-violet-50/60">
          <div className="bg-violet-700 px-5 py-4 text-white">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-100">ขั้นสุดท้ายก่อนโพสต์จริง</p>
            <h2 className="mt-1 text-lg font-semibold">สรุปงานและเริ่ม Auto-post</h2>
            <p className="mt-1 text-sm text-violet-100">Content อนุมัติแล้ว แต่ยังไม่มีโพสต์ใดถูกส่งออกจนกดปุ่มด้านล่าง</p>
          </div>
          <div className="p-5">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-violet-100 bg-white px-4 py-3"><span className="block text-xs text-subtle">ตำแหน่ง</span><b>{c.title || c.request_no}</b></div>
              <div className="rounded-xl border border-violet-100 bg-white px-4 py-3"><span className="block text-xs text-subtle">สื่อที่อนุมัติ</span><b>รูป + แคปชัน เวอร์ชัน {approvedContent.version}</b></div>
              <div className="rounded-xl border border-violet-100 bg-white px-4 py-3"><span className="block text-xs text-subtle">สถานะ</span><b>รอเลือกบัญชีและกลุ่ม</b></div>
            </div>
            {publishAccounts.length > 0 ? (
              <AutopostSummaryForm
                campaignId={c.id}
                contentId={approvedContent.id}
                accounts={publishAccounts.map((account) => ({ id: account.id, label: account.label, groupCount: account.group_count }))}
              />
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                ยังไม่มีบัญชีที่พร้อม Auto-post — ต้องผูกเครื่อง เลือกกลุ่ม และผ่านการทดสอบแบบไม่โพสต์จริงก่อน
                <Link href="/settings/connectors" className="ml-2 font-medium text-accent underline">ไปตั้งค่า Connector</Link>
              </div>
            )}
          </div>
        </section>
      )}

      {autopostProgress && ['posting', 'measuring', 'done'].includes(c.status) && (
        <section className="card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Auto-post</p>
              <h2 className="mt-1 text-lg font-semibold">ความคืบหน้าการโพสต์ตามกลุ่มที่เลือก</h2>
            </div>
            <span className="pill bg-blue-50 text-blue-700">โพสต์สำเร็จ {autopostProgress.posted_groups} / {autopostProgress.selected_groups} กลุ่ม</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${autopostProgress.selected_groups ? Math.min(100, Math.round((autopostProgress.posted_groups / autopostProgress.selected_groups) * 100)) : 0}%` }} />
          </div>
          <p className="mt-2 text-xs text-subtle">ระบบเริ่มบันทึกผลแล้ว {autopostProgress.attempted_groups} กลุ่ม · จำนวนเป้าหมายล็อกจากชุดกลุ่มที่คุณเลือกตอนกด Auto-post</p>
        </section>
      )}

      {/* โปร่งใส: บอกคนตรวจว่า AI เอาอะไรมาประกอบตอนคิดร่าง — จะได้รู้ว่าต้องเช็คอะไร */}
      <details className="card px-6 py-4">
        <summary className="cursor-pointer select-none text-sm font-semibold">
          🧠 AI ใช้ข้อมูลอะไรสร้างประกาศ
          <span className="ml-2 text-xs font-normal text-subtle">กดดูข้อมูลที่นำมาประกอบการสร้าง</span>
        </summary>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="text-xs font-medium text-subtle">1 · ข้อมูลใบขอ (ด้านบน)</div>
            <p className="mt-0.5 text-ink/80">ตำแหน่ง พื้นที่ รายได้ จำนวน เวลางาน — กติกาเหล็ก: <b>ไม่มีในใบขอ = ห้าม AI แต่งเอง</b> (เงินเดือน/สวัสดิการใช้คำกลางแทน)</p>
          </div>
          <div>
            <div className="text-xs font-medium text-subtle">2 · ตัวเลือกสองแบบให้เปรียบเทียบ</div>
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
          <p className="text-xs text-subtle">ตัวอย่างข้อ 3-4 เลือกจากตำแหน่งใกล้เคียงก่อน แล้วเรียงตามผลตอบรับ — อัปเดตเมื่อมีผลจากโพสต์ใหม่</p>
        </div>
      </details>

      <div>
        <h2 className="mb-3 text-base font-semibold">ร่างคอนเทนต์</h2>
        {contents.length === 0 ? (
          <div className="card border-dashed p-6 text-center text-sm text-subtle">
            ยังไม่มีร่างประกาศ — ระบบจะสร้างข้อความ รูป และแนววิดีโอเมื่อเครื่องทำงานอัตโนมัติพร้อม
          </div>
        ) : (
          <div className="space-y-4">
            {recommendedContentId && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">ร่างแนะนำ</span> ผ่านข้อเท็จจริงสำคัญและมีรูปพร้อมใช้แล้ว
                {hiddenHistoryCount > 0 && <span className="ml-1 text-green-700/75">· เก็บร่างเก่าหรือไม่ผ่านไว้อีก {hiddenHistoryCount} ร่างโดยไม่รบกวนการตัดสินใจ</span>}
              </div>
            )}
            {reviewContents.map((ct) => {
              const meta = CONTENT_STATUS[ct.status] ?? { label: ct.status, cls: 'bg-black/5 text-ink' };
              const eng = engByContent.get(ct.id);
              const isPreview = ct.gen_notes?.generation_mode === 'preview';
              const posterFields = ct.poster_fields ?? {
                title: String(c.title || snap.position || snap.request_name || ''),
                badge: 'เปิดรับสมัครด่วน',
                location: humanText(snap.location || snap.work_addr || c.province || ''),
                worktime: String(snap.work_schedule || ''),
                salaryTotal: String(snap.income || ''),
                salaryBreakdown: '',
                quantity: c.qty ? `${c.qty} อัตรา` : '',
                qualifications: [
                  snap.gender ? (['o', 'all', 'any', 'a', 'ไม่จำกัด'].includes(String(snap.gender).toLowerCase()) ? 'ไม่จำกัดเพศ' : `เพศ ${snap.gender}`) : '',
                  snap.age_min || snap.age_max ? `อายุ ${snap.age_min || ''}–${snap.age_max || ''} ปี` : '',
                  snap.education ? `วุฒิการศึกษา ${snap.education}` : '',
                ].filter(Boolean),
                benefits: [],
                contactLine: String(snap.contact_phone || snap.phone || snap.tel || snap.mobile || snap.contact_tel || ''),
                imageSide: isPreview ? 'left' as const : 'right' as const,
              };
              return (
                <div key={ct.id} className="card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium">
                      เวอร์ชัน {ct.version}
                      {ct.id === recommendedContentId && <span className="ml-1 text-green-700">(แนะนำ)</span>}
                      <span className="ml-2 text-xs text-subtle">· {ct.platform}</span>
                    </div>
                    <span className={`pill ${meta.cls}`}>{meta.label}</span>
                  </div>
                  {isPreview && (
                    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      Preview ชั่วคราวจาก Codex — ใช้ตรวจรูปและแคปชันได้ แต่ระบบปิดการโพสต์ไว้จนกว่า Worker จะสร้างร่าง Production ใหม่
                    </div>
                  )}
                  {ct.status === 'draft' ? (
                    <CampaignContentWorkspace
                      campaignId={c.id}
                      content={{
                        id: ct.id,
                        hasImage: ct.has_image,
                        hasSourceImage: ct.has_source_image,
                        imageGenerationOk: ct.image_generation_ok,
                        qualityStatus: ct.quality_status,
                        qualityScore: ct.quality_score,
                        qualitySummary: ct.quality_checks?.summary,
                        qualityChecks: ct.quality_checks?.checks,
                        isPreview,
                      }}
                      initialPoster={posterFields}
                      initialCaption={ct.caption ?? ''}
                      preflightAccounts={preflightAccounts.map((account) => ({ id: account.id, label: account.label }))}
                      posterSaved={posterSaved}
                    />
                  ) : (
                    <>
                  <div className="grid items-start gap-5 sm:grid-cols-[180px_1fr]">
                    {ct.has_image ? (
                      // คลิกเปิดรูปเต็ม (แท็บใหม่ — ซูม/เซฟได้)
                      <a
                        href={`/api/campaign-content/${ct.id}/image`}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block"
                        title="คลิกดูรูปเต็ม"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                         <img
                           src={`/api/campaign-content/${ct.id}/image`}
                           alt="รูปคอนเทนต์ที่ AI สร้าง"
                           className="aspect-square w-full rounded-lg border border-hairline object-cover transition group-hover:opacity-90"
                         />
                         <span className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-r from-white/20 via-white/5 to-transparent" />
                        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                          🔍 ดูเต็ม
                        </span>
                      </a>
                    ) : (
                      <div className="grid aspect-square place-items-center rounded-lg bg-accent/10 text-center text-xs text-accent">
                        ยังไม่มีรูป
                      </div>
                    )}
                      <div className="min-w-0">
                        {ct.status === 'draft' ? (
                          <form action={editCaptionAction} className="rounded-xl border border-hairline bg-black/[0.015] p-4">
                            <input type="hidden" name="contentId" value={ct.id} />
                            <input type="hidden" name="campaignId" value={c.id} />
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="eyebrow">แก้บนหน้า Web</p>
                                <h3 className="mt-1 text-base font-semibold">แคปชัน</h3>
                              </div>
                              <button type="reset" className="btn-ghost btn-sm shrink-0">คืนค่าเดิม</button>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-subtle">ปรับข้อความที่คนเห็นใต้โพสต์ได้ทันที บันทึกแล้วระบบจะตรวจข้อมูลสำคัญของร่างนี้ใหม่</p>
                            <textarea
                              name="caption"
                              defaultValue={ct.caption ?? ''}
                              rows={9}
                              className="field mt-4 min-h-48 w-full resize-y"
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button className="btn-secondary btn-sm">บันทึกแคปชัน</button>
                              <span className="text-[11px] text-subtle">ยังไม่โพสต์จริงจนกดอนุมัติ</span>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="mb-1 text-xs text-subtle">แคปชัน</div>
                            <CaptionViewer caption={ct.caption} />
                          </>
                        )}
                      {ct.video_brief && (
                        <>
                          <div className="mb-1 mt-3 text-xs text-subtle">แนววิดีโอ (brief)</div>
                          <div className="text-sm text-ink/70">{ct.video_brief}</div>
                        </>
                      )}
                      {ct.reject_reason && <div className="mt-2 text-xs text-red-600">เหตุผลตีกลับ: {ct.reject_reason}</div>}

                      <div className={`mt-3 rounded-lg border px-3 py-2 ${
                        ct.quality_status === 'fail'
                          ? 'border-red-200 bg-red-50'
                          : ct.quality_status === 'pass'
                            ? 'border-green-200 bg-green-50'
                            : 'border-amber-200 bg-amber-50'
                      }`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-medium">
                            {ct.quality_status === 'fail' ? '⛔ ยังอนุมัติไม่ได้' : ct.quality_status === 'pass' ? '✓ ข้อมูลสำคัญผ่านการตรวจ' : '⚠ ควรตรวจเพิ่ม'}
                          </span>
                          {ct.quality_score != null && <span>{ct.quality_score}/100</span>}
                        </div>
                        {ct.quality_checks?.summary && <p className="mt-1 text-xs text-ink/75">{ct.quality_checks.summary}</p>}
                        {ct.quality_checks?.checks?.length ? (
                          <details className="mt-2 text-xs">
                            <summary className="cursor-pointer select-none text-subtle">ดูผลตรวจทีละข้อ</summary>
                            <ul className="mt-1.5 space-y-1">
                              {ct.quality_checks.checks.map((item) => (
                                <li key={item.code} className={item.status === 'fail' ? 'text-red-700' : item.status === 'warning' ? 'text-amber-700' : 'text-green-700'}>
                                  {item.status === 'fail' ? '✕' : item.status === 'warning' ? '!' : '✓'} {item.label}: {item.message}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </div>

                      {/* provenance จริงของร่างนี้ — AI คิดจากอะไร (research + A/B + ตัวอย่างที่ใช้) */}
                      {ct.gen_notes && (ct.gen_notes.angles?.length || ct.gen_notes.hooks?.length || ct.gen_notes.imageStyle || ct.gen_notes.style) && (
                        <details className="mt-3 rounded-lg border border-hairline bg-black/[0.015] px-3 py-2">
                          <summary className="cursor-pointer select-none text-xs font-medium text-subtle">🧠 ประกาศนี้สร้างจากข้อมูลอะไร</summary>
                          <div className="mt-2 space-y-1.5 text-xs text-ink/75">
                            {ct.gen_notes.style && <div><span className="text-subtle">แนวเขียน:</span> {ct.gen_notes.style}</div>}
                            {ct.gen_notes.angles && ct.gen_notes.angles.length > 0 && (
                              <div><span className="text-subtle">แนวคิดที่เลือกใช้:</span> {ct.gen_notes.angles.join(' · ')}</div>
                            )}
                            {ct.gen_notes.hooks && ct.gen_notes.hooks.length > 0 && (
                              <div><span className="text-subtle">ฮุกที่แนะ:</span> {ct.gen_notes.hooks.join(' | ')}</div>
                            )}
                            {ct.gen_notes.imageStyle && <div><span className="text-subtle">สไตล์รูป:</span> {ct.gen_notes.imageStyle}</div>}
                            {ct.gen_notes.trends?.length ? <div><span className="text-subtle">คำแนะนำจาก Google Trends:</span> {ct.gen_notes.trends.join(' · ')}</div> : null}
                            {ct.gen_notes.research_keywords?.length ? <div><span className="text-subtle">คำค้นที่ Google แนะนำ:</span> {ct.gen_notes.research_keywords.join(' · ')}</div> : null}
                            <div className="text-subtle/70">
                              อ้างอิงแนวที่ได้ผล {ct.gen_notes.used_winning ?? 0} · เรียนรู้จากงานที่เคยอนุมัติ {ct.gen_notes.used_feedback ?? 0} · เลี่ยงแนวที่ไม่ผ่าน {ct.gen_notes.used_losing ?? 0}
                              {ct.gen_notes.research_model ? ` · วิเคราะห์ด้วย ${ct.gen_notes.research_model}` : ''}
                            </div>
                          </div>
                        </details>
                      )}

                      {ct.status === 'draft' && (
                        <section className="mt-4 overflow-hidden rounded-xl border-2 border-blue-300 bg-blue-50/70">
                          <form action={editPosterAction}>
                            <input type="hidden" name="contentId" value={ct.id} />
                            <input type="hidden" name="campaignId" value={c.id} />
                            <div className="flex items-start justify-between gap-4 bg-blue-600 px-4 py-3 text-white">
                              <div>
                                <p className="text-[11px] font-medium uppercase tracking-wide text-blue-100">แก้ข้อความบนหน้า Web</p>
                                <h3 className="mt-1 text-base font-semibold">ข้อความบนภาพ</h3>
                              </div>
                              <button type="reset" className="btn-ghost btn-sm shrink-0 border-white/30 bg-white/10 text-white hover:bg-white/20">คืนค่าเดิม</button>
                            </div>
                            <p className="px-4 pt-3 text-xs leading-5 text-blue-950/75">แก้รายละเอียดแล้วกดบันทึก ระบบจะประกอบ PNG ใหม่จากภาพต้นฉบับเดิมทางซ้าย โดยยังไม่ส่งโพสต์จริง</p>
                            <div className="grid gap-3 p-4 sm:grid-cols-2">
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">ตำแหน่ง</span>
                              <input className="field" name="posterTitle" required defaultValue={posterFields.title} />
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">ป้ายด้านบน</span>
                              <input className="field" name="posterBadge" defaultValue={posterFields.badge} />
                            </label>
                            <label className="text-xs text-subtle sm:col-span-2">
                              <span className="mb-1 block">สถานที่ทำงาน</span>
                              <textarea className="field min-h-20 resize-y" name="posterLocation" defaultValue={posterFields.location} />
                            </label>
                            <label className="text-xs text-subtle sm:col-span-2">
                              <span className="mb-1 block">วันและเวลาทำงาน</span>
                              <textarea className="field min-h-20 resize-y" name="posterWorktime" defaultValue={posterFields.worktime} />
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">รายได้หลัก</span>
                              <input className="field" name="posterSalaryTotal" defaultValue={posterFields.salaryTotal} />
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">รายละเอียดรายได้เพิ่มเติม</span>
                              <input className="field" name="posterSalaryBreakdown" defaultValue={posterFields.salaryBreakdown} />
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">จำนวนที่รับ</span>
                              <input className="field" name="posterQuantity" defaultValue={posterFields.quantity} />
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">เพศ / อายุ / คุณสมบัติ — 1 ข้อต่อบรรทัด</span>
                              <textarea className="field min-h-24" name="posterQualifications" defaultValue={posterFields.qualifications.join('\n')} />
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">สวัสดิการ — 1 ข้อต่อบรรทัด</span>
                              <textarea className="field min-h-24" name="posterBenefits" defaultValue={posterFields.benefits.join('\n')} />
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">เบอร์โทรที่ยืนยันแล้ว</span>
                              <input className="field" name="posterContactLine" inputMode="tel" placeholder="กรอกเมื่อพร้อม เช่น 081-234-5678" defaultValue={posterFields.contactLine} />
                              <span className="mt-1 block text-[11px]">เมื่อกรอก ระบบจะบันทึกเป็นข้อมูลของงานและเติมใน Caption ให้อัตโนมัติ</span>
                            </label>
                            <label className="text-xs text-subtle">
                              <span className="mb-1 block">คนอยู่ฝั่งไหนของภาพ</span>
                              <select className="field" name="posterImageSide" defaultValue={posterFields.imageSide}>
                                <option value="right">ขวา — ข้อความอยู่ซ้าย</option>
                                <option value="left">ซ้าย — ข้อความอยู่ขวา</option>
                              </select>
                            </label>
                            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                              <button className="btn-secondary btn-sm" disabled={!ct.has_source_image}>บันทึกและประกอบรูปใหม่</button>
                              {ct.has_source_image ? (
                                <span className="text-xs text-emerald-800">✓ มีภาพต้นฉบับแยกเก็บแล้ว แก้ข้อความ/ตำแหน่งคนแล้วประกอบ PNG ใหม่ได้ทันที</span>
                              ) : (
                                <>
                                  <span className="text-xs text-amber-800">ร่างนี้ยังไม่มีภาพต้นฉบับ จึงแก้บนรูปเดิมไม่ได้</span>
                                  <button formAction={retryCampaignDraftAction} className="btn-secondary btn-sm">ให้ AI สร้างรูปและแคปชันใหม่</button>
                                </>
                              )}
                            </div>
                            </div>
                          </form>
                        </section>
                      )}
                    </div>
                  </div>
                    </>
                  )}

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
