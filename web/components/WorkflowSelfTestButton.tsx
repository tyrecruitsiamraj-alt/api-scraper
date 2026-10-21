'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export function WorkflowSelfTestButton() {
  const { pending } = useFormStatus();
  return (
    <Button variant="secondary" size="sm" disabled={pending} aria-disabled={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'กำลังทดสอบ…' : 'ทดสอบระบบแบบไม่โพสต์จริง'}
    </Button>
  );
}
