import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { taskStatuses } from '@/lib/repo';

export const dynamic = 'force-dynamic';

// Lightweight status feed for the live progress counters on /scraping.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rows = await taskStatuses();
  return NextResponse.json({ tasks: rows });
}
