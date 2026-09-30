import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pool } from '@/lib/db';
import { runIncompleteCandidateRepair } from '@/lib/repair-incomplete-candidates';
import {
  finalizeCandidateRecord,
  hasUsefulWorkExperience,
} from '../../../../src/providers/jobbkk/parser.js';

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

  let body: { dryRun?: boolean; limit?: number; inspectWork?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.inspectWork) {
    const { rows } = await pool().query(
      `SELECT c.id, c.work_experience, left(s.raw_text, 1200) AS raw_preview
         FROM candidates c
         JOIN candidate_sources s ON s.candidate_id = c.id
        WHERE s.raw_text IS NOT NULL AND length(trim(s.raw_text)) > 40
          AND (
            COALESCE(jsonb_array_length(c.work_experience), 0) = 0
            OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(c.work_experience, '[]'::jsonb)) e
               WHERE NULLIF(trim(e->>'company'), '') IS NOT NULL
                  OR NULLIF(trim(e->>'position'), '') IS NOT NULL
            )
          )
          AND s.raw_text ~ 'ประวัติการทำงาน'
        ORDER BY c.last_updated_at DESC
        LIMIT 12`,
    );
    const samples = rows.map((row: any) => {
      const repaired = finalizeCandidateRecord({
        work_experience: Array.isArray(row.work_experience) ? row.work_experience : [],
        education: [],
        raw_text: row.raw_preview || '',
      });
      const workMatch = String(row.raw_preview || '').match(/ประวัติการทำงาน[\s\S]{0,400}/u);
      return {
        id: row.id,
        before: row.work_experience,
        after: repaired.work_experience,
        usefulAfter: hasUsefulWorkExperience(repaired.work_experience),
        workSnippet: workMatch?.[0] || '',
      };
    });
    return NextResponse.json({ ok: true, samples });
  }

  const dryRun = Boolean(body.dryRun);
  const limit = Number.isFinite(body.limit) ? Number(body.limit) : 200;

  try {
    const result = await runIncompleteCandidateRepair({ dryRun, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
