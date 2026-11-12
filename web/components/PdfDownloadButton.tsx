'use client';

import { ChevronDownIcon, DownloadIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type PdfTemplateOption = { id: string; name: string; isDefault: boolean };

/**
 * ปุ่มดาวน์โหลด PDF เรซูเม่ — มีแบบฟอร์มแบบเดียว = ปุ่มธรรมดา · หลายแบบ = กดแล้วเลือกแบบ (แบบเริ่มต้นอยู่บนสุด)
 * href = ที่อยู่ไฟล์ (ต่อท้าย ?template=<id>)
 */
export function PdfDownloadButton({
  href,
  label = 'ดาวน์โหลด PDF',
  templates,
  disabled = false,
  variant = 'default',
}: {
  href: string;
  label?: string;
  templates: PdfTemplateOption[];
  disabled?: boolean;
  variant?: 'default' | 'outline';
}) {
  const url = (id: string) => `${href}${href.includes('?') ? '&' : '?'}template=${encodeURIComponent(id)}`;
  if (disabled) {
    return (
      <Button variant={variant} disabled>
        <DownloadIcon data-icon="inline-start" />
        {label}
      </Button>
    );
  }
  if (templates.length <= 1) {
    return (
      <Button variant={variant} asChild>
        <a href={templates[0] ? url(templates[0].id) : href}>
          <DownloadIcon data-icon="inline-start" />
          {label}
        </a>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant}>
          <DownloadIcon data-icon="inline-start" />
          {label}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>เลือกแบบฟอร์ม</DropdownMenuLabel>
        <DropdownMenuGroup>
          {templates.map((t) => (
            <DropdownMenuItem key={t.id} asChild>
              <a href={url(t.id)}>
                {t.name}
                {t.isDefault && <Badge variant="secondary" className="ml-auto">เริ่มต้น</Badge>}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
