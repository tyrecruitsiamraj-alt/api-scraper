'use client';

import { PointerEvent, useRef, useState } from 'react';
import type { PosterFields } from '@/lib/repo';
import type { PosterExtra } from '../../src/core/poster-template.js';
import type { PosterLayout } from '../../src/core/poster-template.js';
import {
  applyPosterFieldsDelta,
  buildPosterSvg,
  emptyPosterLayout,
  getPosterLayerBoxes,
  POSTER_CANVAS,
} from '../../src/core/poster-template.js';

type Props = {
  fields: PosterFields;
  sourceUrl: string | null;
  logoUrl?: string;
  enabled?: boolean;
  className?: string;
  onLayoutChange: (layout: PosterLayout) => void;
  onExtrasChange?: (extras: PosterExtra[]) => void;
};

export function PosterDragCanvas({
  fields,
  sourceUrl,
  logoUrl = '/logo-SO.webp',
  enabled = true,
  className = 'overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_rgba(11,42,85,0.18)]',
  onLayoutChange,
  onExtrasChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; fields: PosterFields } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const svg = buildPosterSvg(fields, sourceUrl, logoUrl);
  const layers = getPosterLayerBoxes(fields);

  const scale = () => {
    const box = rootRef.current?.getBoundingClientRect();
    return box && box.width > 0 ? POSTER_CANVAS / box.width : 1;
  };

  const onPointerDown = (id: string, event: PointerEvent<HTMLButtonElement>) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      fields: {
        ...fields,
        layout: fields.layout ?? emptyPosterLayout(),
        extras: fields.extras ?? [],
      },
    };
    setActiveId(id);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = applyPosterFieldsDelta(
      drag.fields,
      drag.id,
      (event.clientX - drag.startX) * scale(),
      (event.clientY - drag.startY) * scale(),
    );
    onLayoutChange(next.layout);
    onExtrasChange?.(next.extras);
  };

  const endDrag = () => {
    dragRef.current = null;
    setActiveId(null);
  };

  return (
    <div>
      <div
        ref={rootRef}
        className={`relative aspect-square touch-none select-none ${className}`}
        aria-label={`ตัวอย่างโปสเตอร์ ${fields.title}`}
      >
        <div
          className="pointer-events-none h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {enabled && layers.map((layer) => {
          const active = activeId === layer.id;
          const extra = String(layer.id).startsWith('extra:');
          return (
            <button
              key={layer.id}
              type="button"
              data-poster-handle={layer.id}
              aria-label={`ลาก${layer.label}`}
              className={`absolute rounded-md border-2 ${active ? 'z-30 border-[#0d5fb8] bg-[#0d5fb8]/15' : extra ? 'z-20 border-amber-300/90 hover:border-[#0d5fb8] hover:bg-[#0d5fb8]/10' : 'z-10 border-white/80 hover:border-[#0d5fb8] hover:bg-[#0d5fb8]/10'}`}
              style={{
                left: `${(layer.x / POSTER_CANVAS) * 100}%`,
                top: `${(layer.y / POSTER_CANVAS) * 100}%`,
                width: `${(layer.w / POSTER_CANVAS) * 100}%`,
                height: `${(layer.h / POSTER_CANVAS) * 100}%`,
                cursor: active ? 'grabbing' : 'grab',
              }}
              onPointerDown={(event) => onPointerDown(layer.id, event)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className={`pointer-events-none absolute left-1 top-1 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm ${active ? 'bg-[#0d5fb8] text-white' : extra ? 'bg-amber-700 text-white' : 'bg-black/60 text-white'}`}>
                {layer.label}
              </span>
            </button>
          );
        })}
      </div>
      {enabled && (
        <p className="mt-3 text-xs leading-5 text-subtle">ลากรูปหรือข้อความไปวางตำแหน่งใหม่ · เพิ่มรูปหรือข้อความบนโปสเตอร์ชุดนี้ได้ · บันทึกแล้วตำแหน่งนี้จะติดไปกับรูปโพสต์ · ภาพต้นฉบับไม่ถูกสลับ</p>
      )}
    </div>
  );
}
