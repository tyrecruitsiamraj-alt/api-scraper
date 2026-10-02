'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * รีเฟรช server component ทุก N วินาที — แต่หยุดชั่วคราวตอนผู้ใช้กำลังกรอก/เปิดแผง
 * เพื่อไม่ให้ฟอร์มบนศูนย์งานถูกรีเซ็ตกลางคัน
 */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const interacting = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
      if (el.closest('details[open]')) return true;
      if (el.closest('[data-pause-refresh="1"]')) return true;
      return false;
    };

    const t = setInterval(() => {
      if (interacting()) return;
      router.refresh();
    }, Math.max(3, seconds) * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
