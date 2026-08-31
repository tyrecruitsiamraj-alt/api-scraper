import dotenv from 'dotenv';
import pg from 'pg';
import { evaluateResumeQualification } from '../src/core/resume-qualification.js';

dotenv.config({ path: new URL('../web/.env', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)) });

const db = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  options: '-c search_path="so-candidate-data",public',
  max: 1,
});

const client = await db.connect();
const summary = [];
try {
  const { rows: tasks } = await client.query(`
    SELECT t.id, t.name, t.criteria, t.adjacent_plan, t.target_count
      FROM scrape_tasks t
     WHERE EXISTS (SELECT 1 FROM scrape_task_candidates tc WHERE tc.task_id=t.id)
     ORDER BY t.created_at
  `);
  await client.query('BEGIN');
  for (const task of tasks) {
    const criteria = task.criteria || {};
    const plan = task.adjacent_plan || {};
    const sourcingSpec = { ...(plan.sourcing_spec || {}) };
    const directPosition = String(criteria.position || criteria.keyword || '').trim();
    const plannedPositions = Array.isArray(plan.positions) ? plan.positions.map(String).filter(Boolean) : [];
    if (!Array.isArray(sourcingSpec.accepted_positions) || sourcingSpec.accepted_positions.length === 0) {
      sourcingSpec.accepted_positions = directPosition ? [directPosition] : plannedPositions;
    }
    sourcingSpec.scorecard_version = 'candidate-fit-v1';

    const { rows: candidates } = await client.query(`
      SELECT c.*, tc.candidate_id,
             COALESCE(s.raw_text,'') AS source_raw_text,
             COALESCE((SELECT string_agg(a.extracted_text,' ')
                        FROM candidate_assets a
                       WHERE a.candidate_id=c.id AND a.extracted_text IS NOT NULL),'') AS attachment_text
        FROM scrape_task_candidates tc
        JOIN candidates c ON c.id=tc.candidate_id
        LEFT JOIN candidate_sources s ON s.id=tc.candidate_source_id
       WHERE tc.task_id=$1
    `, [task.id]);

    const counts = { qualified: 0, needs_review: 0, rejected: 0 };
    const scoreSet = new Set();
    for (const candidate of candidates) {
      const assessment = evaluateResumeQualification({
        ...candidate,
        raw_text: [candidate.source_raw_text, candidate.attachment_text].filter(Boolean).join(' '),
      }, { criteria, sourcingSpec });
      counts[assessment.status] += 1;
      scoreSet.add(assessment.score);
      await client.query(`
        UPDATE scrape_task_candidates
           SET qualification_status=$3, qualification_reasons=$4::jsonb,
               qualification_score=$5, qualification_evidence=$6::jsonb, evaluated_at=now()
         WHERE task_id=$1 AND candidate_id=$2
      `, [task.id, candidate.candidate_id, assessment.status, JSON.stringify(assessment.reasons), assessment.score, JSON.stringify(assessment.evidence)]);
    }

    await client.query(`
      UPDATE scrape_tasks SET
        progress_got=$2,
        status=CASE WHEN status IN ('done','partial') THEN CASE WHEN $2 >= COALESCE(target_count,0) THEN 'done' ELSE 'partial' END ELSE status END,
        phase=CASE WHEN phase IN ('done','partial') THEN CASE WHEN $2 >= COALESCE(target_count,0) THEN 'done' ELSE 'partial' END ELSE phase END,
        updated_at=now()
      WHERE id=$1
    `, [task.id, counts.qualified]);
    summary.push({ task_id: task.id, candidates: candidates.length, ...counts, distinct_scores: scoreSet.size });
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ scorecard: 'candidate-fit-v1', tasks: summary.length, summary }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await db.end();
}
