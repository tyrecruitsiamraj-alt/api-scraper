'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import type { ReactNode } from 'react';

/**
 * Client-side SessionProvider. We pass the server-resolved session in per
 * request (never a module-global) so sessions can't bleed between users.
 */
export function Providers({ children, session }: { children: ReactNode; session: Session | null }) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
