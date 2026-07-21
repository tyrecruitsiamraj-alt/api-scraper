'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

// เมนูแบนแถวเดียว — เลิก "โหมด" ที่ทำให้กระโดดไปมา. ศูนย์งานคือศูนย์กลาง.
// คลังผู้สมัคร ย้ายไปเป็นแท็บย่อยใต้ "งาน Scraping" (ScrapingNav)
const NAV: { href: string; label: string; also?: string[] }[] = [
  { href: '/orchestrator', label: 'ศูนย์งาน' },
  { href: '/scraping', label: 'งาน Scraping', also: ['/candidates'] },
  { href: '/autopost', label: 'โพสต์ & ผลลัพธ์' },
];

/** active tab: exact หรือ prefix (ครอบหน้าย่อย เช่น /orchestrator/[id], /candidates ใต้ Scraping) */
function isActive(pathname: string, item: { href: string; also?: string[] }): boolean {
  const hrefs = [item.href, ...(item.also ?? [])];
  return hrefs.some((h) => pathname === h || pathname.startsWith(h + '/'));
}

function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto">
      {NAV.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-all duration-200 ${
              active ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Topbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

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
    <header className="glass-dark sticky top-0 z-30 border-b border-white/10">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* brand */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Image src="/logo-SO.webp" alt="SO — SIAMRAJATHANEE" width={32} height={32} className="h-8 w-auto shrink-0" priority />
        </div>

        {/* nav (center) */}
        <div className="hidden flex-1 justify-center md:flex">
          <NavTabs />
        </div>

        {/* right */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/settings"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-medium tracking-[-0.01em] transition-all duration-200 ${
              pathname.startsWith('/settings')
                ? 'border-accent bg-accent text-white'
                : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span aria-hidden>⚙</span>
            <span className="hidden lg:inline">ตั้งค่า</span>
          </Link>
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

          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            ออก
          </button>
        </div>
      </div>

      {/* nav (mobile) */}
      <div className="border-t border-white/10 px-3 py-1.5 md:hidden">
        <NavTabs />
      </div>
    </header>
  );
}
