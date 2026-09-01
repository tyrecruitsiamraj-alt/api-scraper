'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  regenerateContentImageAction,
  saveAndApproveContentWorkspaceAction,
  saveContentWorkspaceAction,
} from '@/lib/actions';
import type { PosterFields } from '@/lib/repo';
import { buildPosterSvg } from '../../src/core/poster-template.js';

type Props = {
  campaignId: string;
  content: {
    id: string;
    hasSourceImage: boolean;
    qualityStatus: 'pending' | 'pass' | 'warning' | 'fail';
    isPreview: boolean;
  };
  initialPoster: PosterFields;
  initialCaption: string;
  saved?: boolean;
};

function ActionButtons({ canApprove }: { canApprove: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center justify-end gap-6">
      <button formAction={saveContentWorkspaceAction} className="inline-flex h-14 min-w-40 items-center justify-center gap-2 rounded-md border border-[#0a3970] bg-white px-7 text-[15px] font-medium text-[#082b62] transition hover:bg-blue-50 disabled:opacity-50" disabled={pending}>
        <span className="text-xl">▣</span>{pending ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
      </button>
      <button formAction={saveAndApproveContentWorkspaceAction} className="inline-flex h-14 min-w-44 items-center justify-center gap-2 rounded-md bg-[#073b78] px-8 text-[16px] font-medium text-white shadow-sm transition hover:bg-[#052f61] disabled:opacity-50" disabled={pending || !canApprove}>
        <span className="text-xl">✓</span>{pending ? 'กำลังตรวจ…' : 'อนุมัติสื่อ'}
      </button>
    </div>
  );
}

export function ContentReviewWorkspace({ campaignId, content, initialPoster, initialCaption, saved = false }: Props) {
  const [poster, setPoster] = useState(initialPoster);
  const [caption, setCaption] = useState(initialCaption);
  const update = <K extends keyof PosterFields>(key: K, value: PosterFields[K]) => setPoster((current) => ({ ...current, [key]: value }));
  const source = `/api/campaign-content/${content.id}/source-image`;
  const svg = buildPosterSvg(poster, source, '/logo-SO.webp');
  const canApprove = !content.isPreview && content.hasSourceImage && content.qualityStatus !== 'fail';

  return (
    <section className="grid min-h-[724px] overflow-hidden rounded-xl border border-[#d6dce4] bg-white lg:grid-cols-[565px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col border-r border-[#d6dce4] p-4">
        <div className="overflow-hidden rounded-xl border border-[#d6dce4] bg-white shadow-[0_2px_9px_rgba(16,41,72,0.08)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="mt-auto flex items-center gap-4 pt-6">
          <button type="button" onClick={() => { setPoster(initialPoster); setCaption(initialCaption); }} className="inline-flex h-14 min-w-44 items-center justify-center gap-3 rounded-md border border-[#0a3970] bg-white px-6 text-[16px] font-medium text-[#082b62] transition hover:bg-blue-50">
            <span className="text-2xl">↶</span>คืนค่าเดิม
          </button>
          <form action={regenerateContentImageAction} className="flex-1">
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="contentId" value={content.id} />
            <button className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-md border border-[#0a3970] bg-white px-6 text-[16px] font-medium text-[#082b62] transition hover:bg-blue-50" disabled={content.isPreview}>
              <span className="text-xl">✦</span>ให้ AI คิดภาพใหม่
            </button>
          </form>
        </div>
      </div>

      <form className="flex min-w-0 flex-col px-11 py-9">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="contentId" value={content.id} />
        <input type="hidden" name="posterBadge" value={poster.badge} />
        <input type="hidden" name="posterSalaryBreakdown" value={poster.salaryBreakdown} />

        <div className="grid gap-x-12 gap-y-5 md:grid-cols-2">
          <PixelField label="ตำแหน่ง" name="posterTitle" value={poster.title} onChange={(value) => update('title', value)} />
          <PixelField label="สถานที่ทำงาน" name="posterLocation" value={poster.location} onChange={(value) => update('location', value)} />
          <PixelField label="รายได้" name="posterSalaryTotal" value={poster.salaryTotal} suffix="บาท/เดือน" onChange={(value) => update('salaryTotal', value)} />
          <PixelField label="จำนวนรับ" name="posterQuantity" value={poster.quantity.replace(/\s*อัตรา\s*$/, '')} suffix="อัตรา" onChange={(value) => update('quantity', value.trim() ? `${value.trim()} อัตรา` : '')} />
          <PixelArea label="คุณสมบัติ" name="posterQualifications" value={poster.qualifications.join('\n')} className="h-[168px]" onChange={(value) => update('qualifications', value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
          <div className="space-y-5">
            <PixelArea label="เวลาทำงาน" name="posterWorktime" value={poster.worktime} className="h-10 py-2" onChange={(value) => update('worktime', value)} />
            <PixelArea label="สวัสดิการ (แสดงในสื่อ)" name="posterBenefits" value={poster.benefits.join('\n')} className="h-[62px]" onChange={(value) => update('benefits', value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
          </div>
          <PixelField label="เบอร์โทรที่ยืนยันแล้ว" name="posterContactLine" value={poster.contactLine} onChange={(value) => update('contactLine', value)} />
          <label>
            <span className="mb-2 block text-[16px] font-medium text-[#222]">โลโก้บนภาพ</span>
            <select name="posterLogoVariant" value={poster.logoVariant ?? 'people-navy'} onChange={(event) => update('logoVariant', event.target.value === 'so-red' ? 'so-red' : 'people-navy')} className="h-10 w-full rounded-md border border-[#cbd2dc] bg-white px-4 text-[15px] text-[#222] outline-none transition focus:border-[#0a3970] focus:ring-2 focus:ring-blue-100">
              <option value="people-navy">SO PEOPLE สีน้ำเงิน</option>
              <option value="so-red">SO สีแดง</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-[16px] font-medium text-[#222]">ตำแหน่งคนในภาพ</span>
            <select name="posterImageSide" value={poster.imageSide} onChange={(event) => update('imageSide', event.target.value === 'left' ? 'left' : 'right')} className="h-10 w-full rounded-md border border-[#cbd2dc] bg-white px-4 text-[15px] text-[#222] outline-none transition focus:border-[#0a3970] focus:ring-2 focus:ring-blue-100">
              <option value="right">ขวา — ข้อความอยู่ซ้าย</option>
              <option value="left">ซ้าย — ข้อความอยู่ขวา</option>
            </select>
          </label>
        </div>

        <label className="mt-6 block">
          <span className="mb-2 block text-[16px] font-medium text-[#222]">Caption (โพสต์ข้อความ)</span>
          <div className="relative">
            <textarea name="caption" value={caption} onChange={(event) => setCaption(event.target.value)} className="min-h-[190px] w-full resize-y rounded-md border border-[#0a3970] bg-white px-4 py-4 pb-9 text-[15px] leading-6 text-[#222] outline-none transition focus:ring-2 focus:ring-blue-200" />
            <span className="absolute bottom-3 right-4 text-[13px] text-[#6b7280]">{caption.length.toLocaleString('th-TH')} / 1,000</span>
          </div>
        </label>

        <div className="mt-auto flex items-end justify-between gap-4 pt-7">
          <div className="text-sm">
            {saved && <span className="text-emerald-700">✓ บันทึกรูปและ Caption แล้ว</span>}
            {!canApprove && <span className="text-red-700">ยังอนุมัติไม่ได้ กรุณาตรวจข้อมูลสำคัญ</span>}
          </div>
          <ActionButtons canApprove={canApprove} />
        </div>
      </form>
    </section>
  );
}

function PixelField({ label, name, value, suffix, onChange }: { label: string; name: string; value: string; suffix?: string; onChange: (value: string) => void }) {
  return <label><span className="mb-2 block text-[16px] font-medium text-[#222]">{label}</span><span className="relative block"><input name={name} value={value} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-md border border-[#cbd2dc] bg-white px-4 text-[15px] text-[#222] outline-none transition focus:border-[#0a3970] focus:ring-2 focus:ring-blue-100 ${suffix ? 'pr-28' : ''}`} />{suffix && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[13px] text-[#777]">{suffix}</span>}</span></label>;
}

function PixelArea({ label, name, value, className = '', onChange }: { label: string; name: string; value: string; className?: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-2 block text-[16px] font-medium text-[#222]">{label}</span><textarea name={name} value={value} onChange={(event) => onChange(event.target.value)} className={`w-full resize-y rounded-md border border-[#cbd2dc] bg-white px-4 py-3 text-[15px] leading-6 text-[#222] outline-none transition focus:border-[#0a3970] focus:ring-2 focus:ring-blue-100 ${className}`} /></label>;
}
