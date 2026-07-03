import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { kickWorker } from '@/lib/worker-kick';

export const dynamic = 'force-dynamic';

/** Fallback kick when a task stays queued — called from the live status UI. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  kickWorker();
  return NextResponse.json({ ok: true });
}
