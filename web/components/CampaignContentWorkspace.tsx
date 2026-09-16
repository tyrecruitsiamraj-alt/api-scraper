'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { approveContentAction, editCaptionAction, editPosterAction, rejectContentAction, regenerateContentImageAction, resetPosterStandardAction, runFacebookPreflightAction } from '@/lib/actions';
import type { PosterFields } from '@/lib/repo';
import { emptyPosterExtras, emptyPosterLayout } from '../../src/core/poster-template.js';
import { PosterDragCanvas } from '@/components/PosterDragCanvas';
import { PosterExtrasBar } from '@/components/PosterExtrasBar';

type QualityCheck = { code: string; label: string; message: string; status: 'pass' | 'warning' | 'fail' | 'not_applicable' };

type Props = {
  campaignId: string;
  content: {
    id: string;
    hasImage: boolean;
    hasSourceImage: boolean;
    imageGenerationOk: boolean;
    qualityStatus: 'pending' | 'pass' | 'warning' | 'fail';
    qualityScore: number | null;
    qualitySummary?: string;
    qualityChecks?: QualityCheck[];
    isPreview: boolean;
  };
  initialPoster: PosterFields;
  initialCaption: string;
  preflightAccounts: { id: string; label: string }[];
  posterSaved?: boolean;
  standardSaved?: boolean;
  hasStandard?: boolean;
  standardReset?: boolean;
};

const COPY = {
  title: 'ตำแหน่ง',
  badge: 'ป้ายด้านบน',
  location: 'สถานที่ทำงาน',
  worktime: 'วันและเวลาทำงาน',
  salaryTotal: 'รายได้หลัก',
  salaryBreakdown: 'รายละเอียดรายได้เพิ่มเติม',
  quantity: 'จำนวนที่รับ',
} as const;

function PosterPreview({ fields, content, onLayoutChange, onExtrasChange }: { fields: PosterFields; content: Props['content']; onLayoutChange: (layout: NonNullable<PosterFields['layout']>) => void; onExtrasChange: (extras: NonNullable<PosterFields['extras']>) => void }) {
  const source = `/api/campaign-content/${content.id}/source-image`;
  const finalImage = `/api/campaign-content/${content.id}/image`;
  if (!content.hasSourceImage) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-black/[0.03] shadow-[0_20px_50px_rgba(11,42,85,0.14)]">
        {content.hasImage ? <img src={finalImage} alt="โปสเตอร์ปัจจุบัน" className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-sm text-subtle">ยังไม่มีรูป</div>}
        <div className="absolute inset-x-4 bottom-4 rounded-xl bg-black/70 px-3 py-2 text-xs text-white">ร่างนี้ไม่มีภาพต้นฉบับ จึงแสดงรูปเดิมและยังแก้ข้อความบนรูปไม่ได้</div>
      </div>
    );
  }

  return (
    <PosterDragCanvas
      fields={fields}
      sourceUrl={source}
      enabled
      onLayoutChange={onLayoutChange}
      onExtrasChange={onExtrasChange}
    />
  );
}

function TextField({ name, label, value, onChange, multiline = false, className = '' }: { name: keyof typeof COPY; label: string; value: string; onChange: (value: string) => void; multiline?: boolean; className?: string }) {
  return <label className={className}><span className="label">{label}</span>{multiline ? <textarea name={`poster${name[0].toUpperCase()}${name.slice(1)}`} className="field min-h-20 w-full resize-y" value={value} onChange={(event) => onChange(event.target.value)} /> : <input name={`poster${name[0].toUpperCase()}${name.slice(1)}`} className="field w-full" value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function PosterSaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary btn-sm" disabled={disabled || pending}>{pending ? 'กำลังประกอบรูป…' : 'บันทึกและประกอบรูปใหม่'}</button>;
}

export function CampaignContentWorkspace({ campaignId, content, initialPoster, initialCaption, preflightAccounts, posterSaved = false, standardSaved = false, hasStandard = false, standardReset = false }: Props) {
  const [poster, setPoster] = useState<PosterFields>(initialPoster);
  const [caption, setCaption] = useState(initialCaption);
  const update = <K extends keyof PosterFields>(key: K, value: PosterFields[K]) => setPoster((current) => ({ ...current, [key]: value }));
  const canApprove = !content.isPreview && content.hasImage && content.imageGenerationOk && content.qualityStatus !== 'fail';
  const qualityTone = content.qualityStatus === 'fail' ? 'border-red-200 bg-red-50' : content.qualityStatus === 'pass' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50';

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline bg-black/[0.015] px-5 py-4">
        <div><p className="eyebrow">ขั้นที่ 3 · ทำและแก้สื่อ</p><h2 className="mt-1 text-lg font-semibold">แก้รูปและ Caption ได้จากหน้าเดียว</h2><p className="mt-1 text-xs text-subtle">ลากเลเยอร์เดิมได้ และเพิ่มรูปหรือข้อความบนโปสเตอร์ชุดนี้ได้ · นี่ไม่ใช่ Canva เต็ม · บันทึกพร้อมติ๊กใช้เป็นแบบมาตรฐาน งานชุดนี้ต่อไปจะจัดวางแบบนี้โดยไม่ย้ายรูปคนจากงานอื่น</p></div>
        <span className="pill bg-blue-50 text-blue-700">ยังไม่โพสต์จริง</span>
      </div>

      <div className="grid items-start gap-6 p-5 xl:grid-cols-[minmax(360px,45fr)_minmax(460px,55fr)]">
        <div className="xl:sticky xl:top-5">
          <PosterPreview fields={poster} content={content} onLayoutChange={(layout) => update('layout', layout)} onExtrasChange={(extras) => update('extras', extras)} />
          {content.hasSourceImage && (
            <PosterExtrasBar extras={poster.extras ?? []} hasSourceImage={content.hasSourceImage} onChange={(extras) => update('extras', extras)} />
          )}
          {!content.hasSourceImage && (
            <p className="mt-3 text-xs leading-5 text-subtle">สิ่งที่เห็นคือองค์ประกอบเดียวกับไฟล์ PNG จริง แก้ข้อความได้จากฟอร์ม หรือกดให้ AI เปลี่ยนเฉพาะคนและสถานที่</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" className="btn-ghost justify-center" onClick={() => { setPoster(initialPoster); setCaption(initialCaption); }}>↻ คืนค่าเดิม</button>
            <form action={regenerateContentImageAction}>
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="contentId" value={content.id} />
              <button className="btn-secondary w-full justify-center" disabled={content.isPreview}>✦ ให้ AI คิดภาพใหม่</button>
            </form>
          </div>
          <p className="mt-2 text-xs text-subtle">เปลี่ยนเฉพาะคนและฉากในภาพตาม Brief เดิม · Caption ข้อความบนภาพ และโลโก้จะคงเดิม · ยังไม่โพสต์จริง</p>
        </div>

        <div className="space-y-5">
          <form action={editPosterAction} className="rounded-2xl border border-blue-200 bg-blue-50/55 p-4">
            <input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} />
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">ข้อความบนภาพ</h3><p className="mt-1 text-xs text-subtle">ข้อมูลทุกช่องต้องตรงกับใบขอ ระบบจะตรวจอีกครั้งตอนบันทึก</p></div><button type="button" className="btn-ghost btn-sm" onClick={() => setPoster(initialPoster)}>คืนค่าเดิม</button></div>
            <input type="hidden" name="posterBadge" value={poster.badge} />
            <input type="hidden" name="posterLayout" value={JSON.stringify(poster.layout ?? emptyPosterLayout())} />
            <input type="hidden" name="posterExtras" value={JSON.stringify(poster.extras ?? emptyPosterExtras())} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TextField name="title" label={COPY.title} value={poster.title} onChange={(value) => update('title', value)} />
              <TextField name="location" label={COPY.location} value={poster.location} onChange={(value) => update('location', value)} />
              <TextField name="salaryTotal" label={COPY.salaryTotal} value={poster.salaryTotal} onChange={(value) => update('salaryTotal', value)} />
              <TextField name="quantity" label={COPY.quantity} value={poster.quantity} onChange={(value) => update('quantity', value)} />
              <label><span className="label">เพศ / อายุ / คุณสมบัติ — 1 ข้อต่อบรรทัด</span><textarea name="posterQualifications" className="field min-h-24 w-full resize-y" value={poster.qualifications.join('\n')} onChange={(event) => update('qualifications', event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} /></label>
              <TextField name="worktime" label={COPY.worktime} value={poster.worktime} onChange={(value) => update('worktime', value)} multiline />
              <label className="sm:col-span-2"><span className="label">สวัสดิการ (แสดงในสื่อ) — 1 ข้อต่อบรรทัด</span><textarea name="posterBenefits" className="field min-h-20 w-full resize-y" value={poster.benefits.join('\n')} onChange={(event) => update('benefits', event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} /></label>
              <TextField name="salaryBreakdown" label={COPY.salaryBreakdown} value={poster.salaryBreakdown} onChange={(value) => update('salaryBreakdown', value)} className="sm:col-span-2" />
              <label><span className="label">เบอร์โทรที่ยืนยันแล้ว</span><input name="posterContactLine" inputMode="tel" className="field w-full" placeholder="เช่น 081-234-5678" value={poster.contactLine} onChange={(event) => update('contactLine', event.target.value)} /></label>
              <label><span className="label">ตำแหน่งคนในภาพ</span><select name="posterImageSide" className="field w-full" value={poster.imageSide} onChange={(event) => update('imageSide', event.target.value === 'left' ? 'left' : 'right')}><option value="right">ขวา — ข้อความอยู่ซ้าย</option><option value="left">ซ้าย — ข้อความอยู่ขวา</option></select></label>
              <label><span className="label">โลโก้บนภาพ</span><select name="posterLogoVariant" className="field w-full" value={poster.logoVariant ?? 'people-navy'} onChange={(event) => update('logoVariant', event.target.value === 'so-red' ? 'so-red' : 'people-navy')}><option value="people-navy">SO PEOPLE สีน้ำเงิน</option><option value="so-red">SO สีแดง</option></select></label>
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 rounded-xl border border-blue-200 bg-white/70 px-3 py-2 text-sm text-ink">
                <input type="checkbox" name="saveAsStandard" value="1" className="mt-0.5" />
                <span>
                  <b>ใช้เป็นแบบมาตรฐานต่อไป</b>
                  <span className="mt-0.5 block text-xs text-subtle">เก็บตำแหน่งเลเยอร์และกล่องข้อความ · ไม่เอาภาพคนหรือไฟล์ที่อัปโหลดจากงานนี้ไปงานอื่น</span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <PosterSaveButton disabled={!content.hasSourceImage} />
                {content.hasSourceImage && <button type="button" className="btn-ghost btn-sm" onClick={() => update('layout', emptyPosterLayout())}>จัดวางตามต้นฉบับ</button>}
                <span className="text-xs text-subtle">{content.hasSourceImage ? 'มีภาพต้นฉบับพร้อมแก้ไข' : 'ร่างนี้ไม่มีภาพต้นฉบับ จึงต้องให้ AI สร้างร่างใหม่ก่อน'}</span>
              </div>
            </div>
            {posterSaved && standardSaved && <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><b>✓ บันทึกแล้ว งานโปสเตอร์ชุดนี้ต่อไปจะจัดวางแบบนี้</b><span className="ml-1 text-emerald-800">PNG ของร่างนี้ถูกประกอบใหม่แล้ว และงานใหม่ที่ใช้เทมเพลตเดียวกันจะตามการจัดวางนี้</span></div>}
            {posterSaved && !standardSaved && <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><b>✓ บันทึกรูปใหม่แล้ว</b><span className="ml-1 text-emerald-800">เฉพาะร่างนี้ · ยังไม่ได้เปลี่ยนแบบมาตรฐาน</span></div>}
            {standardReset && <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"><b>กลับไปใช้แบบต้นฉบับ SO แล้ว</b><span className="ml-1">งานโปสเตอร์ชุดนี้ต่อไปจะจัดวางตามเทมเพลต SO PEOPLE เดิม</span></div>}
            {hasStandard && !standardReset && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-ink/80">
                <span>ตอนนี้งานใหม่จะจัดวางตามแบบมาตรฐานที่บันทึกไว้</span>
                <button type="submit" formAction={resetPosterStandardAction} formNoValidate className="btn-ghost btn-sm">กลับไปใช้แบบต้นฉบับ SO</button>
              </div>
            )}
          </form>

          <form action={editCaptionAction} className="rounded-2xl border border-hairline p-4">
            <input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} />
            <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Caption</p><h3 className="mt-1 font-semibold">ข้อความใต้โพสต์</h3></div><button type="button" className="btn-ghost btn-sm" onClick={() => setCaption(initialCaption)}>คืนค่า AI</button></div>
            <textarea name="caption" className="field mt-3 min-h-56 w-full resize-y whitespace-pre-wrap leading-6" value={caption} onChange={(event) => setCaption(event.target.value)} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={`text-xs ${caption.length > 1000 ? 'text-red-700' : 'text-subtle'}`}>{caption.length.toLocaleString('th-TH')} / 1,000 ตัวอักษร</span><div className="flex items-center gap-2"><span className="text-xs text-subtle">การบันทึกไม่ส่งโพสต์</span><button className="btn-secondary btn-sm">บันทึกร่าง Caption</button></div></div>
          </form>
        </div>
      </div>

      <div className="border-t border-hairline px-5 py-4">
        <div className={`rounded-xl border px-4 py-3 ${qualityTone}`}><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><b>{content.qualityStatus === 'fail' ? '⛔ ยังอนุมัติไม่ได้' : content.qualityStatus === 'pass' ? '✓ ผ่านการตรวจข้อมูลสำคัญ' : '⚠ ควรตรวจเพิ่มก่อนอนุมัติ'}</b>{content.qualityScore != null && <span>{content.qualityScore}/100</span>}</div>{content.qualitySummary && <p className="mt-1 text-xs text-ink/75">{content.qualitySummary}</p>}{content.qualityChecks?.length ? <details className="mt-2 text-xs"><summary className="cursor-pointer text-subtle">ดูผลตรวจทีละข้อ</summary><ul className="mt-1 space-y-1">{content.qualityChecks.map((check) => <li key={check.code} className={check.status === 'fail' ? 'text-red-700' : check.status === 'warning' ? 'text-amber-700' : check.status === 'not_applicable' ? 'text-subtle' : 'text-emerald-700'}>{check.status === 'fail' ? '✕' : check.status === 'warning' ? '!' : check.status === 'not_applicable' ? '–' : '✓'} {check.label}: {check.message}</li>)}</ul></details> : null}</div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          {preflightAccounts.length > 0 && <form action={runFacebookPreflightAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="campaignId" value={campaignId} /><label className="text-xs text-subtle"><span className="mb-1 block">ทดสอบ Facebook (ไม่โพสต์จริง)</span><select name="fbAccountId" required defaultValue="" className="field"><option value="" disabled>เลือกบัญชี…</option>{preflightAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label><button className="btn-secondary btn-sm">ตรวจ Session + กลุ่ม</button></form>}
          <form action={approveContentAction}><input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} /><input type="hidden" name="feedbackCode" value="ready" /><button className="btn-primary btn-sm" disabled={!canApprove}>{content.isPreview ? 'Preview — ยังอนุมัติไม่ได้' : canApprove ? '✓ อนุมัติ ไปหน้าสรุป' : 'ยังไม่ผ่านด่านอนุมัติ'}</button></form>
          <form action={rejectContentAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} /><label className="text-xs text-subtle"><span className="mb-1 block">ตีกลับให้ AI แก้</span><select name="reasonCode" className="field" defaultValue="incorrect_info"><option value="incorrect_info">ข้อมูลไม่ถูกต้อง</option><option value="poor_visual">รูปไม่เหมาะกับงาน</option><option value="missing_details">ข้อมูลสำคัญไม่ครบ</option><option value="other">อื่น ๆ</option></select></label><button className="btn-ghost btn-sm">ส่งกลับไปคิดใหม่</button></form>
        </div>
      </div>
    </section>
  );
}
