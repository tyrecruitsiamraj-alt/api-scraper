'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/orchestrator');
  }, [status, router]);

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex justify-center">
          <Logo className="text-2xl" />
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>เข้าสู่ระบบ</CardTitle>
            <CardDescription>ใช้บัญชี Microsoft ขององค์กร</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => signIn('azure-ad', { callbackUrl: '/orchestrator' })}
              disabled={status === 'loading'}
              className="w-full"
            >
              เข้าสู่ระบบด้วย Microsoft
            </Button>
          </CardContent>
          <CardFooter className="justify-center text-xs text-muted-foreground">
            ใช้ได้เฉพาะผู้ใช้ที่องค์กรให้สิทธิ์
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
