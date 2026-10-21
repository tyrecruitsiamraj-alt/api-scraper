'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';

// ตัวแก้รูปใช้ API ของเบราว์เซอร์ — โหลดเฉพาะฝั่ง client (Next 15 ต้องประกาศ ssr:false ใน client component)
export const ContentReviewWorkspace = dynamic(
  () => import('@/components/ContentReviewWorkspace').then((mod) => mod.ContentReviewWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
        <Spinner />
        กำลังเปิดตัวแก้รูป
      </div>
    ),
  },
);
