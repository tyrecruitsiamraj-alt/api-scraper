'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboardIcon, LogOutIcon, MegaphoneIcon, MenuIcon, SearchIcon, SettingsIcon, UsersIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

type NavItem = { href: string; label: string; also?: string[] };

// เมนูบนมือถือ (เปิดจากปุ่มเมนูด้านซ้าย) ใช้ลิสต์เดียวกับ Desktop
// แยกงาน Scrap กับงานโพสต์ ส่วนศูนย์งานเป็นหน้าสรุปของทั้งสองฝั่ง
const DESKTOP_NAV: (NavItem & { icon: LucideIcon })[] = [
  { href: '/orchestrator', label: 'ศูนย์งาน', icon: LayoutDashboardIcon, also: ['/workflow', '/dashboard'] },
  { href: '/scraping', label: 'งาน Scrap', icon: SearchIcon },
  { href: '/autopost/jobs', label: 'งานโพสต์', icon: MegaphoneIcon, also: ['/autopost'] },
  { href: '/candidates', label: 'คลังผู้สมัคร', icon: UsersIcon },
  { href: '/settings', label: 'ตั้งค่า', icon: SettingsIcon, also: ['/connectors'] },
];
const NAV: NavItem[] = DESKTOP_NAV;

/** active tab: exact หรือ prefix (ครอบหน้าย่อย) */
function isActive(pathname: string, item: NavItem): boolean {
  const hrefs = [item.href, ...(item.also ?? [])];
  return hrefs.some((h) => pathname === h || pathname.startsWith(h + '/'));
}

function UserAvatar({ image, label, initials }: { image?: string | null; label: string; initials: string }) {
  return (
    <Avatar>
      {image && <AvatarImage src={image} alt={label} referrerPolicy="no-referrer" />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

export function Topbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // เปลี่ยนหน้า = ปิดเมนู
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
      {/* Desktop: แถบเมนูด้านซ้ายแสดงตลอด */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[190px] flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <Image src="/logo-SO.webp" alt="SO SIAMRAJATHANEE" width={32} height={32} className="h-8 w-auto shrink-0" priority />
          <span className="text-sm font-semibold">SO PEOPLE</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-1">
          {DESKTOP_NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Button
                key={item.href}
                asChild
                variant={active ? 'secondary' : 'ghost'}
                size="lg"
                className="justify-start"
              >
                <Link href={item.href} aria-current={active ? 'page' : undefined}>
                  <Icon data-icon="inline-start" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>
        <Separator />
        <div className="flex items-center gap-2.5 p-3">
          <UserAvatar image={user?.image} label={label} initials={initials} />
          <div className="min-w-0 leading-snug">
            <div className="truncate text-xs font-medium">SO Recruiter</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email || label}</div>
          </div>
        </div>
      </aside>

      {/* มือถือ / แท็บเล็ต */}
      <header className="sticky top-0 z-30 border-b bg-background lg:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="เปิดเมนู">
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 max-w-[82vw] gap-0">
                <SheetHeader className="border-b">
                  <SheetTitle className="flex items-center gap-2.5">
                    <Image src="/logo-SO.webp" alt="" width={32} height={32} className="h-7 w-auto" />
                    เมนู
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                  {NAV.map((item) => {
                    const active = isActive(pathname, item);
                    return (
                      <Button
                        key={item.href}
                        asChild
                        variant={active ? 'secondary' : 'ghost'}
                        size="lg"
                        className="justify-start"
                      >
                        <Link href={item.href} aria-current={active ? 'page' : undefined}>
                          {item.label}
                        </Link>
                      </Button>
                    );
                  })}
                </nav>
                <SheetFooter className="border-t">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar image={user?.image} label={label} initials={initials} />
                    <div className="min-w-0 leading-snug">
                      <div className="truncate text-sm font-medium">{label}</div>
                      {user?.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => signOut({ callbackUrl: '/' })}>
                    <LogOutIcon data-icon="inline-start" />
                    ออกจากระบบ
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            <Image src="/logo-SO.webp" alt="SO SIAMRAJATHANEE" width={32} height={32} className="h-8 w-auto shrink-0" priority />
          </div>

          <div className="flex items-center gap-2.5">
            <UserAvatar image={user?.image} label={label} initials={initials} />
            <div className="hidden max-w-[160px] leading-snug sm:block">
              <div className="truncate text-sm font-medium">{label}</div>
              {user?.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
