'use client';

import type { ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * ก้อนธุรกิจ (LBD / LBA / LM) บนหน้าตั้งค่า — ปิดไว้ตอนเปิดหน้า กดหัวการ์ดเพื่อกางดูรายการข้างใน
 * ก้อนว่างยังขึ้นพร้อมเลข 0 ไม่หาย · defaultOpen = กางไว้ตั้งแต่แรก (ใช้ตอนค้นหา: 9 พ.ย. 2569 ค้นเจอ 1 กลุ่มแต่ซ่อนในก้อนที่พับ เจ้าของหาไม่เจอ)
 */
export function BusinessUnitSection({
  code,
  detail,
  count,
  unit,
  defaultOpen = false,
  children,
}: {
  /** null = ก้อน "ยังไม่ได้เลือกธุรกิจ" */
  code: string | null;
  detail: string;
  count: number;
  /** หน่วยของสิ่งที่นับ เช่น "บัญชี" "กลุ่ม" */
  unit: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const title = code ?? 'ยังไม่ได้เลือกธุรกิจ';
  return (
    <Collapsible asChild defaultOpen={defaultOpen}>
      <Card size="sm" className="gap-0 py-0">
        <CollapsibleTrigger asChild>
          <CardHeader
            role="button"
            tabIndex={0}
            aria-label={`${title} ${count} ${unit} กดเพื่อเปิดดู`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }}
            className="group/bu cursor-pointer rounded-xl py-3 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <CardTitle className="flex items-center gap-2 text-base">
              {title}
              <Badge variant="secondary" className="tabular-nums">
                {count} {unit}
              </Badge>
            </CardTitle>
            {code && <CardDescription>{detail}</CardDescription>}
            <CardAction className="self-center">
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]/bu:rotate-180" />
            </CardAction>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t">{children}</CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
