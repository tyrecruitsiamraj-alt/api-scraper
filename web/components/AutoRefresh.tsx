'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * รีเฟรชข้อมูล server component ทุก N วินาที (router.refresh — ไม่ reload ทั้งหน้า)
 * ใช้บนกระดานงาน orchestrator ให้การ์ด "กำลังคิด"/"คิวโพสต์" ขยับสถานะเองโดยไม่ต้องกด F5
 */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), Math.max(3, seconds) * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
