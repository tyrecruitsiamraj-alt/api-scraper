import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runIncompleteCandidateRepair } from '@/lib/repair-incomplete-candidates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request, session: unknown): boolean {
  if (session) return true;
  const token = process.env.REPAIR_TOKEN?.trim();
  if (!token) return false;
  const header = req.headers.get('authorization') || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return Boolean(bearer && bearer === token);
}

/**
 * Repair incomplete candidate rows from stored raw_text.
 * Auth: signed-in desk session, or Authorization: Bearer $REPAIR_TOKEN.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!authorized(req, session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { dryRun?: boolean; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const dryRun = Boolean(body.dryRun);
  const limit = Number.isFinite(body.limit) ? Number(body.limit) : 2000;

  try {
    const result = await runIncompleteCandidateRepair({ dryRun, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
