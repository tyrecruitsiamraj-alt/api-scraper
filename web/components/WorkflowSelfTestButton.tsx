'use client';

import { useFormStatus } from 'react-dom';

export function WorkflowSelfTestButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-secondary btn-sm" disabled={pending} aria-disabled={pending}>
      {pending ? 'กำลังทดสอบ…' : 'ทดสอบระบบแบบไม่โพสต์จริง'}
    </button>
  );
}
