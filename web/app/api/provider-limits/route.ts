import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listProviderLimits, facebookQuotaSummary } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [limits, fb] = await Promise.all([listProviderLimits(), facebookQuotaSummary()]);
  return NextResponse.json({ limits, fb });
}
