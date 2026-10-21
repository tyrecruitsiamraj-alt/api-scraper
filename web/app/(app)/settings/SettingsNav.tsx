'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ITEMS = [
  { href: '/settings/connectors', label: 'บัญชีที่ใช้งาน', detail: 'JobBKK, JobThai และ Facebook' },
  { href: '/settings/posting', label: 'กลุ่มโพสต์', detail: 'เลือกกลุ่มให้บัญชี และคลังกลุ่ม' },
  { href: '/settings/trends', label: 'กระแสที่น่าสนใจ', detail: 'หัวข้อหรือมุกที่อยากให้ประกาศนำไปใช้' },
];

export function SettingsNav() {
  const pathname = usePathname();
  const active = ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href ?? '';

  return (
    <Tabs value={active}>
      <TabsList aria-label="เมนูตั้งค่า">
        {ITEMS.map((item) => (
          <TabsTrigger key={item.href} value={item.href} asChild>
            <Link href={item.href} title={item.detail}>{item.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
