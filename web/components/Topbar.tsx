'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

type Mode = 'scraping' | 'autopost' | 'orchestrator';

const NAV: Record<Mode, { href: string; label: string }[]> = {
  scraping: [
    { href: '/dashboard', label: 'ภาพรวม' },
    { href: '/candidates', label: 'ผู้สมัคร' },
    { href: '/scraping', label: 'งาน Scraping' },
  ],
  autopost: [
    { href: '/autopost', label: 'ภาพรวม' },
    { href: '/autopost/runs', label: 'รอบโพสต์' },
    { href: '/autopost/collect', label: 'เก็บคอมเมนต์' },
    { href: '/autopost/reports', label: 'รายงาน' },
  ],
  orchestrator: [
    { href: '/orchestrator', label: 'กระดานงาน' },
    { href: '/orchestrator/imports', label: 'คำขอ So Recruit' },
  ],
};

/** ทุกหน้าแยกโหมดชัดเจน: /autopost/* = Auto-Post, /orchestrator/* = Content, ที่เหลือ = Scraping */
function modeOf(pathname: string): Mode {
  if (pathname.startsWith('/autopost')) return 'autopost';
  if (pathname.startsWith('/orchestrator')) return 'orchestrator';
  return 'scraping';
}

/** active tab: match แบบ exact กับ prefix (แต่ /autopost ต้อง exact ไม่งั้นชนทุกหน้า /autopost/*) */
function isActive(pathname: string, href: string): boolean {
  if (href === '/autopost') return pathname === '/autopost';
  return pathname === href || pathname.startsWith(href + '/');
}

function ModeSwitch({ mode, onSwitch }: { mode: Mode; onSwitch: (m: Mode) => void }) {
  return (
    <div className="flex shrink-0 items-center rounded-full border border-line bg-white/70 p-0.5">
      {(['scraping', 'autopost', 'orchestrator'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onSwitch(m)}
          className={`whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium transition ${
            mode === m ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {m === 'scraping' ? 'Scraping' : m === 'autopost' ? 'Auto-Post' : 'Content'}
        </button>
      ))}
    </div>
  );
}

function NavTabs({ mode }: { mode: Mode }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto">
      {NAV[mode].map((item) => {
        const active = isActive(pathname, item.href);
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
  const pathname = usePathname();
  const router = useRouter();
  const mode = modeOf(pathname);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    router.push(m === 'autopost' ? '/autopost' : m === 'orchestrator' ? '/orchestrator' : '/dashboard');
  };

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
        {/* brand + mode switch */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <Image src="/logo-SO.webp" alt="SO — SIAMRAJATHANEE" width={32} height={32} className="h-8 w-auto shrink-0" priority />
          <div className="hidden h-7 w-px bg-line sm:block" />
          <ModeSwitch mode={mode} onSwitch={switchMode} />
        </div>

        {/* nav (center) */}
        <div className="hidden flex-1 justify-center md:flex">
          <NavTabs mode={mode} />
        </div>

        {/* right */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/settings"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-medium transition ${
              pathname.startsWith('/settings')
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-white/70 text-muted hover:bg-white hover:text-ink'
            }`}
          >
            <span aria-hidden>⚙</span>
            <span className="hidden lg:inline">ตั้งค่า</span>
          </Link>
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
        <NavTabs mode={mode} />
      </div>
    </header>
  );
}
