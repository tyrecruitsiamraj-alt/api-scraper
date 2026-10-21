'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function CaptionViewer({ caption }: { caption: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = caption?.trim() || '—';
  const needsToggle = text.length > 180 || text.split('\n').length > 5;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="w-full rounded-lg border bg-muted/50 p-3 text-sm leading-relaxed">
        <div className={cn('whitespace-pre-line', !expanded && needsToggle && 'line-clamp-5')}>{text}</div>
      </div>
      {needsToggle && (
        <Button
          type="button"
          variant="link"
          size="xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="px-0"
        >
          {expanded ? 'ซ่อน Caption' : 'ดู Caption ทั้งหมด'}
          {expanded ? <ChevronUpIcon data-icon="inline-end" /> : <ChevronDownIcon data-icon="inline-end" />}
        </Button>
      )}
    </div>
  );
}
