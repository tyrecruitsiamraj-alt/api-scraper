'use client';

import { useState } from 'react';
import { runPreflightForPostJobAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** ปุ่มสั่งทดสอบบัญชีแบบไม่โพสต์ ให้งานโพสต์ที่ค้างรอการทดสอบ */
export function PreflightButton({ queueId }: { queueId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        setError('');
        try {
          await runPreflightForPostJobAction(fd);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'สั่งทดสอบไม่สำเร็จ');
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="queueId" value={queueId} />
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting && <Spinner data-icon="inline-start" />}
        ทดสอบแบบไม่โพสต์จริง
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </form>
  );
}
