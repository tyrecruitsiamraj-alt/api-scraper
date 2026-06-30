'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

const NAV = [
  { href: '/dashboard', label: 'ภาพรวม' },
  { href: '/candidates', label: 'ผู้สมัคร' },
  { href: '/scraping', label: 'งาน Scraping' },
  { href: '/connectors', label: 'Connector' },
];

function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              active ? 'bg-accent text-white' : 'text-muted hover:bg-canvas hover:text-ink'
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
    <header className="glass sticky top-0 z-30 border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* brand */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Image src="/logo-SO.webp" alt="SO — SIAMRAJATHANEE" width={32} height={32} className="h-8 w-auto shrink-0" priority />
          <div className="hidden h-7 w-px bg-line sm:block" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-semibold tracking-tight">So Recruit</div>
            <div className="hidden truncate text-[11px] text-muted sm:block">ระบบสรรหากำลังคน</div>
          </div>
        </div>

        {/* nav (center) */}
        <div className="hidden flex-1 justify-center md:flex">
          <NavTabs />
        </div>

        {/* right */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 rounded-full border border-line bg-white/70 py-1 pl-1 pr-1.5 sm:pr-3">
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={label} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{initials}</div>
            )}
            <div className="hidden max-w-[160px] leading-tight sm:block">
              <div className="truncate text-[12.5px] font-medium">{label}</div>
              {user?.email && <div className="truncate text-[10.5px] text-muted">{user.email}</div>}
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="rounded-full border border-line bg-white/70 px-3 py-2 text-[12.5px] font-medium text-muted transition hover:bg-white hover:text-bad"
          >
            ออก
          </button>
        </div>
      </div>

      {/* nav (mobile) */}
      <div className="border-t border-line/70 px-3 py-1.5 md:hidden">
        <NavTabs />
      </div>
    </header>
  );
}
