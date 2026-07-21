'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '@/components/Logo';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/orchestrator');
  }, [status, router]);

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-10 flex justify-center">
          <Logo className="text-2xl" />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-semibold mb-1">ยินดีต้อนรับ</h1>
          <p className="text-sm text-subtle mb-7">เข้าสู่ระบบด้วยบัญชีองค์กรของคุณ</p>
          <button
            onClick={() => signIn('azure-ad', { callbackUrl: '/orchestrator' })}
            disabled={status === 'loading'}
            className="btn-primary w-full"
          >
            เข้าสู่ระบบด้วย Microsoft
          </button>
          <p className="mt-6 text-xs text-subtle">
            เฉพาะผู้ใช้ที่ได้รับสิทธิ์ในองค์กรเท่านั้น
          </p>
        </div>
      </div>
    </main>
  );
}
