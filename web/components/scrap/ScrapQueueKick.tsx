'use client';

import { useEffect } from 'react';

/**
 * ถ้างานค้างอยู่ในคิว ให้ปลุกเครื่องค้นหาอีกครั้ง (กันกรณีปลุกครั้งแรกไม่ติด)
 * ย้ายมาจาก TaskList เดิมที่ poll /api/scrape-tasks แล้วเรียก /api/run-worker
 */
export function ScrapQueueKick({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const kick = () => {
      fetch('/api/run-worker', { method: 'POST' }).catch(() => {});
    };
    const first = setTimeout(kick, 6000);
    const repeat = setInterval(kick, 20000);
    return () => {
      clearTimeout(first);
      clearInterval(repeat);
    };
  }, [active]);
  return null;
}
