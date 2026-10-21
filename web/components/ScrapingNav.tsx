'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// แท็บย่อยใต้ "งาน Scraping" — คลังผู้สมัคร + สร้างงาน Scraping อยู่ใต้หัวข้อเดียวกัน
const ITEMS = [
  { href: '/candidates', label: 'คลังผู้สมัคร', detail: 'ค้นหาและกรองผู้สมัครที่ดึงมา' },
  { href: '/candidates/jobs', label: 'ผู้สมัครตามใบงาน', detail: 'เปิดงานแล้วดูคนที่ตรงที่สุดก่อน' },
  { href: '/scraping', label: 'สร้างงานค้นหา', detail: 'กำหนดเงื่อนไขและติดตามผล' },
];

export function ScrapingNav() {
  const pathname = usePathname();
  const activeHref = ITEMS
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <Tabs value={activeHref ?? ''} className="mb-6">
      <TabsList variant="line" aria-label="เมนูค้นหาผู้สมัคร">
        {ITEMS.map((item) => (
          <TabsTrigger key={item.href} value={item.href} asChild>
            <Link href={item.href} title={item.detail}>
              {item.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
