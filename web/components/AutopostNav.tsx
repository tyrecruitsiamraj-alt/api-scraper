'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// แท็บย่อยใต้ "โพสต์ & ผลลัพธ์" — แยกงานที่กำลังทำ (ภาพรวม/คิว) ออกจากผลที่เก็บเกี่ยวได้ (leads)
const ITEMS = [
  { href: '/autopost', label: 'ภาพรวมการโพสต์', detail: 'งานที่รอ สถานะระบบ และจำนวนที่ยังโพสต์ได้' },
  { href: '/autopost/results', label: 'ผลลัพธ์และผู้สนใจ', detail: 'เบอร์ผู้สนใจที่เก็บได้ และโพสต์ที่ได้ผล' },
  { href: '/autopost/report', label: 'รายงานสัปดาห์', detail: 'สรุปผลรายสัปดาห์สำหรับส่งหัวหน้า' },
];

export function AutopostNav() {
  const pathname = usePathname();
  // exact match — /autopost ไม่ควร active เมื่ออยู่ /autopost/results
  const active =
    ITEMS.find(
      (item) =>
        pathname === item.href || (item.href !== '/autopost' && pathname.startsWith(`${item.href}/`)),
    )?.href ?? '';

  return (
    <nav aria-label="เมนูโพสต์และผลลัพธ์" className="max-w-full overflow-x-auto">
      <Tabs value={active} activationMode="manual">
        <TabsList>
          {ITEMS.map((item) => (
            <TabsTrigger key={item.href} value={item.href} asChild>
              <Link href={item.href} title={item.detail}>
                {item.label}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}
