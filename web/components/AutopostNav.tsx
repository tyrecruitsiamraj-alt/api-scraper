'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// แท็บย่อยใต้ "โพสต์ & ผลลัพธ์" — แยกงานที่กำลังทำ (ภาพรวม/คิว) ออกจากผลที่เก็บเกี่ยวได้ (leads)
const ITEMS = [
  { href: '/autopost', label: 'ภาพรวมการโพสต์', detail: 'คิวโพสต์ · สถานะ worker · โควต้า' },
  { href: '/autopost/results', label: 'ผลลัพธ์ & Leads', detail: 'เบอร์ผู้สนใจที่เก็บได้ · โพสต์ที่ได้ผล' },
];

export function AutopostNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 grid gap-3 sm:grid-cols-2" aria-label="เมนูโพสต์ & ผลลัพธ์">
      {ITEMS.map((item) => {
        // exact match — /autopost ไม่ควร active เมื่ออยู่ /autopost/results
        const active =
          pathname === item.href ||
          (item.href !== '/autopost' && pathname.startsWith(`${item.href}/`));
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
