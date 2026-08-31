import dotenv from 'dotenv';
import pg from 'pg';
import { evaluateResumeQualification } from '../src/core/resume-qualification.js';

dotenv.config({ path: new URL('../web/.env', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (v) => v.slice(1)) });

const client = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  options: '-c search_path="so-candidate-data",public',
  max: 1,
});

try {
  const { rows } = await client.query(`
    SELECT t.id, t.name,
           count(tc.candidate_id)::int AS total,
           count(*) FILTER (WHERE tc.qualification_status='qualified')::int AS qualified,
           count(*) FILTER (WHERE tc.qualification_status='needs_review')::int AS needs_review,
           count(*) FILTER (WHERE tc.qualification_status='rejected')::int AS rejected,
           count(*) FILTER (WHERE tc.qualification_score IS NOT NULL
             AND (COALESCE(jsonb_array_length(tc.qualification_evidence->'passed'),0)
                + COALESCE(jsonb_array_length(tc.qualification_evidence->'missing'),0)
                + COALESCE(jsonb_array_length(tc.qualification_reasons),0)) > 0)::int AS scored
      FROM scrape_tasks t
      JOIN scrape_task_candidates tc ON tc.task_id=t.id
     GROUP BY t.id
     ORDER BY max(tc.last_matched_at) DESC
  `);
  const firstTaskId = rows[0]?.id;
  const detail = firstTaskId ? await client.query(`
    SELECT tc.qualification_status, tc.qualification_score,
           ((COALESCE(jsonb_array_length(tc.qualification_evidence->'passed'),0)
             + COALESCE(jsonb_array_length(tc.qualification_evidence->'missing'),0)
             + COALESCE(jsonb_array_length(tc.qualification_reasons),0)) > 0) AS assessment_ready
      FROM scrape_task_candidates tc
      JOIN candidates c ON c.id=tc.candidate_id
     WHERE tc.task_id=$1
     ORDER BY CASE tc.qualification_status WHEN 'qualified' THEN 0 WHEN 'needs_review' THEN 1 ELSE 2 END,
              CASE WHEN (COALESCE(jsonb_array_length(tc.qualification_evidence->'passed'),0)
                           + COALESCE(jsonb_array_length(tc.qualification_evidence->'missing'),0)
                           + COALESCE(jsonb_array_length(tc.qualification_reasons),0)) > 0
                   THEN tc.qualification_score END DESC NULLS LAST,
              tc.last_matched_at DESC
  `, [firstTaskId]) : { rows: [] };
  let rescoredPreview = [];
  if (firstTaskId) {
    const taskResult = await client.query('SELECT criteria, adjacent_plan FROM scrape_tasks WHERE id=$1', [firstTaskId]);
    const task = taskResult.rows[0] || {};
    const criteria = task.criteria || {};
    const plan = task.adjacent_plan || {};
    const sourcingSpec = { ...(plan.sourcing_spec || {}) };
    const directPosition = String(criteria.position || criteria.keyword || '').trim();
    if (!Array.isArray(sourcingSpec.accepted_positions) || sourcingSpec.accepted_positions.length === 0) {
      sourcingSpec.accepted_positions = directPosition ? [directPosition] : (Array.isArray(plan.positions) ? plan.positions : []);
    }
    const candidates = await client.query(`
      SELECT c.*, COALESCE(s.raw_text,'') AS raw_text
        FROM scrape_task_candidates tc
        JOIN candidates c ON c.id=tc.candidate_id
        LEFT JOIN candidate_sources s ON s.id=tc.candidate_source_id
       WHERE tc.task_id=$1
    `, [firstTaskId]);
    rescoredPreview = candidates.rows.map((candidate) => evaluateResumeQualification(candidate, { criteria, sourcingSpec }).score).sort((a, b) => b - a);
  }
  console.log(JSON.stringify({
    groups: rows.length,
    rows: rows.slice(0, 10),
    first_group_order: detail.rows.slice(0, 10),
    rescored_preview: {
      count: rescoredPreview.length,
      highest: rescoredPreview.slice(0, 10),
      lowest: rescoredPreview.slice(-5),
      distinct_scores: [...new Set(rescoredPreview)].length,
    },
  }, null, 2));
} finally {
  await client.end();
}
