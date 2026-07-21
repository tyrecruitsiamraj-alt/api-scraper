'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// แท็บย่อยใต้ "งาน Scraping" — คลังผู้สมัคร + สร้างงาน Scraping อยู่ใต้หัวข้อเดียวกัน
const ITEMS = [
  { href: '/candidates', label: 'คลังผู้สมัคร', detail: 'ค้นหา/กรองผู้สมัครที่ดึงมา' },
  { href: '/scraping', label: 'สร้างงาน Scraping', detail: 'ตั้งงานดึงข้อมูลใหม่ + ติดตามผล' },
];

export function ScrapingNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 grid gap-3 sm:grid-cols-2" aria-label="เมนูงาน Scraping">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border px-4 py-3 transition ${
              active
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-white text-ink hover:border-accent/40 hover:bg-accent/[0.03]'
            }`}
          >
            <span className="block text-sm font-medium">{item.label}</span>
            <span className={`mt-0.5 block text-[11px] uppercase tracking-[0.06em] ${active ? 'text-white/75' : 'text-subtle'}`}>{item.detail}</span>
          </Link>
        );
      })}
    </nav>
  );
}
