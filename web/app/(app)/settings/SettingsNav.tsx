'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/settings/connectors', label: 'บัญชีเชื่อมต่อ', detail: 'บัญชี Scraping และ Facebook' },
  { href: '/settings/posting', label: 'กลุ่มโพสต์', detail: 'เลือกกลุ่มให้บัญชี และคลังกลุ่ม' },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-3 sm:grid-cols-2" aria-label="เมนูตั้งค่า">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-2xl border px-4 py-3 transition ${
              active
                ? 'border-accent bg-accent text-white shadow-sm'
                : 'border-line bg-white text-ink hover:border-accent/40 hover:bg-accent/[0.03]'
            }`}
          >
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className={`mt-0.5 block text-xs ${active ? 'text-white/75' : 'text-subtle'}`}>{item.detail}</span>
          </Link>
        );
      })}
    </nav>
  );
}
