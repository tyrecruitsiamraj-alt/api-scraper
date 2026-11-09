'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** กล่องเด้งบอกเหตุจาก server action (?notice=...) · กดตกลงแล้วเอา notice ออกจากลิงก์ รีเฟรชแล้วไม่เด้งซ้ำ */
export function NoticeDialog({ title, notice }: { title: string; notice: string }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const close = (next: boolean) => {
    if (next) return;
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('notice');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{notice}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>ตกลง</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
