'use client';

import { useState } from 'react';

export function CaptionViewer({ caption }: { caption: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = caption?.trim() || '—';
  const needsToggle = text.length > 180 || text.split('\n').length > 5;

  return (
    <div>
      <div className="relative rounded-lg border border-hairline bg-black/[0.02] p-3 text-sm">
        <div className={`whitespace-pre-line ${!expanded && needsToggle ? 'max-h-28 overflow-hidden' : ''}`}>
          {text}
        </div>
        {!expanded && needsToggle && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-lg bg-gradient-to-t from-white via-white/90 to-transparent" />
        )}
      </div>
      {needsToggle && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? 'ซ่อน Caption' : 'ดู Caption ทั้งหมด'}
          <span aria-hidden="true">{expanded ? '↑' : '↓'}</span>
        </button>
      )}
    </div>
  );
}
