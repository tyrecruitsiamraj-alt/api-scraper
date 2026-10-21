'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * ฝังหน้าจอ AUTO-POST ทีละ tab ในคอนโซล (แทน tab "Auto-Post" ก้อนเดียวเดิม).
 * autopost รองรับ ?embed=1 (ซ่อน sidebar/หัว) + ?tab=<x> (เปิด tab นั้น) + ?access_token (ผ่านประตู).
 * subTabs: ปุ่มย่อย native เปลี่ยน tab ในหน้าเดียว (เช่น หน้า "ตั้งค่าโพสต์" รวม groups/templates/…)
 */
export function AutopostFrame({
  baseUrl,
  token,
  tab,
  subTabs,
  height = 'calc(100vh - 13rem)',
}: {
  baseUrl: string;
  token: string;
  tab: string;
  subTabs?: { tab: string; label: string }[];
  height?: string;
}) {
  const [active, setActive] = useState(tab);
  const src = `${baseUrl}?embed=1&tab=${encodeURIComponent(active)}${
    token ? `&access_token=${encodeURIComponent(token)}` : ''
  }`;

  return (
    <div className="flex flex-col gap-3">
      {subTabs && subTabs.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <Tabs value={active} onValueChange={setActive}>
            <TabsList>
              {subTabs.map((s) => (
                <TabsTrigger key={s.tab} value={s.tab}>
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
      <iframe
        key={active}
        src={src}
        title={`autopost-${active}`}
        className="w-full rounded-xl border bg-card"
        style={{ height }}
      />
    </div>
  );
}
