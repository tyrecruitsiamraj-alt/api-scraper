/* eslint-disable no-console */
require('dotenv').config();
const db = require('../server/db');

async function main() {
  // Clean only synthetic leftovers from an interrupted verification.
  await db.query(
    `DELETE FROM post_logs
      WHERE run_id IN ('audit-run','audit-run-2')
        AND poster_name='audit'
        AND job_title='audit'
        AND group_id='audit'`,
  );
  const key = `audit-${Date.now()}`;
  const evidenceRunId = `audit-evidence-${Date.now()}`;
  const queueId = `audit-queue-${Date.now()}`;
  try {
    const base = {
      run_id: 'audit-run',
      idempotency_key: key,
      poster_name: 'audit',
      job_title: 'audit',
      group_id: 'audit',
      content_fingerprint: 'audit',
    };
    const first = await db.reservePostAttempt(base);
    const second = await db.reservePostAttempt({ ...base, run_id: 'audit-run-2' });
    await db.updatePostAttemptState(key, {
      lifecycle_state: 'verified',
      post_status: 'verified',
      post_link: 'https://facebook.invalid/groups/audit/posts/audit',
    });
    const row = (
      await db.query(
        `SELECT lifecycle_state FROM post_logs WHERE idempotency_key=$1`,
        [key],
      )
    ).rows[0];
    const result = {
      first_should_post: first.should_post,
      second_should_post: second.should_post,
      final_state: row?.lifecycle_state,
    };
    console.log(JSON.stringify(result));
    if (
      result.first_should_post !== true ||
      result.second_should_post !== false ||
      result.final_state !== 'verified'
    ) {
      throw new Error(`ledger verification failed: ${JSON.stringify(result)}`);
    }

    await db.ensurePostRunQueueTable();
    await db.query(
      `INSERT INTO post_run_queue (id, assignment_ids, status, run_id, started_at)
       VALUES ($1, '[]'::jsonb, 'running', $2, now())`,
      [queueId, evidenceRunId],
    );
    await db.createRunLog({
      run_id: evidenceRunId,
      level: 'success',
      message: 'synthetic success without post evidence',
    });
    const completed = await db.completePostRunJob(queueId, {
      ok: true,
      run_id: evidenceRunId,
      message: 'synthetic completion',
    });
    const evidenceResult = {
      missing_evidence_status: completed?.status,
      missing_evidence_error: completed?.error,
    };
    console.log(JSON.stringify(evidenceResult));
    if (
      evidenceResult.missing_evidence_status !== 'failed' ||
      !String(evidenceResult.missing_evidence_error || '').startsWith('post_evidence_missing')
    ) {
      throw new Error(`evidence verification failed: ${JSON.stringify(evidenceResult)}`);
    }
  } finally {
    await db.query(`DELETE FROM post_logs WHERE idempotency_key=$1`, [key]).catch(() => {});
    await db.query(`DELETE FROM run_logs WHERE run_id=$1`, [evidenceRunId]).catch(() => {});
    await db.query(`DELETE FROM post_run_queue WHERE id=$1`, [queueId]).catch(() => {});
    await db.getPool().end();
  }
}

main().catch(async (error) => {
  console.error(error.message || String(error));
  await db.getPool().end().catch(() => {});
  process.exit(1);
});
