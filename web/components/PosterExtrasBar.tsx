'use client';

import { useRef, useState } from 'react';
import type { PosterExtra } from '../../src/core/poster-template.js';
import {
  POSTER_MAX_EXTRAS,
  createPosterImageExtra,
  createPosterTextExtra,
} from '../../src/core/poster-template.js';

type Props = {
  extras: PosterExtra[];
  hasSourceImage: boolean;
  onChange: (extras: PosterExtra[]) => void;
  tone?: 'workspace' | 'pixel';
};

function originLabel(extra: PosterExtra) {
  if (extra.kind === 'text') return 'ข้อความที่เจ้าหน้าที่พิมพ์';
  if (extra.provenance.origin === 'campaign_source') return 'รูปจากภาพต้นฉบับของงานนี้';
  return extra.provenance.filename ? `อัปโหลดจากไฟล์ ${extra.provenance.filename}` : 'รูปที่เจ้าหน้าที่อัปโหลด';
}

function readImageFile(file: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('เลือกได้เฉพาะไฟล์รูป'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('ไฟล์ใหญ่เกิน 8MB กรุณาเลือกรูปที่เล็กกว่านี้'));
      return;
    }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 480;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('ย่อรูปไม่สำเร็จ'));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const longest = 280;
      const boxScale = Math.min(1, longest / Math.max(width, height));
      resolve({
        src: canvas.toDataURL('image/jpeg', 0.8),
        w: Math.max(80, Math.round(width * boxScale)),
        h: Math.max(80, Math.round(height * boxScale)),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('เปิดไฟล์รูปไม่สำเร็จ'));
    };
    image.src = url;
  });
}

export function PosterExtrasBar({ extras, hasSourceImage, onChange, tone = 'workspace' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const full = extras.length >= POSTER_MAX_EXTRAS;
  const button = tone === 'pixel'
    ? 'inline-flex h-11 items-center justify-center rounded-md border border-[#0a3970] bg-white px-4 text-[14px] font-medium text-[#082b62] transition hover:bg-blue-50 disabled:opacity-50'
    : 'btn-ghost btn-sm';

  const add = (extra: PosterExtra | null, failMessage: string) => {
    if (full) {
      setError(`เพิ่มได้ไม่เกิน ${POSTER_MAX_EXTRAS} ชิ้นต่อโปสเตอร์`);
      return;
    }
    if (!extra) {
      setError(failMessage);
      return;
    }
    setError('');
    onChange([...extras, extra]);
  };

  return (
    <div className={tone === 'pixel' ? 'mt-4 space-y-3' : 'mt-3 space-y-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
              const prepared = await readImageFile(file);
              add(createPosterImageExtra({
                src: prepared.src,
                origin: 'operator_upload',
                filename: file.name,
                x: 56 + (extras.length * 28),
                y: 56 + (extras.length * 20),
                w: prepared.w,
                h: prepared.h,
              }), 'ไฟล์นี้ใช้เพิ่มบนโปสเตอร์ไม่ได้');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'เพิ่มรูปไม่สำเร็จ');
            }
          }}
        />
        <button type="button" className={button} disabled={full} onClick={() => fileRef.current?.click()}>
          เพิ่มรูป
        </button>
        <button
          type="button"
          className={button}
          disabled={full || !hasSourceImage}
          onClick={() => add(createPosterImageExtra({
            origin: 'campaign_source',
            x: 72,
            y: 430,
            w: 220,
            h: 280,
          }), 'ยังไม่มีภาพต้นฉบับของงานนี้')}
        >
          ใช้รูปต้นฉบับของงานนี้
        </button>
        <button
          type="button"
          className={button}
          disabled={full}
          onClick={() => add(createPosterTextExtra({
            text: 'ข้อความใหม่',
            x: 64,
            y: 620 + (extras.filter((item) => item.kind === 'text').length * 36),
          }), 'เพิ่มข้อความไม่สำเร็จ')}
        >
          เพิ่มข้อความ
        </button>
      </div>
      <p className="text-xs leading-5 text-subtle">นี่ไม่ใช่ Canva เต็ม แต่เพิ่มรูปและข้อความบนโปสเตอร์ชุดนี้ได้แล้ว · รูปที่เพิ่มมาจากเครื่องคุณหรือจากภาพต้นฉบับของงานนี้ ไม่ได้สุ่มรูปสต็อกมาแทน</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {extras.length > 0 && (
        <ul className="space-y-2">
          {extras.map((extra) => (
            <li key={extra.id} className="rounded-xl border border-hairline bg-white px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{extra.kind === 'image' ? 'รูปที่เพิ่ม' : 'ข้อความที่เพิ่ม'}</p>
                  <p className="text-[11px] text-subtle">{originLabel(extra)}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-700 hover:underline"
                  onClick={() => onChange(extras.filter((item) => item.id !== extra.id))}
                >
                  ลบ
                </button>
              </div>
              {extra.kind === 'text' && (
                <textarea
                  className="field mt-2 min-h-16 w-full resize-y text-sm"
                  value={extra.text ?? ''}
                  onChange={(event) => onChange(extras.map((item) => (
                    item.id === extra.id ? { ...item, text: event.target.value } : item
                  )))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
