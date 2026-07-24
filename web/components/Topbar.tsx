'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

// เมนูย้ายไปเป็น drawer ด้านข้าง (hamburger) — รวมตั้งค่าเข้ามาในลิสต์เดียว
const NAV: { href: string; label: string; also?: string[] }[] = [
  { href: '/orchestrator', label: 'ศูนย์งาน' },
  { href: '/scraping', label: 'งาน Scraping', also: ['/candidates'] },
  { href: '/autopost', label: 'โพสต์ & ผลลัพธ์' },
  { href: '/settings', label: 'ตั้งค่า', also: ['/connectors'] },
];

/** active tab: exact หรือ prefix (ครอบหน้าย่อย) */
function isActive(pathname: string, item: { href: string; also?: string[] }): boolean {
  const hrefs = [item.href, ...(item.also ?? [])];
  return hrefs.some((h) => pathname === h || pathname.startsWith(h + '/'));
}

export function Topbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // เปลี่ยนหน้า = ปิด drawer
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // เปิดอยู่: ปิดด้วย Escape + ล็อกไม่ให้ body เลื่อน
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const user = session?.user;
  const label = user?.name || user?.email || 'ผู้ใช้';
  const initials = label
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header className="glass-dark sticky top-0 z-30 border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          {/* hamburger + brand */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="เปิดเมนู"
              aria-expanded={open}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <Image src="/logo-SO.webp" alt="SO — SIAMRAJATHANEE" width={32} height={32} className="h-8 w-auto shrink-0" priority />
          </div>

          {/* user chip (info) */}
          <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 py-1 pl-1 pr-1.5 sm:pr-3">
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={label} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{initials}</div>
            )}
            <div className="hidden max-w-[160px] leading-tight sm:block">
              <div className="truncate text-[12.5px] font-medium text-white">{label}</div>
              {user?.email && <div className="truncate text-[10.5px] text-white/50">{user.email}</div>}
            </div>
          </div>
        </div>
      </header>

      {/* backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* drawer ด้านข้าง */}
      <aside
        aria-hidden={!open}
        className={`fixed left-0 top-0 z-50 flex h-full w-72 max-w-[82vw] flex-col border-r border-white/10 bg-[#181410] shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <Image src="/logo-SO.webp" alt="SO" width={32} height={32} className="h-8 w-auto" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิดเมนู"
            className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-xl px-4 py-2.5 text-sm font-medium tracking-[-0.01em] transition-all duration-200 ${
                  active ? 'bg-accent text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2">
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={label} referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{initials}</div>
            )}
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-medium text-white">{label}</div>
              {user?.email && <div className="truncate text-[10.5px] text-white/50">{user.email}</div>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>
    </>
  );
}
