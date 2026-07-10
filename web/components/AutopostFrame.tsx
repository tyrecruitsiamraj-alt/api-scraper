'use client';

import { useState } from 'react';

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
    <div className="space-y-3">
      {subTabs && subTabs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {subTabs.map((s) => (
            <button
              key={s.tab}
              type="button"
              onClick={() => setActive(s.tab)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                active === s.tab ? 'bg-accent text-white' : 'text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <iframe
        key={active}
        src={src}
        title={`autopost-${active}`}
        className="w-full rounded-xl border border-line bg-white"
        style={{ height }}
      />
    </div>
  );
}
