'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

// เมนูแบนแถวเดียว — เลิก "โหมด" ที่ทำให้กระโดดไปมา. ศูนย์งานคือศูนย์กลาง.
const NAV: { href: string; label: string }[] = [
  { href: '/orchestrator', label: 'ศูนย์งาน' },
  { href: '/candidates', label: 'คลังผู้สมัคร' },
  { href: '/scraping', label: 'งาน Scraping' },
  { href: '/autopost', label: 'โพสต์ & ผลลัพธ์' },
];

/** active tab: exact หรือ prefix (ครอบหน้าย่อย เช่น /orchestrator/[id], /autopost/runs) */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] transition ${
              active ? 'bg-accent text-white' : 'text-white/55 hover:text-white'
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
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#181818]">
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
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
            className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/10 hover:text-white"
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
