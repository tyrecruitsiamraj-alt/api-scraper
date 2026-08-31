import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Topbar } from '@/components/Topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side guard in addition to middleware (defence in depth).
  const session = await getServerSession(authOptions);
  if (!session) redirect('/');

  return (
    <div className="min-h-screen bg-white lg:pl-[190px]">
      <Topbar />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-7">
        <div className="animate-fadeUp">{children}</div>
      </main>
    </div>
  );
}
